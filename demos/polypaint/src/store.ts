// One small zustand store for UI state. Heavy data (the pixel tables, the draft
// map, the canvas itself) lives outside React in src/canvas and is referenced
// here only through version counters and derived summaries.
import { create } from 'zustand';
import type { Address, Hex } from 'viem';
import type { Bounds, PixelGroup } from './canvas/pixels.ts';

export type Tool = 'select' | 'rect' | 'brush' | 'fill' | 'erase' | 'stamp' | 'pan';
export type Mode = 'buy' | 'recolor';

export const PALETTE = [
  0xff6b3d, 0xffb23d, 0xffe45c, 0x7bd957, 0x2fc4d6, 0x4f7cff, 0x8a5cf6, 0xf25ca2,
  0xf4f1e8, 0xb9b6ad, 0x6b6a63, 0x1b1b1f, 0xa8452a, 0x2b8a6e, 0x274690, 0x5b2a86,
];

export interface BasketStats {
  /** Pixels in the draft. */
  total: number;
  /** Pixels the current mode can act on (unowned in Buy, yours in Recolor). */
  actionable: number;
  /** Draft pixels owned by someone else. */
  others: number;
  /** Draft pixels already owned by the connected account (flagged in Buy mode). */
  mine: number;
  /** Draft pixels nobody owns (flagged in Recolor mode). */
  free: number;
  bounds: Bounds | null;
}

export interface HoverInfo {
  x: number;
  y: number;
  id: number;
  colour: number | null;
  owner: Address | null;
  url: string;
  mine: boolean;
  draftColour: number | null;
  /** Client coordinates of the pixel's center. */
  sx: number;
  sy: number;
  pinned: boolean;
}

export interface TickerItem {
  key: string;
  kind: 'buy' | 'recolor';
  who: Address;
  count: number;
  x: number;
  y: number;
  ts: number;
  block: number;
  mine: boolean;
}

export type BatchStatus = 'signing' | 'pending' | 'confirmed' | 'reverted' | 'rejected' | 'failed';
export interface CheckoutBatch {
  n: number;
  status: BatchStatus;
  hash?: Hex;
  reason?: string;
}
export interface Checkout {
  kind: Mode | 'relink';
  busy: boolean;
  batches: CheckoutBatch[];
}

export interface WalletAccount {
  address: Address;
  label: string;
}

/** A transaction request waiting for the user in the wallet popup. */
export interface PendingTx {
  id: number;
  from: Address;
  to: Address;
  data: Hex;
  value: bigint;
  gas: bigint;
  /** Decoded for display. */
  fn: string;
  summary: string;
  pixels: number;
  /** Revert reason from the wallet's own simulation, if the call is expected to fail. */
  willRevert: string | null;
}

export type ActivityStatus = 'pending' | 'confirmed' | 'reverted' | 'dropped';
export interface Activity {
  id: string;
  kind: 'buy' | 'recolor' | 'faucet' | 'other';
  title: string;
  from: Address;
  hash?: Hex;
  status: ActivityStatus;
  value: string; // wei, decimal string (JSON friendly)
  fee?: string;
  gasUsed?: string;
  block?: number;
  reason?: string;
  pixels?: number;
  ts: number;
}

export type WalletView = 'connect' | 'home' | 'confirm' | 'activity';

export interface WalletState {
  accounts: WalletAccount[];
  balances: Record<string, string>; // lowercased address -> wei decimal string
  connected: boolean;
  selected: number;
  open: boolean;
  view: WalletView;
  queue: PendingTx[];
  activity: Activity[];
  /** True while a connect request from the dapp is waiting for the user. */
  connectRequested: boolean;
}

export interface ChainStatus {
  status: 'loading' | 'booting' | 'ready' | 'error';
  phase: string;
  progress: number;
  block: number;
  contract: Address | null;
  error?: string;
}

export interface Stats {
  owned: number;
  owners: number;
  spentWei: string;
}

export type SidePanel = 'basket' | 'mine';
export type Sheet = null | 'basket' | 'palette' | 'mine' | 'stats';

export interface AppState {
  chain: ChainStatus;
  seedLoaded: boolean;
  tool: Tool;
  mode: Mode;
  colour: number;
  recent: number[];
  link: string;
  basket: BasketStats;
  includeFlagged: boolean;
  hover: HoverInfo | null;
  view: { zoom: number; x: number; y: number; w: number; h: number };
  pointer: { x: number; y: number } | null;
  stats: Stats;
  ticker: TickerItem[];
  checkout: Checkout | null;
  wallet: WalletState;
  myGroups: PixelGroup[];
  myCount: number;
  panel: SidePanel;
  sheet: Sheet;
  ribbon: boolean;
  /** Onboarding step, -1 when finished or dismissed. */
  tour: number;
  toast: { text: string; tone: 'info' | 'ok' | 'warn'; key: number } | null;
  stamp: { w: number; h: number; name: string } | null;
  help: boolean;
}

export const EMPTY_BASKET: BasketStats = { total: 0, actionable: 0, others: 0, mine: 0, free: 0, bounds: null };

export const useApp = create<AppState>(() => ({
  chain: { status: 'loading', phase: 'seed', progress: 0, block: 0, contract: null },
  seedLoaded: false,
  tool: 'select',
  mode: 'buy',
  colour: PALETTE[0],
  recent: [],
  link: '',
  basket: EMPTY_BASKET,
  includeFlagged: false,
  hover: null,
  view: { zoom: 1, x: 0, y: 0, w: 0, h: 0 },
  pointer: null,
  stats: { owned: 0, owners: 0, spentWei: '0' },
  ticker: [],
  checkout: null,
  wallet: {
    accounts: [],
    balances: {},
    connected: false,
    selected: 0,
    open: false,
    view: 'connect',
    queue: [],
    activity: [],
    connectRequested: false,
  },
  myGroups: [],
  myCount: 0,
  panel: 'basket',
  sheet: null,
  ribbon: true,
  tour: -1,
  toast: null,
  stamp: null,
  help: false,
}));

export const getApp = useApp.getState;
export const setApp = useApp.setState;

export function patchWallet(patch: Partial<WalletState>): void {
  setApp((s) => ({ wallet: { ...s.wallet, ...patch } }));
}

let toastKey = 0;
export function toast(text: string, tone: 'info' | 'ok' | 'warn' = 'info'): void {
  setApp({ toast: { text, tone, key: ++toastKey } });
}

/** The connected account, or null when the wallet is not connected. */
export function activeAccount(s: AppState = getApp()): Address | null {
  const w = s.wallet;
  return w.connected && w.accounts[w.selected] ? w.accounts[w.selected].address : null;
}

export function pickColour(colour: number): void {
  setApp((s) => ({
    colour,
    recent: [colour, ...s.recent.filter((c) => c !== colour)].slice(0, 6),
  }));
}
