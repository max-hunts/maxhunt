// The simulated node against the real Pixels bytecode.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decodeEventLog, encodeFunctionData, getAddress, numberToHex, parseEther } from 'viem';
import type { Abi, Hex, Log } from 'viem';
import { BOTS, DevNode } from '../src/chain/node.ts';
import { pixelsAbi, pixelsDeployedBytecode } from '../src/chain/pixelsArtifact.ts';
import { BASE_FEE_WEI, BLOCK_GAS_LIMIT, GAS_PRICE_WEI } from '../src/chain/types.ts';
import { PRICE, balanceOf, newAccount, nonceOf, read, reason, rejection, rgb, send, sign } from './helpers.ts';

const events = (logs: unknown[]) =>
  (logs as Log[]).map((log) => decodeEventLog({ abi: pixelsAbi as Abi, data: log.data, topics: log.topics }) as unknown as { eventName: string; args: Record<string, unknown> });

test('deploying the artifact bytecode yields the artifact runtime code', async () => {
  const node = await DevNode.create();
  const code = await node.request<Hex>({ method: 'eth_getCode', params: [node.contract, 'latest'] });
  assert.equal(code, pixelsDeployedBytecode);
  assert.equal(await read(node, 'name'), 'Pixels');
  assert.equal(await read(node, 'symbol'), 'PIX');
  assert.equal(await read(node, '_pixelPrice'), PRICE);
  assert.equal(await read(node, '_totalPixels'), 1_000_000n);
  assert.equal(await node.request({ method: 'eth_chainId' }), '0x89');
});

test('a signed mint moves exactly value + gas and emits the contract events', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const before = await balanceOf(node, alice.address);
  const receipt = await send(node, alice, 'mint', [4242n, rgb(0xff6b3d), 'https://example.org'], { value: PRICE });

  assert.equal(receipt.status, '0x1');
  assert.equal(BigInt(receipt.effectiveGasPrice), GAS_PRICE_WEI);
  const spent = before - (await balanceOf(node, alice.address));
  assert.equal(spent, PRICE + BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice));
  assert.equal(await balanceOf(node, node.contract), PRICE);
  assert.equal(await nonceOf(node, alice.address), 1);

  const decoded = events(receipt.logs);
  assert.deepEqual(decoded.map((e) => e.eventName), ['Transfer', 'PixelMinted', 'PixelColourChanged']);
  assert.equal(decoded[1].args.pixelId, 4242n);
  assert.equal(decoded[1].args.to, alice.address);
  assert.equal(decoded[2].args.newColour, rgb(0xff6b3d));
  assert.equal(decoded[2].args.newURL, 'https://example.org');

  assert.equal(await read(node, 'ownerOf', [4242n]), alice.address);
  assert.equal(await read(node, 'getPixelColour', [4242n]), rgb(0xff6b3d));
  assert.equal(await read(node, 'getPixelCustomURL', [4242n]), 'https://example.org');
  assert.equal(await read(node, 'getPixelColour', [4243n]), '0x000001'); // the contract's "unowned" marker

  // The node's mirror of the canvas follows contract storage.
  assert.equal(node.table.owners[node.table.ownerIdx[4242] - 1], alice.address);
  assert.equal(node.table.colours[4242], 0xff6b3d);
  assert.equal(node.table.urls[node.table.urlIdx[4242] - 1], 'https://example.org');
});

