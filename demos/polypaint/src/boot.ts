// Start-up order matters for perceived speed: paint the canvas from the shipped
// seed first, and only then load the EVM chunk and boot the chain in a worker.
import { board } from './canvas/board.ts';
import { applyDelta, decodeDelta, decodeSeed, seedId } from './chain/seed.ts';
import type { NodeClient } from './chain/types.ts';
import { initDapp } from './dapp/dapp.ts';
import { clearAll, loadJSON, loadString, saveJSON, saveString } from './lib/storage.ts';
import { getApp, setApp, useApp } from './store.ts';
import { wallet } from './wallet/wallet.ts';

let node: NodeClient | null = null;

interface Prefs {
  ribbon?: boolean;
  tourDone?: boolean;
  recent?: number[];
  colour?: number;
  bots?: boolean;
}

const nextPaint = () => new Promise<void>((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export async function boot(): Promise<void> {
  wallet.init();
  const prefs = loadJSON<Prefs>('prefs') ?? {};
  setApp((s) => ({
    ribbon: prefs.ribbon ?? true,
    tour: prefs.tourDone ? -1 : 0,
    recent: Array.isArray(prefs.recent) ? prefs.recent.slice(0, 6) : s.recent,
    colour: typeof prefs.colour === 'number' ? prefs.colour : s.colour,
  }));
  useApp.subscribe((s, p) => {
    if (s.ribbon !== p.ribbon || s.tour !== p.tour || s.recent !== p.recent || s.colour !== p.colour) {
      saveJSON('prefs', { ...(loadJSON<Prefs>('prefs') ?? {}), ribbon: s.ribbon, tourDone: s.tour < 0, recent: s.recent, colour: s.colour });
    }
  });

  let seedBytes: Uint8Array;
  const restore = loadString('chain');
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}seed.bin`);
    if (!res.ok) throw new Error(`seed.bin: HTTP ${res.status}`);
    seedBytes = new Uint8Array(await res.arrayBuffer());
    const seed = decodeSeed(seedBytes);
    if (restore) {
      try {
        // A snapshot only makes sense on top of the seed it was taken against.
        const delta = decodeDelta(restore);
        if (delta.seed === seedId(seedBytes)) applyDelta(seed, delta);
      } catch {
        /* a broken snapshot is ignored here; the node ignores it too */
      }
    }
    board.loadTable(seed);
    setApp((s) => ({ seedLoaded: true, chain: { ...s.chain, status: 'booting', phase: 'evm', progress: 0, block: seed.meta.blockNumber } }));
  } catch (err) {
    setApp((s) => ({ chain: { ...s.chain, status: 'error', error: err instanceof Error ? err.message : 'Could not load the canvas seed.' } }));
    return;
  }

  await nextPaint();
  try {
    const { createNodeClient } = await import('./chain/client.ts');
    // The last block this browser saw: empty blocks are not snapshotted, so without
    // this the block counter would step back a little after an idle reload.
    const head = loadJSON<{ blockNumber: number; timestamp: number }>('head');
    node = createNodeClient({ seed: seedBytes, restore, bots: prefs.bots ?? true, head });
    node.on((e) => {
      if (e.type === 'boot') setApp((s) => ({ chain: { ...s.chain, phase: e.phase, progress: e.progress } }));
      else if (e.type === 'snapshot') saveString('chain', e.data);
      else if (e.type === 'block') saveJSON('head', { blockNumber: e.number, timestamp: e.timestamp });
      else if (e.type === 'fatal') setApp((s) => ({ chain: { ...s.chain, status: 'error', error: e.message } }));
    });
    const { blockNumber, contract } = await node.ready;
    await wallet.attachNode(node);
    initDapp(wallet.provider, contract, blockNumber);
    setApp((s) => ({ chain: { ...s.chain, status: 'ready', progress: 1, block: blockNumber, contract } }));
    followView(node);
  } catch (err) {
    setApp((s) => ({ chain: { ...s.chain, status: 'error', error: err instanceof Error ? err.message : 'The in-browser chain failed to start.' } }));
  }
}

/** Tell the node where the visitor is looking, so the simulated buyers mostly mint where it can be seen. */
function followView(n: NodeClient): void {
  let last = '';
  const push = () => {
    const v = getApp().view;
    if (!v.w) return;
    const key = `${Math.round(v.x + v.w / (2 * v.zoom))},${Math.round(v.y + v.h / (2 * v.zoom))}`;
    if (key === last) return;
    last = key;
    const [x, y] = key.split(',').map(Number);
    void n.request({ method: 'demo_setFocus', params: [x, y] }).catch(() => {});
  };
  push();
  window.setInterval(push, 3000);
}

export function botsEnabled(): boolean {
  return (loadJSON<Prefs>('prefs') ?? {}).bots ?? true;
}

export function setBots(enabled: boolean): void {
  saveJSON('prefs', { ...(loadJSON<Prefs>('prefs') ?? {}), bots: enabled });
  void node?.request({ method: 'demo_setBots', params: [enabled] });
}

/** Wipe everything this demo stored and start again from the shipped seed. */
export function resetDemo(): void {
  clearAll();
  node?.terminate();
  // Keep the tour dismissed for people who already saw it this session.
  if (getApp().tour < 0) saveJSON('prefs', { tourDone: true });
  window.location.reload();
}
