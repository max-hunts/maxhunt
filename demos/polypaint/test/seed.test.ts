// Seed and delta codecs, booting from a seed, and resuming from a snapshot.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { bytesToHex } from 'viem';
import type { Address, Hex } from 'viem';
import { BOTS, DevNode } from '../src/chain/node.ts';
import { applyDelta, cloneTable, decodeDelta, decodeSeed, emptyTable, encodeDelta, encodeSeed, seedId } from '../src/chain/seed.ts';
import { mappingSlot } from '../src/chain/state.ts';
import { GRID, SLOT, TOTAL_PIXELS } from '../src/chain/types.ts';
import type { PixelTable, SeedMeta } from '../src/chain/types.ts';
import { PRICE, balanceOf, newAccount, nonceOf, read, reason, rgb, send } from './helpers.ts';

const LONG_URL = 'https://example.org/a/rather/long/path/that/does/not/fit/in/one/storage/slot';

function sameTable(a: PixelTable, b: PixelTable): void {
  assert.deepEqual(a.owners, b.owners);
  assert.deepEqual(a.urls, b.urls);
  for (let i = 0; i < TOTAL_PIXELS; i++) {
    if (a.ownerIdx[i] !== b.ownerIdx[i] || a.urlIdx[i] !== b.urlIdx[i] || (a.ownerIdx[i] !== 0 && a.colours[i] !== b.colours[i])) {
      assert.fail(`tables differ at pixel ${i}`);
    }
  }
}

/** A small canvas minted for real: three owners, short, long, placeholder and empty links. */
async function mintedNode() {
  const node = await DevNode.create({ now: () => 1_700_000_000_000 });
  const alice = await newAccount(node);
  const bob = await newAccount(node);
  const carol = await newAccount(node);
  await send(node, alice, 'mintMultiple', [[100n, 101n, 102n], [rgb(0xff0000), rgb(0x00ff00), rgb(0x0000ff)], ''], { value: PRICE * 3n });
  await send(node, bob, 'mintMultiple', [[2000n, 2001n], [rgb(0xabcdef), rgb(0x000000)], 'https://maxhunt.design'], { value: PRICE * 2n });
  await send(node, carol, 'mint', [999_999n, rgb(0x123456), LONG_URL], { value: PRICE });
  await send(node, carol, 'mint', [0n, rgb(0xffffff), '/#'], { value: PRICE });
  return { node, alice, bob, carol };
}

test('seed codec round trip, with one and two byte planes', () => {
  const meta: SeedMeta = {
    blockNumber: 12,
    timestamp: 1_650_000_000,
    contract: '0x39EaA2e3CCAA546b13a58422b21210Dfd26689f4',
    deployer: '0x00000000000000000000000000000000000000d1',
    contractBalance: 123_456_789_000_000_000_000n,
    accounts: [{ address: '0x00000000000000000000000000000000000000a1', balance: 2n ** 80n + 7n, nonce: 41 }],
    ownedCount: 3,
    txCount: 5,
  };
  for (const owners of [3, 300]) {
    const t = emptyTable();
    t.owners = Array.from({ length: owners }, (_, i) => `0x${(i + 1).toString(16).padStart(40, '0')}` as Address);
    t.urls = ['https://a.example', '/#'];
    t.ownerIdx[0] = 1;
    t.colours[0] = 0xff6b3d;
    t.ownerIdx[TOTAL_PIXELS - 1] = owners;
    t.colours[TOTAL_PIXELS - 1] = 0x000001;
    t.urlIdx[TOTAL_PIXELS - 1] = 2;
    t.ownerIdx[500 * GRID + 500] = 2;
    t.urlIdx[500 * GRID + 500] = 1;
    const bytes = encodeSeed(t, meta);
    assert.ok(bytes.length < 20_000, `${bytes.length} bytes for a nearly empty canvas`);
    const back = decodeSeed(bytes);
    sameTable(t, back);
    assert.deepEqual(back.meta, meta);
    assert.deepEqual(encodeSeed(back, back.meta), bytes); // byte-for-byte reproducible
    assert.equal(seedId(bytes).length, 16);
  }
  assert.throws(() => decodeSeed(new Uint8Array([1, 2, 3])));
});

