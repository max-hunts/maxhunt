// The Demo Wallet: a generic in-page wallet that behaves like a browser-extension
// wallet. It owns throwaway keys, exposes an EIP-1193 provider, asks the user to
// approve connections and transactions, signs real EIP-1559 transactions and
// hands them to the node as raw bytes. The dapp only ever sees `provider`.
import {
  decodeErrorResult,
  decodeFunctionData,
  hexToBigInt,
  numberToHex,
  type Address,
  type Hex,
} from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { pixelsAbi } from '../chain/pixelsArtifact.ts';
import {
  BLOCK_GAS_LIMIT,
  CHAIN_ID,
  GAS_PRICE_WEI,
  PRIORITY_FEE_WEI,
  type DemoReceipt,
  type NodeClient,
} from '../chain/types.ts';
import { formatPol, polToWei, sameAddr } from '../lib/format.ts';
import { loadJSON, saveJSON } from '../lib/storage.ts';
import { getApp, patchWallet, toast, type Activity, type PendingTx, type WalletAccount } from '../store.ts';

export const FAUCET_POL = 1000;
const LOW_POL = 2;
const ACCOUNT_LABELS = ['Account 1', 'Account 2', 'Low balance'];

export class ProviderRpcError extends Error {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ProviderRpcError';
    this.code = code;
    this.data = data;
  }
}

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}

const ERROR_ABI = [
  { type: 'error', name: 'Error', inputs: [{ name: 'message', type: 'string' }] },
  { type: 'error', name: 'Panic', inputs: [{ name: 'code', type: 'uint256' }] },
] as const;

/** Decode Solidity revert data (Error(string) / Panic) into a readable reason. */
export function decodeRevert(data: unknown): string | null {
  if (typeof data !== 'string' || !data.startsWith('0x') || data.length < 10) return null;
  try {
    const d = decodeErrorResult({ abi: ERROR_ABI, data: data as Hex });
    return d.errorName === 'Error' ? String(d.args[0]) : `Panic(${String(d.args[0])})`;
  } catch {
    return null;
  }
}

/** Dig the revert data out of whatever shape an RPC error arrives in. */
export function revertFromError(err: unknown): string | null {
  let e = err as { data?: unknown; cause?: unknown; message?: string } | undefined;
  for (let i = 0; e && i < 6; i++) {
    const d = e.data as { data?: unknown } | string | undefined;
    const r = decodeRevert(d) ?? (d && typeof d === 'object' ? decodeRevert(d.data) : null);
    if (r) return r;
    e = e.cause as typeof e;
  }
  return null;
}

interface StoredWallet {
  keys: Hex[];
  selected: number;
  connected: boolean;
}

type Waiter<T> = { resolve: (v: T) => void; reject: (e: unknown) => void };

class DemoWallet {
  private keys: Hex[] = [];
  private node: NodeClient | null = null;
  private nodeWaiters: (() => void)[] = [];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  private connectWaiters: Waiter<Address[]>[] = [];
  private txWaiters = new Map<number, Waiter<Hex>>();
  private nextId = 1;
  private busy = false;

  readonly provider: Eip1193Provider = {
    request: (args) => this.request(args.method, (args.params ?? []) as unknown[]),
    on: (event, listener) => {
      if (!this.listeners.has(event)) this.listeners.set(event, new Set());
      this.listeners.get(event)!.add(listener);
    },
    removeListener: (event, listener) => {
      this.listeners.get(event)?.delete(listener);
    },
  };

  /** Load the saved wallet or create a fresh one with three throwaway accounts. */
  init(): void {
    const saved = loadJSON<StoredWallet>('wallet');
    const valid = saved && Array.isArray(saved.keys) && saved.keys.length === 3 && saved.keys.every((k) => /^0x[0-9a-f]{64}$/i.test(k));
    this.keys = valid ? saved!.keys : [generatePrivateKey(), generatePrivateKey(), generatePrivateKey()];
    const accounts: WalletAccount[] = this.keys.map((k, i) => ({ address: privateKeyToAccount(k).address, label: ACCOUNT_LABELS[i] }));
    const activity = loadJSON<Activity[]>('activity') ?? [];
    patchWallet({
      accounts,
      selected: valid ? Math.min(Math.max(saved!.selected | 0, 0), 2) : 0,
      connected: valid ? !!saved!.connected : false,
      view: valid && saved!.connected ? 'home' : 'connect',
      // Anything still "pending" belonged to a chain session that is gone.
      activity: activity.map((a) => (a.status === 'pending' ? { ...a, status: 'dropped' as const } : a)),
    });
    this.persist();
  }

