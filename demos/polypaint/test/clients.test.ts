// The node behind the things that will actually talk to it: viem clients over
// a custom() transport, and the worker/client message protocol.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ContractFunctionExecutionError, ContractFunctionRevertedError, createWalletClient, custom, numberToHex, parseEther } from 'viem';
import type { Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { DevNode } from '../src/chain/node.ts';
import { pixelsAbi } from '../src/chain/pixelsArtifact.ts';
import { BLOCK_TIME_MS } from '../src/chain/types.ts';
import type { NodeEvent } from '../src/chain/types.ts';
import { PRICE, chain, newAccount, publicClient, rejection, rgb, send } from './helpers.ts';

test('viem clients work against the node over a custom transport', async () => {
  const node = await DevNode.create();
  const client = publicClient(node);
  const alice = await newAccount(node);
  const bob = await newAccount(node);
  const wallet = createWalletClient({ account: alice, chain, transport: custom({ request: (args) => node.request(args) }) });
  const address = node.contract;

  assert.equal(await client.getChainId(), 137);
  assert.equal(await client.getBalance({ address: alice.address }), parseEther('1000'));
  assert.equal(await client.readContract({ address, abi: pixelsAbi, functionName: '_pixelPrice' }), PRICE);

  // simulate, estimate, then send an EIP-1559 transaction signed locally by viem.
  const args = [[10n, 11n, 12n], [rgb(1), rgb(2), rgb(3)], 'https://maxhunt.design'] as const;
  const { request } = await client.simulateContract({ account: alice, address, abi: pixelsAbi, functionName: 'mintMultiple', args, value: PRICE * 3n });
  const estimate = await client.estimateContractGas({ account: alice.address, address, abi: pixelsAbi, functionName: 'mintMultiple', args, value: PRICE * 3n });
  assert.ok(estimate > 250_000n && estimate < 400_000n, `estimate ${estimate}`);
  const hash = await wallet.writeContract(request);
  const waiting = client.waitForTransactionReceipt({ hash });
  await node.mine();
  const receipt = await waiting;
  assert.equal(receipt.status, 'success');
  assert.equal(receipt.type, 'eip1559');
  assert.equal(receipt.gasUsed, estimate);
  assert.equal(receipt.logs.length, 9);
  const tx = await client.getTransaction({ hash });
  assert.equal(tx.from.toLowerCase(), alice.address.toLowerCase());
  assert.equal(tx.type, 'eip1559');

  // Events through eth_getLogs.
  const minted = await client.getContractEvents({ address, abi: pixelsAbi, eventName: 'PixelMinted', fromBlock: 0n, toBlock: 'latest' });
  assert.deepEqual(minted.map((e) => e.args.pixelId), [10n, 11n, 12n]);
  assert.ok(minted.every((e) => e.args.to === alice.address));
  const changed = await client.getContractEvents({ address, abi: pixelsAbi, eventName: 'PixelColourChanged', fromBlock: receipt.blockNumber, toBlock: receipt.blockNumber });
  assert.deepEqual(changed.map((e) => e.args.newColour), [rgb(1), rgb(2), rgb(3)]);
  assert.equal((await client.getBlock()).number, receipt.blockNumber);

  // The contract's own revert reasons reach the dapp, decoded.
  for (const attempt of [
    () => client.simulateContract({ account: bob, address, abi: pixelsAbi, functionName: 'mint', args: [10n, rgb(9), ''], value: PRICE }),
    () => client.estimateContractGas({ account: bob.address, address, abi: pixelsAbi, functionName: 'mint', args: [10n, rgb(9), ''], value: PRICE }),
  ]) {
    const err = (await rejection(attempt())) as unknown as ContractFunctionExecutionError;
    assert.ok(err instanceof ContractFunctionExecutionError);
    const cause = err.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError;
    assert.equal(cause.reason, 'Pixel is already owned');
  }
  const notOwner = (await rejection(client.simulateContract({ account: bob, address, abi: pixelsAbi, functionName: 'changePixelColour', args: [10n, rgb(9), ''] }))) as unknown as ContractFunctionExecutionError;
  assert.equal((notOwner.walk((e) => e instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError).reason, 'Sender is not Pixel owner');

  // A reverted transaction still gets a receipt.
  const bobWallet = createWalletClient({ account: bob, chain, transport: custom({ request: (a) => node.request(a) }) });
  const doomed = await bobWallet.writeContract({ address, abi: pixelsAbi, functionName: 'mint', args: [10n, rgb(9), ''], value: PRICE, gas: 200_000n });
  const pending = client.waitForTransactionReceipt({ hash: doomed });
  await node.mine();
  assert.equal((await pending).status, 'reverted');
});

test('with autoMine the chain ticks, includes transactions and emits a snapshot', async () => {
  const seen: NodeEvent[] = [];
  const node = await DevNode.create({ autoMine: true, onEvent: (e) => seen.push(e) });
  try {
    assert.deepEqual(seen.map((e) => e.type), ['boot', 'boot', 'boot', 'boot', 'ready']);
    const alice = privateKeyToAccount(generatePrivateKey());
    await node.request({ method: 'demo_setBalance', params: [alice.address, numberToHex(parseEther('10'))] });
    const client = publicClient(node);
    const wallet = createWalletClient({ account: alice, chain, transport: custom({ request: (args) => node.request(args) }) });
    const start = node.blockNumber;
    const hash = await wallet.writeContract({ address: node.contract, abi: pixelsAbi, functionName: 'mint', args: [5n, rgb(0xff6b3d), ''], value: PRICE });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: BLOCK_TIME_MS * 3 });
    assert.equal(receipt.status, 'success');
    await new Promise((r) => setTimeout(r, 700));
    const blocks = seen.filter((e) => e.type === 'block');
    assert.ok(blocks.some((b) => b.type === 'block' && b.txHashes.includes(hash)));
    assert.ok(node.blockNumber > start);
    const snapshot = seen.filter((e) => e.type === 'snapshot').at(-1);
    assert.ok(snapshot && snapshot.type === 'snapshot' && snapshot.data.length > 20);
  } finally {
    node.stop();
  }
});

