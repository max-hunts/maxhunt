// The dapp layer. It knows nothing about the Demo Wallet or the simulated node:
// it talks to an EIP-1193 provider through viem, exactly as it would talk to an
// injected browser wallet. Reads come from contract events, writes are ordinary
// contract calls that the wallet has to approve.
import { createClient, custom, defineChain, type Address, type Client, type Hex } from 'viem';
// Individual actions instead of createPublicClient/createWalletClient: those
// bundle every action viem has, this keeps only the six the dapp uses.
import { getBalance, getBlockNumber, getContractEvents, requestAddresses, waitForTransactionReceipt, writeContract } from 'viem/actions';
import { board } from '../canvas/board.ts';
import type { PixelLog } from '../canvas/pixels.ts';
import { pixelsAbi } from '../chain/pixelsArtifact.ts';
import { BLOCK_GAS_LIMIT, CHAIN_ID, CHAIN_NAME, CURRENCY, GAS_PRICE_WEI, GRID, PIXEL_PRICE_WEI } from '../chain/types.ts';
import { bytes3, sameAddr } from '../lib/format.ts';
import { activeAccount, getApp, setApp, toast, type BatchStatus, type Mode, type TickerItem } from '../store.ts';
import { decodeRevert, revertFromError, type Eip1193Provider } from '../wallet/wallet.ts';

export const chain = defineChain({
  id: CHAIN_ID,
  name: CHAIN_NAME,
  nativeCurrency: { name: CURRENCY, symbol: CURRENCY, decimals: 18 },
  rpcUrls: { default: { http: [] } },
});

let client: Client | undefined;
let contract: Address;
let lastBlock = 0n;
let syncing = false;
let timer = 0;

export function initDapp(provider: Eip1193Provider, address: Address, fromBlock: number): void {
  const c = createClient({ chain, transport: custom(provider, { retryCount: 0 }), pollingInterval: 500 });
  client = c;
  contract = address;
  lastBlock = BigInt(fromBlock);
  window.clearInterval(timer);
  timer = window.setInterval(() => void sync(), 1000);
  void sync();
  void getBalance(c, { address })
    .then((spent) => setApp((s) => ({ stats: { ...s.stats, spentWei: spent.toString() } })))
    .catch(() => {});
}