test('delta codec round trip', () => {
  const delta = {
    seed: 'abcdef0123456789',
    blockNumber: 400,
    timestamp: 1_800_000_000,
    contractBalance: 5n * 10n ** 20n,
    accounts: [{ address: '0x00000000000000000000000000000000000000a1' as Address, balance: 10n ** 21n, nonce: 3 }],
    owners: ['0x00000000000000000000000000000000000000b2' as Address],
    urls: ['https://b.example'],
    pixels: [
      { id: 0, ownerIdx: 1, colour: 0xffffff, urlIdx: 0 },
      { id: 999_999, ownerIdx: 300, colour: 0x010203, urlIdx: 260 },
    ],
  };
  const text = encodeDelta(delta);
  assert.match(text, /^[A-Za-z0-9+/=]+$/);
  assert.deepEqual(decodeDelta(text), delta);
  assert.throws(() => decodeDelta('not base64 at all!'));
  assert.throws(() => decodeDelta(text.slice(0, 40)));
  // A delta that points outside the table is refused before anything is written.
  const t = emptyTable();
  assert.throws(() => applyDelta(t, delta));
  assert.equal(t.owners.length, 0);
  assert.equal(t.ownerIdx[0], 0);
});

test('a node booted from an exported seed answers exactly like the node that minted', async () => {
  const { node, alice, bob, carol } = await mintedNode();
  const seed = await node.exportSeed();
  const twin = await DevNode.create({ seed });

  assert.equal(twin.contract, node.contract);
  assert.equal(twin.blockNumber, node.blockNumber);
  sameTable(node.table, twin.table);
  for (const id of [100n, 101n, 102n, 2000n, 2001n, 999_999n, 0n]) {
    for (const fn of ['ownerOf', 'getPixelColour', 'getPixelCustomURL', 'isPixelOwned'] as const) {
      assert.deepEqual(await read(twin, fn, [id]), await read(node, fn, [id]), `${fn}(${id})`);
    }
    for (const slot of [SLOT.owners, SLOT.pixelColours, SLOT.pixelOwned, SLOT.pixelURL]) {
      const key = bytesToHex(mappingSlot(Number(id), slot));
      assert.equal(
        await twin.request({ method: 'eth_getStorageAt', params: [twin.contract, key, 'latest'] }),
        await node.request({ method: 'eth_getStorageAt', params: [node.contract, key, 'latest'] }),
        `slot ${slot} of pixel ${id}`,
      );
    }
  }
  assert.equal(await read(twin, 'getPixelCustomURL', [999_999n]), LONG_URL);
  assert.equal(await read(twin, 'getPixelCustomURL', [0n]), '/#');
  assert.equal(await read(twin, 'isPixelOwned', [103n]), false);
  for (const who of [alice, bob, carol]) {
    assert.equal(await read(twin, 'balanceOf', [who.address]), await read(node, 'balanceOf', [who.address]));
    assert.equal(await balanceOf(twin, who.address), await balanceOf(node, who.address));
    assert.equal(await nonceOf(twin, who.address), await nonceOf(node, who.address));
  }
  assert.equal(await balanceOf(twin, twin.contract), PRICE * 7n);
  assert.equal(await read(twin, 'getBalance'), PRICE * 7n);

  // Seeded ownership is enforced by the contract: buying a seeded pixel reverts...
  const dave = await newAccount(twin);
  const taken = await send(twin, dave, 'mint', [101n, rgb(0x999999), ''], { value: PRICE });
  assert.equal(taken.status, '0x0');
  assert.equal(reason(taken.revertReason), 'Pixel is already owned');
  // ...recoloring one that is not yours reverts...
  const notMine = await send(twin, dave, 'changePixelColour', [2000n, rgb(0x999999), '']);
  assert.equal(reason(notMine.revertReason), 'Sender is not Pixel owner');
  // ...a free one can be bought, and a seeded owner can still recolor (down to zero).
  const free = await send(twin, dave, 'mint', [103n, rgb(0x999999), ''], { value: PRICE });
  assert.equal(free.status, '0x1');
  assert.equal(await read(twin, 'ownerOf', [103n]), dave.address);
  const recolor = await send(twin, alice, 'changePixelColourMultiple', [[100n, 101n], [rgb(0x000000), rgb(0x424242)], '']);
  assert.equal(recolor.status, '0x1');
  assert.equal(await read(twin, 'getPixelColour', [100n]), rgb(0x000000)); // a zero write beats the seeded value
  assert.equal(await read(twin, 'getPixelColour', [101n]), rgb(0x424242));
  assert.equal(await read(twin, 'balanceOf', [alice.address]), 3n);
  // The '/#' quirk survives the round trip.
  await send(twin, carol, 'changePixelColour', [0n, rgb(0x111111), 'https://new.example']);
  assert.equal(await read(twin, 'getPixelCustomURL', [0n]), '/#');
  // The minting node was not touched by any of this.
  assert.equal(await read(node, 'getPixelColour', [100n]), rgb(0xff0000));
});

