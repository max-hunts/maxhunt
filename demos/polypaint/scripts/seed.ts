// Build-time seeding (npm run seed).
//
// Paints the starting canvas by sending real mintMultiple transactions to the
// real Pixels bytecode in the same simulated node the browser runs, then
// exports the resulting contract state in the compact seed format and proves
// that a node booted from that file answers exactly like the one that minted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bytesToHex, decodeFunctionResult, encodeFunctionData, numberToHex, parseEther } from 'viem';
import type { Hex } from 'viem';
import { BOTS, DevNode } from '../src/chain/node.ts';
import { pixelsAbi } from '../src/chain/pixelsArtifact.ts';
import { decodeSeed } from '../src/chain/seed.ts';
import { mappingSlot } from '../src/chain/state.ts';
import { mulberry32 } from '../src/chain/sprites.ts';
import { PIXEL_PRICE_WEI, SLOT, TOTAL_PIXELS } from '../src/chain/types.ts';
import type { DemoReceipt } from '../src/chain/types.ts';
import { buildScene } from './art/scene.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'public/seed.bin');

/** Pixels per transaction: about 79k gas each without a link, about 100k with one. */
const BATCH = 300;
const BATCH_WITH_URL = 240;
const GAS_PER_PIXEL = 85_000n;
const GAS_PER_PIXEL_WITH_URL = 105_000n;
/** `npm run seed -- --quick` checks a 5% sample instead of every pixel (for iterating on the art). */
const QUICK = process.argv.includes('--quick');
/** Seeded history starts when the original went live. */
const GENESIS_MS = Date.UTC(2022, 1, 14, 12, 0, 0);

const rgb = (c: number): Hex => numberToHex(c, { size: 3 });
const since = (t: number) => `${((performance.now() - t) / 1000).toFixed(1)}s`;

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(`seed verification failed: ${message}`);
}