test('minting an owned pixel reverts with the contract message, costs gas and bumps the nonce', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const bob = await newAccount(node);
  await send(node, alice, 'mint', [7n, rgb(0x111111), ''], { value: PRICE });

  // eth_call and eth_estimateGas carry the revert data.
  const data = encodeFunctionData({ abi: pixelsAbi as Abi, functionName: 'mint', args: [7n, rgb(0x222222), ''] });
  for (const method of ['eth_call', 'eth_estimateGas']) {
    const err = await rejection(node.request({ method, params: [{ from: bob.address, to: node.contract, data, value: numberToHex(PRICE) }, 'latest'] }));
    assert.equal(err.code, 3);
    assert.match(err.message, /execution reverted: Pixel is already owned/);
    assert.equal(reason(err.data as Hex), 'Pixel is already owned');
  }

  const before = await balanceOf(node, bob.address);
  const receipt = await send(node, bob, 'mint', [7n, rgb(0x222222), ''], { value: PRICE });
  assert.equal(receipt.status, '0x0');
  assert.equal(reason(receipt.revertReason), 'Pixel is already owned');
  assert.equal(receipt.logs.length, 0);
  assert.equal(await nonceOf(node, bob.address), 1);
  // Gas is paid, the 0.4 is not.
  assert.equal(before - (await balanceOf(node, bob.address)), BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice));
  assert.equal(await read(node, 'ownerOf', [7n]), alice.address);
  assert.equal(await balanceOf(node, node.contract), PRICE);
});

test('underpaying and out-of-range ids revert with the contract messages', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const under = await send(node, alice, 'mint', [8n, rgb(0x333333), ''], { value: PRICE - 1n });
  assert.equal(under.status, '0x0');
  assert.equal(reason(under.revertReason), 'No/ Insufficient fees provided');
  const range = await send(node, alice, 'mint', [1_000_000n, rgb(0x333333), ''], { value: PRICE });
  assert.equal(reason(range.revertReason), 'Pixel out of range');
  // mintMultiple checks the total up front.
  const multi = await send(node, alice, 'mintMultiple', [[1n, 2n, 3n], [rgb(1), rgb(2), rgb(3)], ''], { value: PRICE * 2n });
  assert.equal(reason(multi.revertReason), 'No/ Insufficient fees provided');
  assert.equal(await read(node, 'isPixelOwned', [1n]), false);
});

test('recoloring: the owner can, anyone else reverts', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const bob = await newAccount(node);
  await send(node, alice, 'mintMultiple', [[10n, 11n], [rgb(0xaaaaaa), rgb(0xbbbbbb)], ''], { value: PRICE * 2n });

  const ok = await send(node, alice, 'changePixelColourMultiple', [[10n, 11n], [rgb(0x00ff00), rgb(0x000000)], '']);
  assert.equal(ok.status, '0x1');
  assert.deepEqual(events(ok.logs).map((e) => e.eventName), ['PixelColourChanged', 'PixelColourChanged']);
  assert.equal(await read(node, 'getPixelColour', [10n]), rgb(0x00ff00));
  assert.equal(await read(node, 'getPixelColour', [11n]), rgb(0x000000));
  assert.equal(node.table.colours[10], 0x00ff00);
  assert.equal(node.table.colours[11], 0);

  const no = await send(node, bob, 'changePixelColour', [10n, rgb(0xff0000), '']);
  assert.equal(no.status, '0x0');
  assert.equal(reason(no.revertReason), 'Sender is not Pixel owner');
  assert.equal(await read(node, 'getPixelColour', [10n]), rgb(0x00ff00));
});

test("the '/#' quirk: a pixel minted with the 2022 placeholder can never get a link", async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  await send(node, alice, 'mintMultiple', [[20n, 21n], [rgb(1), rgb(2)], '/#'], { value: PRICE * 2n });
  await send(node, alice, 'mint', [22n, rgb(3), ''], { value: PRICE });

  const stuck = await send(node, alice, 'changePixelColour', [20n, rgb(4), 'https://maxhunt.design']);
  assert.equal(stuck.status, '0x1');
  // The event announces the new link...
  assert.equal(events(stuck.logs)[0].args.newURL, 'https://maxhunt.design');
  // ...but storage still holds the placeholder, and the node's mirror follows storage.
  assert.equal(await read(node, 'getPixelCustomURL', [20n]), '/#');
  assert.equal(node.table.urls[node.table.urlIdx[20] - 1], '/#');
  assert.equal(await read(node, 'getPixelColour', [20n]), rgb(4));

  // A pixel minted with an empty link takes one later, including a long one.
  const long = 'https://example.org/a/rather/long/path/that/does/not/fit/in/one/storage/slot';
  await send(node, alice, 'changePixelColour', [22n, rgb(5), long]);
  assert.equal(await read(node, 'getPixelCustomURL', [22n]), long);
  assert.equal(node.table.urls[node.table.urlIdx[22] - 1], long);
});