test('a snapshot restores owners, colors, links, balances, nonces and the block height', async () => {
  const { node, alice, carol } = await mintedNode();
  const seed = await node.exportSeed();
  const first = await DevNode.create({ seed });
  const dave = await newAccount(first, '250');
  await send(first, dave, 'mintMultiple', [[5000n, 5001n], [rgb(0x0a0b0c), rgb(0x0d0e0f)], LONG_URL + '/2'], { value: PRICE * 2n });
  await send(first, alice, 'changePixelColour', [100n, rgb(0x000000), 'https://alice.example']);
  await send(first, carol, 'changePixelColour', [0n, rgb(0x777777), 'https://ignored.example']);
  await send(first, dave, 'mint', [100n, rgb(1), ''], { value: PRICE }); // reverts: nonce and fee still move
  await first.mine();
  const snapshot = await first.request<string>({ method: 'demo_snapshot' });
  assert.ok(snapshot.length < 2000, `snapshot is ${snapshot.length} chars`);

  const second = await DevNode.create({ seed, restore: snapshot });
  assert.equal(second.blockNumber, first.blockNumber);
  sameTable(first.table, second.table);
  for (const id of [5000n, 5001n, 100n, 101n, 0n, 999_999n]) {
    for (const fn of ['ownerOf', 'getPixelColour', 'getPixelCustomURL', 'isPixelOwned'] as const) {
      assert.deepEqual(await read(second, fn, [id]), await read(first, fn, [id]), `${fn}(${id})`);
    }
  }
  assert.equal(await read(second, 'getPixelCustomURL', [5000n]), LONG_URL + '/2');
  assert.equal(await read(second, 'getPixelCustomURL', [100n]), 'https://alice.example');
  assert.equal(await read(second, 'getPixelCustomURL', [0n]), '/#');
  for (const who of [alice, carol, dave]) {
    assert.equal(await balanceOf(second, who.address), await balanceOf(first, who.address));
    assert.equal(await nonceOf(second, who.address), await nonceOf(first, who.address));
    assert.equal(await read(second, 'balanceOf', [who.address]), await read(first, 'balanceOf', [who.address]));
  }
  assert.equal(await nonceOf(second, dave.address), 2);
  assert.equal(await balanceOf(second, second.contract), PRICE * 9n);
  // The restored chain keeps working, and its next snapshot still carries the earlier changes.
  const more = await send(second, dave, 'changePixelColour', [5001n, rgb(0xeeeeee), '']);
  assert.equal(more.status, '0x1');
  const third = await DevNode.create({ seed, restore: await second.request<string>({ method: 'demo_snapshot' }) });
  sameTable(second.table, third.table);
  assert.equal(await read(third, 'getPixelColour', [5001n]), rgb(0xeeeeee));
  assert.equal(await read(third, 'getPixelColour', [100n]), rgb(0x000000));

  // Broken or foreign snapshots are ignored: the node boots from the plain seed.
  const otherSeed = await (await mintedNodeWithExtra()).exportSeed();
  for (const bad of ['garbage', snapshot.slice(0, 50), '', await (await DevNode.create({ seed: otherSeed })).request<string>({ method: 'demo_snapshot' })]) {
    const clean = await DevNode.create({ seed, restore: bad });
    assert.equal(clean.blockNumber, node.blockNumber);
    sameTable(node.table, clean.table);
    assert.equal(await read(clean, 'isPixelOwned', [5000n]), false);
    assert.equal(await read(clean, 'getPixelColour', [100n]), rgb(0xff0000));
  }
});

async function mintedNodeWithExtra(): Promise<DevNode> {
  const { node, alice } = await mintedNode();
  await send(node, alice, 'mint', [77n, rgb(7), ''], { value: PRICE });
  return node;
}