test('the worker and client speak the same protocol', async () => {
  // A stand-in for the browser's Worker: both ends run in this process and
  // every message is structured-cloned, as postMessage would.
  const g = globalThis as unknown as Record<string, unknown>;
  const scope: { onmessage: ((e: { data: unknown }) => void) | null; postMessage: (m: unknown) => void } = { onmessage: null, postMessage: () => {} };
  const instances: { onmessage: ((e: { data: unknown }) => void) | null }[] = [];
  class FakeWorker {
    onmessage: ((e: { data: unknown }) => void) | null = null;
    onerror: ((e: { message: string }) => void) | null = null;
    constructor() {
      instances.push(this);
      scope.postMessage = (m) => queueMicrotask(() => this.onmessage?.({ data: structuredClone(m) }));
    }
    postMessage(m: unknown) {
      queueMicrotask(() => scope.onmessage?.({ data: structuredClone(m) }));
    }
    terminate() {}
  }
  g.self = scope;
  g.Worker = FakeWorker;
  await import('../src/chain/worker.ts');
  const { createNodeClient, NodeRpcError } = await import('../src/chain/client.ts');

  // A seed to boot from, minted for real.
  const source = await DevNode.create();
  const alice = await newAccount(source);
  await send(source, alice, 'mint', [42n, rgb(0xff6b3d), ''], { value: PRICE });
  const seed = await source.exportSeed();

  const events: NodeEvent[] = [];
  const client = createNodeClient({ seed, bots: false, head: { blockNumber: source.blockNumber + 10, timestamp: 1_900_000_000 } });
  client.on((e) => events.push(e));
  // Requests sent before the chain is up just wait for it.
  const early = client.request<Hex>({ method: 'eth_blockNumber' });
  const ready = await client.ready;
  assert.equal(ready.contract, source.contract);
  assert.equal(ready.blockNumber, source.blockNumber + 10);
  assert.equal(Number(await early), source.blockNumber + 10);
  assert.ok(events.some((e) => e.type === 'boot' && e.phase === 'seed'));
  assert.ok(events.some((e) => e.type === 'ready'));

  const info = await client.request<{ contract: string; bots: string[]; seedBlock: number }>({ method: 'demo_info' });
  assert.equal(info.contract, source.contract);
  assert.equal(info.bots.length, 10);
  assert.equal(info.seedBlock, source.blockNumber);

  // Errors cross the boundary with their code and data.
  const err = await rejection(
    client.request({ method: 'eth_call', params: [{ from: alice.address, to: source.contract, data: '0xa0712d68000000000000000000000000000000000000000000000000000000000000002a', value: numberToHex(PRICE) }, 'latest'] }),
  );
  assert.ok(err instanceof NodeRpcError);
  assert.equal(err.code, 3);
  assert.match(err.message, /Pixel is already owned/);
  assert.equal(typeof err.data, 'string');
  assert.equal((await rejection(client.request({ method: 'eth_nope' }))).code, -32601);

  // viem on top of the client, as the dapp will use it.
  const viaClient = (await import('viem')).createPublicClient({ chain, transport: custom({ request: (args) => client.request(args) }) });
  assert.equal(await viaClient.readContract({ address: source.contract, abi: pixelsAbi, functionName: 'ownerOf', args: [42n] }), alice.address);

  // The worker node mines on its own: a block event arrives within a few seconds.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no block event')), BLOCK_TIME_MS * 3);
    client.on((e) => {
      if (e.type === 'block') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  client.terminate();
  assert.equal((await rejection(client.request({ method: 'eth_blockNumber' }))).message, 'node terminated');
  assert.equal(instances.length, 1);
});