test('invalid transactions are refused at the RPC boundary', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const submit = (raw: Hex) => node.request({ method: 'eth_sendRawTransaction', params: [raw] });

  const low = await sign(node, alice, 'mint', [1n, rgb(1), ''], { value: PRICE });
  await submit(low);
  await node.mine();
  assert.match((await rejection(submit(await sign(node, alice, 'mint', [2n, rgb(1), ''], { value: PRICE, nonce: 0 })))).message, /nonce too low/);
  assert.match((await rejection(submit(await sign(node, alice, 'mint', [2n, rgb(1), ''], { value: PRICE, nonce: 5 })))).message, /nonce too high/);
  assert.match((await rejection(submit(await sign(node, alice, 'mint', [2n, rgb(1), ''], { value: PRICE, chainId: 1 })))).message, /invalid chain id for signer: have 1 want 137/);
  assert.match((await rejection(submit(await sign(node, alice, 'mint', [2n, rgb(1), ''], { value: PRICE, gas: BLOCK_GAS_LIMIT + 1n })))).message, /exceeds block gas limit/);
  assert.match((await rejection(submit(await sign(node, alice, 'mint', [2n, rgb(1), ''], { value: PRICE, gas: 21_000n })))).message, /intrinsic gas too low/);
  assert.match((await rejection(submit(await sign(node, alice, 'mint', [2n, rgb(1), ''], { value: PRICE, gasPrice: BASE_FEE_WEI - 1n })))).message, /max fee per gas less than block base fee/);
  assert.match((await rejection(submit('0xdeadbeef'))).message, /could not decode/);

  const poor = await newAccount(node, '0.3');
  const err = await rejection(submit(await sign(node, poor, 'mint', [2n, rgb(1), ''], { value: PRICE, gas: 200_000n })));
  assert.equal(err.code, -32000);
  assert.match(err.message, /insufficient funds for gas \* price \+ value/);

  // Funds already committed to a queued transaction are not available to the next one.
  const tight = await newAccount(node, '1');
  await submit(await sign(node, tight, 'mint', [3n, rgb(1), ''], { value: PRICE, gas: 200_000n }));
  await submit(await sign(node, tight, 'mint', [4n, rgb(1), ''], { value: PRICE, gas: 200_000n }));
  assert.match((await rejection(submit(await sign(node, tight, 'mint', [5n, rgb(1), ''], { value: PRICE, gas: 200_000n })))).message, /insufficient funds/);
  await node.mine();
  assert.equal(await nonceOf(node, tight.address), 2);

  // Only the node's own dev accounts can use eth_sendTransaction.
  const data = encodeFunctionData({ abi: pixelsAbi as Abi, functionName: 'mint', args: [9n, rgb(1), ''] });
  assert.match((await rejection(node.request({ method: 'eth_sendTransaction', params: [{ from: alice.address, to: node.contract, data, value: numberToHex(PRICE) }] }))).message, /unknown account/);
  assert.equal((await rejection(node.request({ method: 'eth_nope' }))).code, -32601);
});