test('the block height never goes backwards across a reload', async () => {
  const { node } = await mintedNode();
  const seed = await node.exportSeed();
  const seedBlock = node.blockNumber;

  const first = await DevNode.create({ seed });
  const dave = await newAccount(first);
  await send(first, dave, 'mint', [300n, rgb(3), ''], { value: PRICE });
  const snapshot = await first.request<string>({ method: 'demo_snapshot' });
  const snapshotBlock = first.blockNumber;
  // The chain idles on: empty blocks, no new snapshot.
  for (let i = 0; i < 5; i++) await first.mine();
  const seen = { blockNumber: first.blockNumber, timestamp: 1_900_000_000 };
  assert.equal(seen.blockNumber, snapshotBlock + 5);

  const resumed = await DevNode.create({ seed, restore: snapshot, head: seen });
  assert.equal(resumed.blockNumber, seen.blockNumber);
  assert.equal(await read(resumed, 'ownerOf', [300n]), dave.address);
  const next = await resumed.mine();
  assert.equal(next.number, seen.blockNumber + 1);
  const block = await resumed.request<{ timestamp: Hex }>({ method: 'eth_getBlockByNumber', params: ['latest', false] });
  assert.ok(Number(block.timestamp) > seen.timestamp);
  assert.equal((await resumed.request<{ seedBlock: number }>({ method: 'demo_info' })).seedBlock, seedBlock);

  // No snapshot at all: the seed height or the hint, whichever is higher.
  assert.equal((await DevNode.create({ seed, head: seen })).blockNumber, seen.blockNumber);
  // A lower or malformed hint is ignored.
  const junk = [{ blockNumber: snapshotBlock - 1, timestamp: 1 }, { blockNumber: Number.NaN, timestamp: 1 }, { blockNumber: 1e30, timestamp: 1 }, { blockNumber: 12.5, timestamp: 1 }, { blockNumber: seen.blockNumber, timestamp: Number.NaN }, {} as never, 'nope' as never, null];
  for (const head of junk) {
    assert.equal((await DevNode.create({ seed, restore: snapshot, head })).blockNumber, snapshotBlock);
  }
  assert.equal((await DevNode.create({ seed, head: { blockNumber: seedBlock - 1, timestamp: 5 } })).blockNumber, seedBlock);
});

test('the shipped seed boots fast and holds the art it should', { skip: !fs.existsSync('public/seed.bin') }, async () => {
  const bytes = new Uint8Array(fs.readFileSync('public/seed.bin'));
  const decoded = decodeSeed(bytes);
  const started = performance.now();
  const node = await DevNode.create({ seed: bytes });
  const ready = performance.now() - started;
  assert.ok(ready < 1500, `ready in ${ready.toFixed(0)} ms`);
  assert.equal(node.attachStats?.complete, false); // the storage index is built lazily
  assert.equal(node.blockNumber, decoded.meta.blockNumber);

  let owned = 0;
  for (let i = 0; i < TOTAL_PIXELS; i++) if (decoded.ownerIdx[i] !== 0) owned++;
  assert.equal(owned, decoded.meta.ownedCount);
  assert.ok(owned > 60_000 && owned < 90_000, `${owned} seeded pixels`);
  assert.ok(bytes.length < 200_000, `seed.bin is ${bytes.length} bytes`);
  assert.equal(await balanceOf(node, node.contract), PRICE * BigInt(owned));
  assert.deepEqual([...decoded.owners].sort(), [...BOTS].sort());
  assert.ok(decoded.urls.includes('/#'));

  // The checker block a visitor is meant to bump into, at (522..533, 537..544).
  const checker = 537 * GRID + 522;
  assert.equal(await read(node, 'ownerOf', [BigInt(checker)]), BOTS[8]);
  assert.equal(await read(node, 'getPixelColour', [BigInt(checker)]), rgb(0x1b1b1f));
  assert.equal(await read(node, 'getPixelColour', [BigInt(checker + 1)]), rgb(0xffe45c));
  // The Shiba links home: every pixel with that link sits in its box and belongs to one wallet.
  const home = decoded.urls.indexOf('https://maxhunt.design') + 1;
  assert.ok(home > 0);
  const shiba = [...Array(TOTAL_PIXELS).keys()].filter((i) => decoded.urlIdx[i] === home);
  assert.ok(shiba.length > 500, `${shiba.length} Shiba pixels`);
  assert.ok(shiba.every((i) => i % GRID >= 488 && i % GRID < 526 && Math.floor(i / GRID) >= 470 && Math.floor(i / GRID) < 512));
  assert.equal(await read(node, 'getPixelCustomURL', [BigInt(shiba[0])]), 'https://maxhunt.design');
  assert.equal(await read(node, 'ownerOf', [BigInt(shiba[0])]), BOTS[1]);
  assert.equal(node.attachStats?.complete, true); // the first contract read finished the index

  const visitor = await newAccount(node);
  const taken = await send(node, visitor, 'mint', [BigInt(checker), rgb(0xff6b3d), ''], { value: PRICE });
  assert.equal(reason(taken.revertReason), 'Pixel is already owned');
  const free = [...Array(TOTAL_PIXELS).keys()].find((i) => decoded.ownerIdx[i] === 0)!;
  const bought = await send(node, visitor, 'mint', [BigInt(free), rgb(0xff6b3d), ''], { value: PRICE });
  assert.equal(bought.status, '0x1');
  assert.equal(await balanceOf(node, node.contract), PRICE * BigInt(owned + 1));

  // A copy of the table can be mutated without touching the decoded seed.
  const copy = cloneTable(decoded);
  copy.ownerIdx[free] = 1;
  assert.equal(decoded.ownerIdx[free], 0);
});