async function main() {
  const started = performance.now();
  const { pieces, placed } = buildScene();
  console.log(`scene: ${pieces.length} pieces, ${placed.length} pixels`);

  let clock = GENESIS_MS;
  const node = await DevNode.create({ now: () => (clock += 2000) });
  for (const bot of BOTS) await node.request({ method: 'demo_setBalance', params: [bot, numberToHex(parseEther('1000000'))] });

  // One list of pixels per piece, in painting order, cut into transactions.
  const byPiece = new Map<number, { id: number; colour: number }[]>();
  for (const p of placed) {
    let list = byPiece.get(p.piece);
    if (!list) byPiece.set(p.piece, (list = []));
    list.push({ id: p.id, colour: p.colour });
  }
  const txs: { owner: number; url: string; ids: bigint[]; colours: Hex[] }[] = [];
  for (const [index, list] of [...byPiece.entries()].sort((a, b) => a[0] - b[0])) {
    const piece = pieces[index];
    list.sort((a, b) => a.id - b.id);
    const size = piece.url === '' ? BATCH : BATCH_WITH_URL;
    for (let i = 0; i < list.length; i += size) {
      const chunk = list.slice(i, i + size);
      txs.push({ owner: piece.owner, url: piece.url, ids: chunk.map((p) => BigInt(p.id)), colours: chunk.map((p) => rgb(p.colour)) });
    }
  }

  const mintStarted = performance.now();
  const hashes: Hex[] = [];
  let minted = 0;
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const data = encodeFunctionData({ abi: pixelsAbi, functionName: 'mintMultiple', args: [tx.ids, tx.colours, tx.url] });
    hashes.push(
      await node.request<Hex>({
        method: 'eth_sendTransaction',
        params: [
          {
            from: BOTS[tx.owner],
            to: node.contract,
            data,
            value: numberToHex(PIXEL_PRICE_WEI * BigInt(tx.ids.length)),
            // An explicit limit skips the node's own estimate, which would run every mint twice.
            gas: numberToHex(BigInt(tx.ids.length) * (tx.url === '' ? GAS_PER_PIXEL : GAS_PER_PIXEL_WITH_URL) + 200_000n),
          },
        ],
      }),
    );
    // A few small purchases can share a block. A big one fills it.
    if (tx.ids.length > 60 || i % 4 === 3) await node.mine();
    minted += tx.ids.length;
    if (i % 50 === 0) process.stdout.write(`\r  minting ${minted}/${placed.length} px`);
  }
  let gasTotal = 0n;
  for (let i = 0; i < hashes.length; i++) {
    let receipt = await node.request<DemoReceipt | null>({ method: 'eth_getTransactionReceipt', params: [hashes[i]] });
    for (let tries = 0; !receipt && tries < 50; tries++) {
      await node.mine();
      receipt = await node.request<DemoReceipt | null>({ method: 'eth_getTransactionReceipt', params: [hashes[i]] });
    }
    assert(receipt, `mint ${i} was never mined`);
    assert(receipt.status === '0x1', `mint ${i} reverted`);
    gasTotal += BigInt(receipt.gasUsed);
  }
  process.stdout.write(`\r  minted ${minted} px in ${txs.length} transactions (${since(mintStarted)})\n`);

  // Leave the seed wallets with ordinary-looking balances instead of a million each.
  const rng = mulberry32(137);
  for (const bot of BOTS) {
    const leftover = parseEther(String(40 + Math.floor(rng() * 900))) + BigInt(Math.floor(rng() * 1e15)) * 1000n;
    await node.request({ method: 'demo_setBalance', params: [bot, numberToHex(leftover)] });
  }

  let owned = 0;
  for (let i = 0; i < TOTAL_PIXELS; i++) if (node.table.ownerIdx[i] !== 0) owned++;
  assert(owned === placed.length, `mirror has ${owned} owned pixels, scene has ${placed.length}`);

  const bytes = await node.exportSeed();
  const decoded = decodeSeed(bytes);

  // ---- verification: a node booted from the file must match the one that minted ----
  const verifyStarted = performance.now();
  const boot = performance.now();
  const twin = await DevNode.create({ seed: bytes });
  const bootMs = performance.now() - boot;
  twin.finishIndex();
  assert(twin.contract === node.contract, 'contract address differs');

  const call = async (n: DevNode, functionName: 'ownerOf' | 'getPixelColour' | 'getPixelCustomURL' | 'isPixelOwned' | 'balanceOf', arg: bigint | Hex): Promise<Hex> => {
    const data = encodeFunctionData({ abi: pixelsAbi, functionName, args: [arg] as never });
    try {
      return await n.request<Hex>({ method: 'eth_call', params: [{ to: n.contract, data }, 'latest'] });
    } catch (err) {
      return `revert:${(err as Error).message}` as Hex;
    }
  };
  const READS = ['ownerOf', 'getPixelColour', 'getPixelCustomURL', 'isPixelOwned'] as const;
  const t = node.table;

  // Every seeded pixel: the twin's contract reads must equal what the minting node's contract stored.
  let checked = 0;
  const sampleRng = mulberry32(99);
  for (const p of placed) {
    if (QUICK && sampleRng() > 0.05) continue;
    const id = BigInt(p.id);
    const owner = t.owners[t.ownerIdx[p.id] - 1];
    const url = t.urlIdx[p.id] === 0 ? '' : t.urls[t.urlIdx[p.id] - 1];
    const [o, c, u, is] = await Promise.all(READS.map((fn) => call(twin, fn, id)));
    assert(decodeFunctionResult({ abi: pixelsAbi, functionName: 'ownerOf', data: o }) === owner, `ownerOf(${p.id})`);
    assert(decodeFunctionResult({ abi: pixelsAbi, functionName: 'getPixelColour', data: c }) === rgb(p.colour), `getPixelColour(${p.id})`);
    assert(decodeFunctionResult({ abi: pixelsAbi, functionName: 'getPixelCustomURL', data: u }) === url, `getPixelCustomURL(${p.id})`);
    assert(decodeFunctionResult({ abi: pixelsAbi, functionName: 'isPixelOwned', data: is }) === true, `isPixelOwned(${p.id})`);
    // On a sample, ask the minting node the same questions and compare raw answers and raw storage.
    if (QUICK || sampleRng() < 0.05) {
      const original = await Promise.all(READS.map((fn) => call(node, fn, id)));
      assert(original[0] === o && original[1] === c && original[2] === u && original[3] === is, `eth_call mismatch at ${p.id}`);
      for (const slot of [SLOT.owners, SLOT.pixelColours, SLOT.pixelOwned, SLOT.pixelURL]) {
        const key = bytesToHex(mappingSlot(p.id, slot));
        const a = await node.request<Hex>({ method: 'eth_getStorageAt', params: [node.contract, key, 'latest'] });
        const b = await twin.request<Hex>({ method: 'eth_getStorageAt', params: [twin.contract, key, 'latest'] });
        assert(a === b, `storage slot ${slot} of pixel ${p.id}`);
      }
    }
    if (++checked % 5000 === 0) process.stdout.write(`\r  verifying ${checked}/${placed.length} px`);
  }
  // A sample of pixels nobody owns must read as unowned on both nodes.
  const ownedSet = new Set(placed.map((p) => p.id));
  for (let n = 0; n < 2000; n++) {
    const id = Math.floor(sampleRng() * TOTAL_PIXELS);
    if (ownedSet.has(id)) continue;
    for (const fn of READS) {
      const a = await call(node, fn, BigInt(id));
      const b = await call(twin, fn, BigInt(id));
      assert(a === b, `${fn}(${id}) differs for an unowned pixel`);
    }
    assert((await call(twin, 'isPixelOwned', BigInt(id))).endsWith('0'), `unowned pixel ${id} reads as owned`);
  }
  for (const owner of t.owners) {
    assert((await call(node, 'balanceOf', owner)) === (await call(twin, 'balanceOf', owner)), `balanceOf(${owner})`);
  }
  for (const address of [node.contract, ...BOTS]) {
    const a = await node.request<Hex>({ method: 'eth_getBalance', params: [address, 'latest'] });
    const b = await twin.request<Hex>({ method: 'eth_getBalance', params: [address, 'latest'] });
    assert(a === b, `balance of ${address}`);
    const na = await node.request<Hex>({ method: 'eth_getTransactionCount', params: [address, 'latest'] });
    const nb = await twin.request<Hex>({ method: 'eth_getTransactionCount', params: [address, 'latest'] });
    assert(na === nb, `nonce of ${address}`);
  }
  assert(BigInt(await twin.request<Hex>({ method: 'eth_getBalance', params: [twin.contract, 'latest'] })) === PIXEL_PRICE_WEI * BigInt(owned), 'contract balance is not 0.4 per pixel');
  process.stdout.write(`\r  verified ${checked} px${QUICK ? ' (--quick sample)' : ''} against a node booted from the seed (${since(verifyStarted)})\n`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, bytes);

  const withUrl = placed.filter((p) => pieces[p.piece].url !== '').length;
  console.log(`\nwrote ${path.relative(root, OUT)}`);
  console.log(`  size            ${bytes.length} bytes (${(bytes.length / 1024).toFixed(1)} KB)`);
  console.log(`  pixels          ${owned} (${((owned / TOTAL_PIXELS) * 100).toFixed(2)}% of the canvas), ${withUrl} with a link`);
  console.log(`  owners          ${decoded.owners.length}, urls ${JSON.stringify(decoded.urls)}`);
  console.log(`  transactions    ${decoded.meta.txCount} (1 deploy + ${txs.length} mints), gas ${gasTotal}`);
  console.log(`  avg gas / px    ${(Number(gasTotal) / owned).toFixed(0)}`);
  console.log(`  block height    ${decoded.meta.blockNumber}`);
  console.log(`  contract        ${decoded.meta.contract} holding ${Number(decoded.meta.contractBalance / 10n ** 14n) / 1e4} POL`);
  const stats = twin.attachStats;
  console.log(`  boot from seed  ${bootMs.toFixed(0)} ms to ready, then ${stats?.ms.toFixed(0)} ms in the background for the storage index (${stats?.entries} slots, ${((stats?.indexBytes ?? 0) / 1e6).toFixed(1)} MB)`);
  console.log(`  total           ${since(started)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