test('identical transactions cost identical gas (no warm slots leak between them)', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const bob = await newAccount(node);
  // Two first-time buyers, ids with the same calldata byte pattern.
  const a = await send(node, alice, 'mint', [0x0101n, rgb(0xabcdef), ''], { value: PRICE });
  const b = await send(node, bob, 'mint', [0x0202n, rgb(0xabcdef), ''], { value: PRICE });
  assert.equal(a.gasUsed, b.gasUsed);
  // The same recolor twice in a row, in the same block.
  const first = await sign(node, alice, 'changePixelColour', [0x0101n, rgb(0x123456), '']);
  const h1 = await node.request<Hex>({ method: 'eth_sendRawTransaction', params: [first] });
  const second = await sign(node, alice, 'changePixelColour', [0x0101n, rgb(0x654321), '']);
  const h2 = await node.request<Hex>({ method: 'eth_sendRawTransaction', params: [second] });
  const { txs } = await node.mine();
  assert.deepEqual(txs, [h1, h2]);
  const r1 = await node.request<{ gasUsed: Hex }>({ method: 'eth_getTransactionReceipt', params: [h1] });
  const r2 = await node.request<{ gasUsed: Hex }>({ method: 'eth_getTransactionReceipt', params: [h2] });
  assert.equal(r1.gasUsed, r2.gasUsed);
  // eth_estimateGas agrees with what a transaction then burns (no refunds here).
  const data = encodeFunctionData({ abi: pixelsAbi as Abi, functionName: 'changePixelColour', args: [0x0101n, rgb(0x777777), ''] });
  const estimate = await node.request<Hex>({ method: 'eth_estimateGas', params: [{ from: alice.address, to: node.contract, data }] });
  const r3 = await send(node, alice, 'changePixelColour', [0x0101n, rgb(0x777777), '']);
  assert.equal(BigInt(estimate), BigInt(r3.gasUsed));
});

test('250 pixels fit in a block, an oversized batch fails cleanly', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node, '5000');
  const ids = (n: number, base: number) => Array.from({ length: n }, (_, i) => BigInt(base + i));
  const colours = (n: number) => Array.from({ length: n }, (_, i) => rgb(0x100000 + i));

  const ok = await send(node, alice, 'mintMultiple', [ids(250, 1000), colours(250), ''], { value: PRICE * 250n, gas: BLOCK_GAS_LIMIT });
  assert.equal(ok.status, '0x1');
  assert.ok(BigInt(ok.gasUsed) < BLOCK_GAS_LIMIT);
  assert.ok(BigInt(ok.gasUsed) / 250n < 85_000n, `gas per pixel ${BigInt(ok.gasUsed) / 250n}`);
  assert.equal(ok.logs.length, 750);
  assert.equal(await read(node, 'balanceOf', [alice.address]), 250n);

  // 600 pixels need more gas than a block holds.
  const data = encodeFunctionData({ abi: pixelsAbi as Abi, functionName: 'mintMultiple', args: [ids(600, 5000), colours(600), ''] });
  const estimate = await rejection(node.request({ method: 'eth_estimateGas', params: [{ from: alice.address, to: node.contract, data, value: numberToHex(PRICE * 600n) }] }));
  assert.match(estimate.message, /gas required exceeds allowance/);
  const before = await balanceOf(node, alice.address);
  const oog = await send(node, alice, 'mintMultiple', [ids(600, 5000), colours(600), ''], { value: PRICE * 600n, gas: BLOCK_GAS_LIMIT });
  assert.equal(oog.status, '0x0');
  assert.equal(BigInt(oog.gasUsed), BLOCK_GAS_LIMIT);
  assert.equal(before - (await balanceOf(node, alice.address)), BLOCK_GAS_LIMIT * GAS_PRICE_WEI);
  assert.equal(await read(node, 'isPixelOwned', [5000n]), false);
  assert.equal(await read(node, 'balanceOf', [alice.address]), 250n);
  assert.equal(node.table.ownerIdx[5000], 0);

  // Two big transactions do not share a block: the second waits for the next one.
  const h1 = await node.request<Hex>({ method: 'eth_sendRawTransaction', params: [await sign(node, alice, 'mintMultiple', [ids(200, 20000), colours(200), ''], { value: PRICE * 200n, gas: 20_000_000n })] });
  const h2 = await node.request<Hex>({ method: 'eth_sendRawTransaction', params: [await sign(node, alice, 'mintMultiple', [ids(200, 30000), colours(200), ''], { value: PRICE * 200n, gas: 20_000_000n })] });
  assert.deepEqual((await node.mine()).txs, [h1]);
  assert.equal(await node.request({ method: 'eth_getTransactionReceipt', params: [h2] }), null);
  assert.deepEqual((await node.mine()).txs, [h2]);
});