  private persist(): void {
    const w = getApp().wallet;
    saveJSON('wallet', { keys: this.keys, selected: w.selected, connected: w.connected } satisfies StoredWallet);
  }

  private persistActivity(): void {
    saveJSON('activity', getApp().wallet.activity.slice(0, 60));
  }

  /** Called once the simulated node has booted. */
  async attachNode(node: NodeClient): Promise<void> {
    this.node = node;
    // First run (or storage lost): give the fresh accounts their starting balance.
    for (let i = 0; i < this.keys.length; i++) {
      const address = getApp().wallet.accounts[i].address;
      const [bal, nonce] = await Promise.all([
        node.request<Hex>({ method: 'eth_getBalance', params: [address, 'latest'] }),
        node.request<Hex>({ method: 'eth_getTransactionCount', params: [address, 'latest'] }),
      ]);
      if (hexToBigInt(bal) === 0n && hexToBigInt(nonce) === 0n) {
        await node.request({ method: 'demo_setBalance', params: [address, numberToHex(polToWei(i === 2 ? LOW_POL : FAUCET_POL))] });
      }
    }
    await this.refreshBalances();
    node.on((e) => {
      if (e.type === 'block') void this.onBlock();
    });
    this.nodeWaiters.splice(0).forEach((fn) => fn());
  }

  private whenNode(): Promise<NodeClient> {
    if (this.node) return Promise.resolve(this.node);
    return new Promise((resolve) => this.nodeWaiters.push(() => resolve(this.node!)));
  }

