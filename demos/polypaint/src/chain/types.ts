// Shared contract between the simulated node (src/chain, runs in a Web Worker)
// and everything that talks to it (wallet, dapp layer, canvas).
import type { Address, Hex } from 'viem';

export const GRID = 1000;
export const TOTAL_PIXELS = GRID * GRID;

/** Polygon PoS chain id. The node is local, nothing is ever broadcast. */
export const CHAIN_ID = 137;
export const CHAIN_NAME = 'Polygon (simulated)';
export const CURRENCY = 'POL';

/** Pixels.sol `_pixelPrice`: 0.4 of the native token (MATIC in 2022, POL today). */
export const PIXEL_PRICE_WEI = 400_000_000_000_000_000n;

export const BLOCK_GAS_LIMIT = 30_000_000n;
export const BLOCK_TIME_MS = 2000;
/** Flat simulated fee market: constant base fee plus a constant suggested tip. */
export const BASE_FEE_WEI = 25_000_000_000n;
export const PRIORITY_FEE_WEI = 5_000_000_000n;
export const GAS_PRICE_WEI = BASE_FEE_WEI + PRIORITY_FEE_WEI;

/** Storage slots of the mappings in Pixels.sol (solc 0.8.10 layout, verified against a real deploy). */
export const SLOT = { owners: 2, balances: 3, pixelColours: 11, pixelOwned: 12, pixelURL: 13 } as const;

/**
 * The canvas as flat tables. Used for the shipped seed, for the main thread's
 * render/ownership mirror, and inside the node as the lazy backing store for
 * seeded contract storage.
 */
export interface PixelTable {
  /** 0 = unowned, otherwise (index + 1) into `owners`. Length TOTAL_PIXELS. */
  ownerIdx: Uint16Array;
  /** 0xRRGGBB. Only meaningful where ownerIdx != 0. Length TOTAL_PIXELS. */
  colours: Uint32Array;
  /** 0 = empty string, otherwise (index + 1) into `urls`. Length TOTAL_PIXELS. */
  urlIdx: Uint16Array;
  owners: Address[];
  urls: string[];
}

export interface SeedAccount {
  address: Address;
  balance: bigint;
  nonce: number;
}

export interface SeedMeta {
  /** Height of the last block mined while seeding. The browser chain continues from here. */
  blockNumber: number;
  timestamp: number;
  contract: Address;
  deployer: Address;
  /** Wei held by the Pixels contract (sum of all seeded mint payments). */
  contractBalance: bigint;
  /** Externally owned accounts that exist after seeding (deployer + the seed wallets). */
  accounts: SeedAccount[];
  ownedCount: number;
  txCount: number;
}

export interface DecodedSeed extends PixelTable {
  meta: SeedMeta;
}

export interface RpcRequest {
  method: string;
  params?: readonly unknown[];
}

/** JSON-RPC style error. `data` carries revert return data for eth_call / eth_estimateGas. */
export interface RpcErrorShape {
  code: number;
  message: string;
  data?: unknown;
}

export type NodeEvent =
  | { type: 'boot'; phase: 'evm' | 'deploy' | 'seed' | 'restore'; progress: number }
  | { type: 'ready'; blockNumber: number; contract: Address }
  | { type: 'block'; number: number; timestamp: number; txHashes: Hex[] }
  /** Compact post-seed state delta, ready to be put in localStorage by the main thread. */
  | { type: 'snapshot'; data: string }
  | { type: 'fatal'; message: string };

/** What the main thread holds. Backed by a lazily started Web Worker. */
export interface NodeClient {
  request<T = unknown>(req: RpcRequest): Promise<T>;
  on(listener: (e: NodeEvent) => void): () => void;
  /** Resolves once the chain has booted (EVM loaded, contract deployed, seed + snapshot applied). */
  ready: Promise<{ blockNumber: number; contract: Address }>;
  terminate(): void;
}

export interface NodeInfo {
  contract: Address;
  deployer: Address;
  /** Unlocked dev accounts the node itself uses for the simulated other buyers. */
  bots: Address[];
  chainId: number;
  blockGasLimit: Hex;
  blockTimeMs: number;
  seedBlock: number;
}

/**
 * Receipt as returned by eth_getTransactionReceipt. Standard fields plus a
 * Besu-style `revertReason` (raw return data of the failed call) so the wallet
 * can show why a transaction reverted without re-simulating it.
 */
export interface DemoReceipt {
  transactionHash: Hex;
  transactionIndex: Hex;
  blockHash: Hex;
  blockNumber: Hex;
  from: Address;
  to: Address | null;
  contractAddress: Address | null;
  cumulativeGasUsed: Hex;
  gasUsed: Hex;
  effectiveGasPrice: Hex;
  status: '0x1' | '0x0';
  type: Hex;
  logsBloom: Hex;
  logs: unknown[];
  revertReason?: Hex;
}