test('logs, blocks and transactions are served like a node would', async () => {
  const node = await DevNode.create();
  const alice = await newAccount(node);
  const r = await send(node, alice, 'mintMultiple', [[50n, 51n], [rgb(1), rgb(2)], ''], { value: PRICE * 2n });
  await node.mine();

  const minted = await node.request<Log[]>({ method: 'eth_getLogs', params: [{ address: node.contract, fromBlock: '0x0', toBlock: 'latest', topics: [events(r.logs).length ? (r.logs as Log[])[1].topics[0] : null] }] });
  assert.equal(minted.length, 2);
  assert.deepEqual(minted.map((l) => Number(l.logIndex)), [1, 4]);
  const none = await node.request<Log[]>({ method: 'eth_getLogs', params: [{ address: getAddress('0x00000000000000000000000000000000000000aa'), fromBlock: '0x0' }] });
  assert.equal(none.length, 0);
  const byOwner = await node.request<Log[]>({ method: 'eth_getLogs', params: [{ fromBlock: '0x0', topics: [null, null, `0x${alice.address.slice(2).toLowerCase().padStart(64, '0')}`] }] });
  assert.equal(byOwner.length, 2); // the two Transfer events, indexed `to`

  const block = await node.request<{ number: Hex; transactions: Hex[]; baseFeePerGas: Hex; gasUsed: Hex }>({ method: 'eth_getBlockByNumber', params: [r.blockNumber, false] });
  assert.deepEqual(block.transactions, [r.transactionHash]);
  assert.equal(BigInt(block.baseFeePerGas), BASE_FEE_WEI);
  assert.equal(block.gasUsed, r.gasUsed);
  const tx = await node.request<{ from: string; to: string; nonce: Hex; blockNumber: Hex }>({ method: 'eth_getTransactionByHash', params: [r.transactionHash] });
  assert.equal(tx.from, alice.address.toLowerCase());
  assert.equal(tx.to, node.contract.toLowerCase());
  assert.equal(tx.blockNumber, r.blockNumber);
  assert.equal(await node.request({ method: 'eth_getTransactionReceipt', params: [`0x${'11'.repeat(32)}`] }), null);
});

test('the bots buy through the normal transaction path', async () => {
  const node = await DevNode.create();
  const hash = await node.botAct();
  assert.ok(hash);
  const { txs } = await node.mine();
  assert.deepEqual(txs, [hash]);
  const receipt = await node.request<{ status: Hex; from: string; logs: unknown[] }>({ method: 'eth_getTransactionReceipt', params: [hash] });
  assert.equal(receipt.status, '0x1');
  assert.ok(BOTS.map((b) => b.toLowerCase()).includes(receipt.from));
  const owned = node.table.ownerIdx.reduce((n, v) => n + (v ? 1 : 0), 0);
  assert.ok(owned >= 16 && owned <= 64, `sprite of ${owned} px`);
  assert.equal(receipt.logs.length, owned * 3);
  assert.equal(await balanceOf(node, node.contract), PRICE * BigInt(owned));
  // A pixel named by a pending mint is off limits to the bots.
  const alice = await newAccount(node);
  await node.request({ method: 'eth_sendRawTransaction', params: [await sign(node, alice, 'mint', [999_999n, rgb(1), ''], { value: parseEther('0.4') })] });
  assert.equal(node.isFree(999_999), false);
  await node.mine();
  assert.equal(node.isFree(999_999), false);
  assert.equal(node.isFree(999_998), true);
});