  private emit(event: string, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(...args);
      } catch {
        /* a listener must not break the wallet */
      }
    });
  }

  private selectedAddress(): Address | null {
    const w = getApp().wallet;
    return w.connected ? (w.accounts[w.selected]?.address ?? null) : null;
  }

  async refreshBalances(): Promise<void> {
    const node = this.node;
    if (!node) return;
    const accounts = getApp().wallet.accounts;
    const values = await Promise.all(accounts.map((a) => node.request<Hex>({ method: 'eth_getBalance', params: [a.address, 'latest'] })));
    const balances: Record<string, string> = {};
    accounts.forEach((a, i) => (balances[a.address.toLowerCase()] = hexToBigInt(values[i]).toString()));
    patchWallet({ balances });
  }

  private async onBlock(): Promise<void> {
    const node = this.node!;
    const pending = getApp().wallet.activity.filter((a) => a.status === 'pending' && a.hash);
    let changed = false;
    for (const item of pending) {
      const r = await node.request<DemoReceipt | null>({ method: 'eth_getTransactionReceipt', params: [item.hash] });
      if (!r) continue;
      const ok = r.status === '0x1';
      const gasUsed = hexToBigInt(r.gasUsed);
      const update: Partial<Activity> = {
        status: ok ? 'confirmed' : 'reverted',
        block: Number(hexToBigInt(r.blockNumber)),
        gasUsed: gasUsed.toString(),
        fee: (gasUsed * hexToBigInt(r.effectiveGasPrice)).toString(),
        reason: ok ? undefined : (decodeRevert(r.revertReason) ?? 'Execution reverted'),
      };
      patchWallet({ activity: getApp().wallet.activity.map((a) => (a.id === item.id ? { ...a, ...update } : a)) });
      changed = true;
    }
    if (changed) this.persistActivity();
    await this.refreshBalances();
  }

  // ------------------------------------------------------------- EIP-1193

  private async request(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case 'eth_chainId':
        return numberToHex(CHAIN_ID);
      case 'net_version':
        return String(CHAIN_ID);
      case 'eth_accounts': {
        const a = this.selectedAddress();
        return a ? [a] : [];
      }
      case 'eth_requestAccounts': {
        const a = this.selectedAddress();
        if (a) return [a];
        patchWallet({ open: true, view: 'connect', connectRequested: true });
        return new Promise<Address[]>((resolve, reject) => this.connectWaiters.push({ resolve, reject }));
      }
      case 'wallet_switchEthereumChain': {
        const want = (params[0] as { chainId?: string } | undefined)?.chainId;
        if (want && Number(want) === CHAIN_ID) return null;
        throw new ProviderRpcError(4902, 'The Demo Wallet only knows the simulated Polygon chain.');
      }
      case 'eth_sendTransaction':
        return this.requestTransaction((params[0] ?? {}) as Record<string, string | undefined>);
      case 'eth_sign':
      case 'personal_sign':
      case 'eth_signTypedData_v4':
      case 'eth_signTransaction':
        throw new ProviderRpcError(4200, `${method} is not supported by the Demo Wallet.`);
      default: {
        if (method.startsWith('demo_')) throw new ProviderRpcError(4200, 'Dev methods are not exposed to dapps.');
        const node = await this.whenNode();
        return node.request({ method, params });
      }
    }
  }

  private async requestTransaction(tx: Record<string, string | undefined>): Promise<Hex> {
    const from = this.selectedAddress();
    if (!from || !sameAddr(from, tx.from)) throw new ProviderRpcError(4100, 'The requested account is not connected.');
    if (!tx.to) throw new ProviderRpcError(-32602, 'Contract creation is not supported in the demo.');
    const node = await this.whenNode();
    const to = tx.to as Address;
    const data = (tx.data ?? tx.input ?? '0x') as Hex;
    const value = tx.value ? hexToBigInt(tx.value as Hex) : 0n;

    // Describe the call for the confirm screen.
    let fn = 'Contract call';
    let summary = `${(data.length - 2) / 2} bytes of calldata`;
    let pixels = 0;
    try {
      const d = decodeFunctionData({ abi: pixelsAbi, data });
      fn = `Pixels.${d.functionName}()`;
      const args = (d.args ?? []) as readonly unknown[];
      if (Array.isArray(args[0])) {
        pixels = args[0].length;
        const url = String(args[2] ?? '');
        summary = `uint256[${pixels}] ids, bytes3[${pixels}] colours, string url${url ? ` = "${url.length > 26 ? `${url.slice(0, 26)}…` : url}"` : ''}`;
      } else {
        pixels = 1;
        summary = `pixel #${String(args[0])}`;
      }
    } catch {
      /* unknown calldata: keep the generic description */
    }

    // Simulate first, like a real wallet: get a gas limit, or learn that it will revert.
    let gas: bigint;
    let willRevert: string | null = null;
    const fallbackGas = 60_000n + BigInt(pixels) * (fn.includes('mint') ? 110_000n : 12_000n) + BigInt((data.length - 2) / 2) * 16n;
    try {
      const est = await node.request<Hex>({ method: 'eth_estimateGas', params: [{ from, to, data, value: numberToHex(value) }] });
      gas = (hexToBigInt(est) * 125n) / 100n;
    } catch (err) {
      willRevert = revertFromError(err);
      gas = willRevert ? 21_000n + BigInt((data.length - 2) / 2) * 16n + 80_000n : fallbackGas;
    }
    if (tx.gas && hexToBigInt(tx.gas as Hex) > 0n && !willRevert) gas = hexToBigInt(tx.gas as Hex);
    if (gas > BLOCK_GAS_LIMIT) gas = BLOCK_GAS_LIMIT;

    const id = this.nextId++;
    const pending: PendingTx = { id, from, to, data, value, gas, fn, summary, pixels, willRevert };
    patchWallet({ queue: [...getApp().wallet.queue, pending], open: true, view: 'confirm' });
    return new Promise<Hex>((resolve, reject) => this.txWaiters.set(id, { resolve, reject }));
  }

  // ---------------------------------------------------------- user actions

  /** Maximum a pending request can cost: value plus the full gas limit at the offered price. */
  static maxCost(tx: PendingTx): bigint {
    return tx.value + tx.gas * GAS_PRICE_WEI;
  }
  static estFee(tx: PendingTx): bigint {
    // Gas limit carries a 25% margin over the estimate; show the expected fee.
    return ((tx.gas * 100n) / 125n) * GAS_PRICE_WEI;
  }

  connect(index: number): void {
    patchWallet({ selected: index, connected: true, connectRequested: false, view: getApp().wallet.queue.length ? 'confirm' : 'home' });
    this.persist();
    const address = getApp().wallet.accounts[index].address;
    this.connectWaiters.splice(0).forEach((w) => w.resolve([address]));
    this.emit('connect', { chainId: numberToHex(CHAIN_ID) });
    this.emit('accountsChanged', [address]);
  }

  rejectConnect(): void {
    patchWallet({ connectRequested: false });
    this.connectWaiters.splice(0).forEach((w) => w.reject(new ProviderRpcError(4001, 'User rejected the request.')));
  }

  switchAccount(index: number): void {
    const w = getApp().wallet;
    if (index === w.selected || !w.accounts[index]) return;
    this.rejectAll('Account changed.');
    patchWallet({ selected: index });
    this.persist();
    if (w.connected) this.emit('accountsChanged', [w.accounts[index].address]);
  }

  disconnect(): void {
    this.rejectAll('Wallet disconnected.');
    patchWallet({ connected: false, view: 'connect' });
    this.persist();
    this.emit('accountsChanged', []);
  }

  async faucet(): Promise<void> {
    const node = this.node;
    const w = getApp().wallet;
    const account = w.accounts[w.selected];
    if (!node || !account) return;
    await node.request({ method: 'demo_setBalance', params: [account.address, numberToHex(polToWei(FAUCET_POL))] });
    await this.refreshBalances();
    this.addActivity({
      id: `faucet-${Date.now()}`,
      kind: 'faucet',
      title: `Faucet refill to ${FAUCET_POL.toLocaleString('en-US')} POL`,
      from: account.address,
      status: 'confirmed',
      value: '0',
      ts: Date.now(),
    });
    toast(`${account.label} refilled to ${FAUCET_POL.toLocaleString('en-US')} POL (dev-node faucet).`, 'ok');
  }

  private addActivity(item: Activity): void {
    patchWallet({ activity: [item, ...getApp().wallet.activity].slice(0, 60) });
    this.persistActivity();
  }

  reject(id: number, message = 'User rejected the request.'): void {
    const waiter = this.txWaiters.get(id);
    this.txWaiters.delete(id);
    const queue = getApp().wallet.queue.filter((t) => t.id !== id);
    patchWallet({ queue, view: queue.length ? 'confirm' : 'home' });
    waiter?.reject(new ProviderRpcError(4001, message));
  }

  rejectAll(message = 'User rejected the request.'): void {
    for (const t of [...getApp().wallet.queue]) this.reject(t.id, message);
  }

  /** Sign and submit queued requests, in order. Pass an id to confirm only that one. */
  async confirm(only?: number): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const node = await this.whenNode();
      const todo = getApp().wallet.queue.filter((t) => only === undefined || t.id === only);
      for (const tx of todo) {
        const waiter = this.txWaiters.get(tx.id);
        this.txWaiters.delete(tx.id);
        try {
          const index = getApp().wallet.accounts.findIndex((a) => sameAddr(a.address, tx.from));
          const account = privateKeyToAccount(this.keys[index]);
          const nonce = await node.request<Hex>({ method: 'eth_getTransactionCount', params: [tx.from, 'pending'] });
          const raw = await account.signTransaction({
            chainId: CHAIN_ID,
            type: 'eip1559',
            to: tx.to,
            data: tx.data,
            value: tx.value,
            gas: tx.gas,
            nonce: Number(hexToBigInt(nonce)),
            maxFeePerGas: GAS_PRICE_WEI,
            maxPriorityFeePerGas: PRIORITY_FEE_WEI,
          });
          const hash = await node.request<Hex>({ method: 'eth_sendRawTransaction', params: [raw] });
          const isMint = tx.fn.includes('mint');
          this.addActivity({
            id: hash,
            kind: isMint ? 'buy' : tx.fn.includes('changePixelColour') ? 'recolor' : 'other',
            title: isMint ? `Buy ${tx.pixels} px` : tx.fn.includes('changePixelColour') ? `Recolor ${tx.pixels} px` : tx.fn,
            from: tx.from,
            hash,
            status: 'pending',
            value: tx.value.toString(),
            pixels: tx.pixels,
            ts: Date.now(),
          });
          waiter?.resolve(hash);
        } catch (err) {
          const message = err instanceof Error ? err.message : ((err as { message?: string })?.message ?? 'Transaction failed to send.');
          toast(message, 'warn');
          waiter?.reject(new ProviderRpcError(-32000, message));
        }
        patchWallet({ queue: getApp().wallet.queue.filter((t) => t.id !== tx.id) });
      }
      patchWallet({ view: getApp().wallet.queue.length ? 'confirm' : 'activity' });
    } finally {
      this.busy = false;
    }
  }

  /** Closing the popup with requests waiting counts as rejecting them, like an extension. */
  close(): void {
    this.rejectAll();
    if (getApp().wallet.connectRequested) this.rejectConnect();
    patchWallet({ open: false });
  }

  open(): void {
    const w = getApp().wallet;
    patchWallet({ open: true, view: !w.connected ? 'connect' : w.queue.length ? 'confirm' : w.view === 'connect' || w.view === 'confirm' ? 'home' : w.view });
  }

  balanceOf(address?: string | null): bigint {
    const v = address ? getApp().wallet.balances[address.toLowerCase()] : undefined;
    return v ? BigInt(v) : 0n;
  }
}

export const wallet = new DemoWallet();
export { DemoWallet };
export const fmtPol = (wei: bigint | string, d = 4) => formatPol(typeof wei === 'string' ? BigInt(wei) : wei, d);