/** Ask the wallet for an account (opens its connect screen if needed). */
export async function connect(): Promise<Address | null> {
  if (!client) return null;
  try {
    const [account] = await requestAddresses(client);
    return account ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- reading

/** Pull new contract events since the last block we saw and apply them to the canvas. */
async function sync(): Promise<void> {
  const c = client;
  if (syncing || !c) return;
  syncing = true;
  try {
    const head = await getBlockNumber(c, { cacheTime: 0 });
    if (head > lastBlock) {
      const events = await getContractEvents(c, { address: contract, abi: pixelsAbi, fromBlock: lastBlock + 1n, toBlock: head });
      const logs: PixelLog[] = [];
      for (const e of events) {
        const base = { txHash: e.transactionHash ?? '', blockNumber: Number(e.blockNumber ?? 0n) };
        if (e.eventName === 'PixelMinted') {
          logs.push({ ...base, kind: 'minted', pixelId: Number(e.args.pixelId), owner: e.args.to as Address });
        } else if (e.eventName === 'PixelColourChanged') {
          logs.push({
            ...base,
            kind: 'colour',
            pixelId: Number(e.args.pixelId),
            owner: e.args.owner as Address,
            colour: parseInt(String(e.args.newColour).slice(2), 16),
            url: e.args.newURL ?? '',
          });
        }
      }
      board.applyLogs(logs);
      pushTicker(logs);
      lastBlock = head;
      const spent = await getBalance(c, { address: contract });
      setApp((s) => ({ chain: { ...s.chain, block: Number(head) }, stats: { ...s.stats, spentWei: spent.toString() } }));
    }
  } catch (err) {
    console.warn('[polypaint] event sync failed', err);
  } finally {
    syncing = false;
  }
}

function pushTicker(logs: PixelLog[]): void {
  if (!logs.length) return;
  const me = activeAccount();
  const byTx = new Map<string, { minted: Set<number>; recolored: number[]; who: Address; block: number; first: number }>();
  for (const l of logs) {
    let t = byTx.get(l.txHash);
    if (!t) byTx.set(l.txHash, (t = { minted: new Set(), recolored: [], who: l.owner, block: l.blockNumber, first: l.pixelId }));
    if (l.kind === 'minted') t.minted.add(l.pixelId);
    else if (!t.minted.has(l.pixelId)) t.recolored.push(l.pixelId);
  }
  const items: TickerItem[] = [];
  for (const [hash, t] of byTx) {
    const buy = t.minted.size > 0;
    items.push({
      key: hash,
      kind: buy ? 'buy' : 'recolor',
      who: t.who,
      count: buy ? t.minted.size : t.recolored.length,
      x: t.first % GRID,
      y: (t.first / GRID) | 0,
      ts: Date.now(),
      block: t.block,
      mine: sameAddr(t.who, me),
    });
  }
  setApp((s) => ({ ticker: [...items.reverse(), ...s.ticker].slice(0, 24) }));
}

// ---------------------------------------------------------------- writing

/** Storage slots a URL string occupies: none when empty, one when short, length + data slots when long. */
const urlSlots = (url: string) => {
  const n = new TextEncoder().encode(url).length;
  return n === 0 ? 0 : n < 32 ? 1 : 1 + Math.ceil(n / 32);
};

/** Measured against the real bytecode: about 79k gas per minted pixel and about 15k per recolor in a batch, plus URL storage. */
export function gasPerPixel(kind: Mode | 'relink', url: string): number {
  return kind === 'buy' ? 80_000 + urlSlots(url) * 22_100 : 15_500 + urlSlots(url) * 22_100;
}

export function estimateFeeWei(kind: Mode, count: number, url: string): bigint {
  if (!count) return 0n;
  const size = batchSize(kind, url);
  const txs = Math.ceil(count / size);
  return (BigInt(txs) * 21_000n + BigInt(count) * BigInt(gasPerPixel(kind, url))) * GAS_PRICE_WEI;
}

/** How many pixels fit in one transaction without crowding the block gas limit. */
export function batchSize(kind: Mode | 'relink', url: string): number {
  const budget = (Number(BLOCK_GAS_LIMIT) * 3) / 4;
  return Math.max(1, Math.min(kind === 'buy' ? 250 : 1000, Math.floor(budget / gasPerPixel(kind, url))));
}

function setBatch(index: number, patch: { status: BatchStatus; hash?: Hex; reason?: string }): void {
  setApp((s) => (s.checkout ? { checkout: { ...s.checkout, batches: s.checkout.batches.map((b, i) => (i === index ? { ...b, ...patch } : b)) } } : {}));
}

async function send(kind: Mode | 'relink', account: Address, ids: number[], colours: number[], url: string): Promise<boolean> {
  const c = client;
  if (!c) return false;
  const size = batchSize(kind, url);
  const batches: { ids: number[]; colours: number[] }[] = [];
  for (let i = 0; i < ids.length; i += size) batches.push({ ids: ids.slice(i, i + size), colours: colours.slice(i, i + size) });
  setApp({ checkout: { kind, busy: true, batches: batches.map((b) => ({ n: b.ids.length, status: 'signing' as const })) } });

  const results = await Promise.all(
    batches.map(async (b, i) => {
      try {
        const args = [b.ids.map((id) => BigInt(id)), b.colours.map(bytes3), url] as const;
        const hash =
          kind === 'buy'
            ? await writeContract(c, { account, chain, address: contract, abi: pixelsAbi, functionName: 'mintMultiple', args, value: PIXEL_PRICE_WEI * BigInt(b.ids.length) })
            : await writeContract(c, { account, chain, address: contract, abi: pixelsAbi, functionName: 'changePixelColourMultiple', args });
        setBatch(i, { status: 'pending', hash });
        const receipt = await waitForTransactionReceipt(c, { hash, pollingInterval: 400, timeout: 120_000 });
        if (receipt.status === 'success') {
          setBatch(i, { status: 'confirmed', hash });
          if (kind !== 'relink') board.removeFromDraft(b.ids);
          return true;
        }
        const reason = decodeRevert((receipt as { revertReason?: Hex }).revertReason) ?? 'Execution reverted';
        setBatch(i, { status: 'reverted', hash, reason });
        return false;
      } catch (err) {
        const code = (err as { code?: number; cause?: { code?: number } })?.code ?? (err as { cause?: { code?: number } })?.cause?.code;
        const message = err instanceof Error ? err.message.split('\n')[0] : 'Request failed';
        if (code === 4001 || /rejected/i.test(message)) setBatch(i, { status: 'rejected' });
        else setBatch(i, { status: 'failed', reason: revertFromError(err) ?? message });
        return false;
      }
    }),
  );
  setApp((s) => (s.checkout ? { checkout: { ...s.checkout, busy: false } } : {}));
  void sync();
  return results.every(Boolean);
}

/** Buy or recolor the draft, split into as many transactions as the gas limit requires. */
export async function checkout(): Promise<void> {
  const s = getApp();
  if (s.checkout?.busy) return;
  if (s.chain.status !== 'ready') {
    toast('The simulated chain is still booting.', 'info');
    return;
  }
  const account = activeAccount() ?? (await connect());
  if (!account) return;
  const { ids, colours, flagged } = board.split();
  const kind = s.mode;
  let sendIds = ids, sendColours = colours;
  if (s.includeFlagged && flagged.length) {
    // The visitor asked to send flagged pixels anyway, to watch the contract refuse them.
    const all = [...ids, ...flagged].sort((a, b) => a - b);
    sendIds = all;
    sendColours = all.map((id) => board.draft.get(id)!);
  }
  if (!sendIds.length) {
    toast(kind === 'buy' ? 'Nothing to buy: paint some unowned pixels first.' : 'Nothing to recolor: paint over pixels you own.', 'info');
    return;
  }
  const ok = await send(kind, account, sendIds, sendColours, s.link.trim());
  const n = getApp().checkout?.batches.filter((b) => b.status === 'confirmed').reduce((a, b) => a + b.n, 0) ?? 0;
  if (ok) toast(kind === 'buy' ? `Bought ${n.toLocaleString('en-US')} pixels.` : `Recolored ${n.toLocaleString('en-US')} pixels.`, 'ok');
  else if (getApp().checkout?.batches.some((b) => b.status === 'reverted')) toast(`Reverted: ${getApp().checkout!.batches.find((b) => b.status === 'reverted')!.reason}`, 'warn');
}

/** Set (or try to set) the link on pixels you own, keeping their colors. */
export async function relink(ids: number[], url: string): Promise<void> {
  if (getApp().checkout?.busy) return;
  const account = activeAccount() ?? (await connect());
  if (!account) return;
  const sorted = [...ids].sort((a, b) => a - b);
  const ok = await send('relink', account, sorted, sorted.map((id) => board.mirror.colours[id]), url.trim());
  if (ok) toast('Link transaction confirmed.', 'ok');
}

export function dismissCheckout(): void {
  if (!getApp().checkout?.busy) setApp({ checkout: null });
}
