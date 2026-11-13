// The simulated node: a real EVM (ethereumjs) running the real Pixels bytecode,
// wrapped in the smallest chain that makes it behave like an RPC endpoint.
//
// What is real: the contract (creation bytecode from the 2022 Truffle artifact,
// deployed by running its constructor), every state transition, gas metering,
// revert reasons, event logs, and signature recovery for raw transactions.
// What is simulated: blocks, the mempool, the fee market and the "network".
// Nothing is ever broadcast anywhere.
import { Hardfork, Mainnet, createCustomCommon } from '@ethereumjs/common';
import { createEVM } from '@ethereumjs/evm';
import type { EVM } from '@ethereumjs/evm';
import { Account, createAddressFromString } from '@ethereumjs/util';
import type { Address as EthAddress } from '@ethereumjs/util';
import {
  bytesToHex,
  concatHex,
  decodeFunctionData,
  getAddress,
  hexToBytes,
  keccak256,
  numberToHex,
  pad,
  parseTransaction,
  recoverTransactionAddress,
  serializeTransaction,
  stringToHex,
} from 'viem';
import type { Address, Hex } from 'viem';
import { Bots } from './bots.ts';
import { pixelsAbi, pixelsBytecode, pixelsDeployedBytecode } from './pixelsArtifact.ts';
import { applyDelta, decodeDelta, decodeSeed, emptyTable, encodeDelta, encodeSeed, seedId } from './seed.ts';
import type { Delta, DeltaPixel } from './seed.ts';
import { PixelStateManager, mappingSlot } from './state.ts';
import type { AttachStats } from './state.ts';

/** Time slice for building the seed storage index in the background after boot. */
const INDEX_SLICE_MS = 12;
import {
  BASE_FEE_WEI,
  BLOCK_GAS_LIMIT,
  BLOCK_TIME_MS,
  CHAIN_ID,
  GAS_PRICE_WEI,
  PRIORITY_FEE_WEI,
  SLOT,
  TOTAL_PIXELS,
} from './types.ts';
import type { DemoReceipt, NodeEvent, NodeInfo, PixelTable, RpcErrorShape, RpcRequest, SeedAccount, SeedMeta } from './types.ts';

/** Blocks (with their receipts and logs) kept in memory before the oldest are dropped. */
const KEEP_BLOCKS = 600;
const SNAPSHOT_DEBOUNCE_MS = 400;
const ZERO_HASH: Hex = `0x${'0'.repeat(64)}`;
const ZERO_BLOOM: Hex = `0x${'0'.repeat(512)}`;
const VALIDATOR: Address = '0x0000000000000000000000000000000000001010';

const TOPIC_TRANSFER = keccak256(stringToHex('Transfer(address,address,uint256)'));
const TOPIC_COLOUR_CHANGED = keccak256(stringToHex('PixelColourChanged(address,bytes3,uint256,string)'));

export class RpcError extends Error implements RpcErrorShape {
  code: number;
  data?: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    if (data !== undefined) this.data = data;
  }
}

/**
 * Deterministic throwaway addresses: the last 20 bytes of keccak256(label).
 * Nobody holds a key for them. The node itself moves their funds (they are
 * "unlocked" the way dev-node accounts are), so no private key exists at all.
 */
export function labeledAddress(label: string): Address {
  return getAddress(`0x${keccak256(stringToHex(label)).slice(-40)}`);
}

export const DEPLOYER: Address = labeledAddress('polypaint-demo/deployer');
export const BOT_COUNT = 10;
export const BOTS: Address[] = Array.from({ length: BOT_COUNT }, (_, i) => labeledAddress(`polypaint-demo/painter/${i}`));

export interface DevNodeOptions {
  /** Encoded seed (public/seed.bin). Omit for a fresh deploy with an empty canvas. */
  seed?: Uint8Array;
  /** Delta snapshot from a previous session. Ignored if it is corrupt or belongs to another seed. */
  restore?: string | null;
  onEvent?: (e: NodeEvent) => void;
  /** Mine a block every BLOCK_TIME_MS. Off by default: tests and the seeder mine by hand. */
  autoMine?: boolean;
  /** Run the simulated other buyers. Needs autoMine. */
  bots?: boolean;
  /** Milliseconds clock, used for block timestamps. */
  now?: () => number;
  /**
   * The last block the previous session saw. Snapshots are only taken after
   * blocks with transactions, while empty blocks keep ticking, so on its own a
   * restore would resume a little behind where the visitor left. The chain
   * resumes from whichever is higher. Ignored if malformed or lower.
   */
  head?: { blockNumber: number; timestamp: number } | null;
}

/** Applies the `head` hint: never resume below a height the visitor has already seen. */
function resumePoint(blockNumber: number, timestamp: number, head: DevNodeOptions['head']): { blockNumber: number; timestamp: number } {
  if (
    head &&
    Number.isSafeInteger(head.blockNumber) &&
    head.blockNumber > blockNumber &&
    head.blockNumber < 2 ** 40 &&
    Number.isFinite(head.timestamp) &&
    head.timestamp >= 0
  ) {
    return { blockNumber: head.blockNumber, timestamp: Math.max(timestamp, Math.floor(head.timestamp)) };
  }
  return { blockNumber, timestamp };
}

interface TxRequest {
  from: Address; // lowercase
  to: Address | null; // lowercase
  nonce: number;
  gas: bigint;
  value: bigint;
  data: Hex;
  type: 'legacy' | 'eip2930' | 'eip1559';
  gasPrice: bigint; // legacy price, or maxFeePerGas for 1559
  maxPriorityFeePerGas?: bigint;
  hash: Hex;
  signature?: { r: Hex; s: Hex; v: Hex; yParity: Hex };
  /** Pixel ids named by a pending mint, so the bots do not snipe them. */
  reserves: number[];
}

interface StoredLog {
  address: Address;
  topics: Hex[];
  data: Hex;
}

interface StoredTx {
  tx: TxRequest;
  blockNumber: number;
  blockHash: Hex;
  index: number;
  status: boolean;
  gasUsed: bigint;
  cumulativeGasUsed: bigint;
  effectiveGasPrice: bigint;
  contractAddress: Address | null;
  logs: StoredLog[];
  firstLogIndex: number;
  revertReason?: Hex;
}

interface StoredBlock {
  number: number;
  hash: Hex;
  parentHash: Hex;
  timestamp: number;
  gasUsed: bigint;
  txs: Hex[];
}

interface CallParams {
  from?: Address;
  to?: Address | null;
  data?: Hex;
  input?: Hex;
  value?: Hex;
  gas?: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  nonce?: Hex;
}

interface LogFilter {
  fromBlock?: string;
  toBlock?: string;
  address?: Address | Address[];
  topics?: (Hex | Hex[] | null)[];
  blockHash?: Hex;
}

const hex = (v: bigint | number): Hex => numberToHex(v);
const lower = (a: string): Address => a.toLowerCase() as Address;

export function intrinsicGas(data: Uint8Array, isCreate: boolean): bigint {
  let gas = 21000n;
  let zeros = 0;
  for (let i = 0; i < data.length; i++) if (data[i] === 0) zeros++;
  gas += BigInt(zeros) * 4n + BigInt(data.length - zeros) * 16n;
  if (isCreate) gas += 32000n + BigInt(Math.ceil(data.length / 32)) * 2n;
  return gas;
}

export class DevNode {
  /** Live mirror of the canvas, derived from contract storage after every transaction. */
  readonly table: PixelTable;
  readonly contract: Address;
  /** Viewport hint from the UI: where the bots should prefer to paint. */
  focus: { x: number; y: number } | undefined;

  private readonly evm: EVM;
  private readonly sm: PixelStateManager;
  private readonly contractEth: EthAddress;
  private readonly onEvent: ((e: NodeEvent) => void) | undefined;
  private readonly now: () => number;
  private readonly seedIdentity: string;
  private seedBlock: number;

  private readonly ownerIndex = new Map<string, number>();
  private readonly urlIndex = new Map<string, number>();
  private readonly dirtyPixels = new Set<number>();
  private readonly touchedAccounts = new Set<string>();
  private seedOwners = 0;
  private seedUrls = 0;

  private head: StoredBlock;
  private readonly blocks = new Map<number, StoredBlock>();
  private readonly txs = new Map<Hex, StoredTx>();
  private pending: TxRequest[] = [];
  /** Pixel ids named by pending mints. */
  private readonly reserved = new Set<number>();
  private txCount = 0;

  private queue: Promise<unknown> = Promise.resolve();
  private mineTimer: ReturnType<typeof setInterval> | undefined;
  private snapshotTimer: ReturnType<typeof setTimeout> | undefined;
  private bots: Bots | undefined;
  private stopped = false;

  private constructor(
    evm: EVM,
    sm: PixelStateManager,
    contract: EthAddress,
    table: PixelTable,
    opts: DevNodeOptions,
    head: StoredBlock,
    seedIdentity: string,
  ) {
    this.evm = evm;
    this.sm = sm;
    this.contractEth = contract;
    this.contract = getAddress(contract.toString());
    this.table = table;
    this.onEvent = opts.onEvent;
    this.now = opts.now ?? Date.now;
    this.head = head;
    this.seedBlock = head.number;
    this.seedIdentity = seedIdentity;
    this.blocks.set(head.number, head);
    table.owners.forEach((o, i) => this.ownerIndex.set(o.toLowerCase(), i + 1));
    table.urls.forEach((u, i) => this.urlIndex.set(u, i + 1));
  }

  static async create(opts: DevNodeOptions = {}): Promise<DevNode> {
    const emit = opts.onEvent ?? (() => {});
    emit({ type: 'boot', phase: 'evm', progress: 0 });
    const common = createCustomCommon({ chainId: CHAIN_ID, name: 'polygon-simulated' }, Mainnet, {
      hardfork: Hardfork.Cancun,
    });
    const sm = new PixelStateManager({ common });
    const evm = await createEVM({ common, stateManager: sm });
    emit({ type: 'boot', phase: 'evm', progress: 1 });

    // Genesis: fund the deployer, then deploy by running the real constructor.
    emit({ type: 'boot', phase: 'deploy', progress: 0 });
    const deployer = createAddressFromString(DEPLOYER);
    await sm.putAccount(deployer, new Account(0n, 10n ** 21n));
    const deployed = await evm.runCall({ caller: deployer, data: hexToBytes(pixelsBytecode), gasLimit: 10_000_000n });
    if (deployed.execResult.exceptionError || !deployed.createdAddress) {
      throw new Error(`Pixels deployment failed: ${deployed.execResult.exceptionError?.error ?? 'no address'}`);
    }
    const contract = deployed.createdAddress;
    if (bytesToHex(await sm.getCode(contract)) !== pixelsDeployedBytecode) {
      throw new Error('Deployed runtime code does not match the Truffle artifact');
    }
    evm.journal.cleanJournal();
    sm.originalStorageCache.clear();
    memoizeJumpAnalysis((deployed.execResult as { runState?: { interpreter?: object } }).runState?.interpreter);
    emit({ type: 'boot', phase: 'deploy', progress: 1 });

    let table = emptyTable();
    let head: StoredBlock = { number: 0, hash: blockHash(ZERO_HASH, 0, 0), parentHash: ZERO_HASH, timestamp: 0, gasUsed: 0n, txs: [] };
    let identity = 'fresh';
    let delta: Delta | undefined;
    let accounts: SeedAccount[] = [];
    let contractBalance = 0n;
    let txCount = 1;

    if (opts.seed) {
      const seed = decodeSeed(opts.seed);
      if (seed.meta.contract.toLowerCase() !== contract.toString()) {
        throw new Error('Seed was built for a different contract address');
      }
      identity = seedId(opts.seed);
      table = { ownerIdx: seed.ownerIdx, colours: seed.colours, urlIdx: seed.urlIdx, owners: seed.owners, urls: seed.urls };
      accounts = seed.meta.accounts;
      contractBalance = seed.meta.contractBalance;
      txCount = seed.meta.txCount;
      let blockNumber = seed.meta.blockNumber;
      let timestamp = seed.meta.timestamp;
      const seedOwners = table.owners.length;
      const seedUrls = table.urls.length;

      if (opts.restore) {
        emit({ type: 'boot', phase: 'restore', progress: 0 });
        try {
          const d = decodeDelta(opts.restore);
          if (d.seed !== identity) throw new Error('snapshot belongs to another seed');
          applyDelta(table, d);
          delta = d;
          contractBalance = d.contractBalance;
          blockNumber = d.blockNumber;
          timestamp = d.timestamp;
        } catch {
          // A broken snapshot must never brick the demo: start again from the seed.
          delta = undefined;
          const again = decodeSeed(opts.seed);
          table = { ownerIdx: again.ownerIdx, colours: again.colours, urlIdx: again.urlIdx, owners: again.owners, urls: again.urls };
        }
        emit({ type: 'boot', phase: 'restore', progress: 1 });
      }

      for (const a of accounts) {
        await sm.putAccount(createAddressFromString(a.address), new Account(BigInt(a.nonce), a.balance));
      }
      if (delta) {
        for (const a of delta.accounts) {
          await sm.putAccount(createAddressFromString(a.address), new Account(BigInt(a.nonce), a.balance));
        }
      }
      const contractAccount = (await sm.getAccount(contract))!;
      contractAccount.balance = contractBalance;
      await sm.putAccount(contract, contractAccount);

      emit({ type: 'boot', phase: 'seed', progress: 0 });
      sm.attachPixels(contract, table);
      emit({ type: 'boot', phase: 'seed', progress: 1 });
      ({ blockNumber, timestamp } = resumePoint(blockNumber, timestamp, opts.head));
      head = { number: blockNumber, hash: blockHash(ZERO_HASH, blockNumber, timestamp), parentHash: ZERO_HASH, timestamp, gasUsed: 0n, txs: [] };

      const node = new DevNode(evm, sm, contract, table, opts, head, identity);
      node.seedBlock = seed.meta.blockNumber;
      node.seedOwners = seedOwners;
      node.seedUrls = seedUrls;
      node.txCount = txCount;
      for (const a of accounts) node.touchedAccounts.add(a.address.toLowerCase());
      if (delta) {
        for (const p of delta.pixels) node.dirtyPixels.add(p.id);
        for (const a of delta.accounts) node.touchedAccounts.add(a.address.toLowerCase());
      }
      node.start(opts);
      return node;
    }

    const resumed = resumePoint(0, 0, opts.head);
    if (resumed.blockNumber > 0) {
      head = { number: resumed.blockNumber, hash: blockHash(ZERO_HASH, resumed.blockNumber, resumed.timestamp), parentHash: ZERO_HASH, timestamp: resumed.timestamp, gasUsed: 0n, txs: [] };
    }
    const node = new DevNode(evm, sm, contract, table, opts, head, identity);
    node.seedBlock = 0;
    node.txCount = txCount;
    node.touchedAccounts.add(DEPLOYER.toLowerCase());
    node.start(opts);
    return node;
  }

  private start(opts: DevNodeOptions): void {
    if (opts.autoMine) {
      this.mineTimer = setInterval(() => {
        void this.run(() => this.mineBlock()).catch((err) => this.fatal(err));
      }, BLOCK_TIME_MS);
      (this.mineTimer as { unref?: () => void }).unref?.();
    }
    this.bots = new Bots(this);
    if (opts.bots) this.bots.setEnabled(true);
    this.onEvent?.({ type: 'ready', blockNumber: this.head.number, contract: this.contract });
    // The chain is usable now. The index that maps storage keys back to seeded
    // pixels is filled in short slices, and any read that needs it sooner
    // completes it on the spot.
    if (opts.autoMine) this.warmIndex();
  }

  private warmIndex(): void {
    if (this.stopped || this.sm.indexStep(INDEX_SLICE_MS)) return;
    const t = setTimeout(() => this.warmIndex(), 0);
    (t as { unref?: () => void }).unref?.();
  }

  /** Seed index diagnostics: slot count, table size, hashing time (undefined without a seed). */
  get attachStats(): AttachStats | undefined {
    return this.sm.attachStats;
  }

  /** Builds whatever is left of the seed index right now. */
  finishIndex(): void {
    this.sm.indexStep();
  }

  private fatal(err: unknown): void {
    this.onEvent?.({ type: 'fatal', message: err instanceof Error ? err.message : String(err) });
  }

  /** Stops timers. The node can still answer requests afterwards. */
  stop(): void {
    this.stopped = true;
    if (this.mineTimer) clearInterval(this.mineTimer);
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.bots?.setEnabled(false);
  }

  get blockNumber(): number {
    return this.head.number;
  }

  /** True if nobody owns the pixel and no pending mint names it. */
  isFree(id: number): boolean {
    return this.table.ownerIdx[id] === 0 && !this.reserved.has(id);
  }

  /** Runs one bot action right away (tests). Returns the transaction hash, if any. */
  botAct(): Promise<Hex | undefined> {
    return this.bots!.act();
  }

  // ---- request plumbing ---------------------------------------------------

  /** Everything touching the EVM runs strictly one at a time. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }

  request<T = unknown>(req: RpcRequest): Promise<T> {
    return this.run(() => this.handle(req.method, req.params ?? [])) as Promise<T>;
  }

  private async handle(method: string, params: readonly unknown[]): Promise<unknown> {
    switch (method) {
      case 'eth_chainId':
        return hex(CHAIN_ID);
      case 'net_version':
        return String(CHAIN_ID);
      case 'web3_clientVersion':
        return 'polypaint-demo-node/1.0 (ethereumjs-evm, simulated chain)';
      case 'eth_accounts':
        return [];
      case 'eth_blockNumber':
        return hex(this.head.number);
      case 'eth_gasPrice':
        return hex(GAS_PRICE_WEI);
      case 'eth_maxPriorityFeePerGas':
        return hex(PRIORITY_FEE_WEI);
      case 'eth_feeHistory': {
        const count = Math.max(1, Math.min(Number(params[0] as string | number), 16));
        return {
          oldestBlock: hex(Math.max(0, this.head.number - count + 1)),
          baseFeePerGas: Array.from({ length: count + 1 }, () => hex(BASE_FEE_WEI)),
          gasUsedRatio: Array.from({ length: count }, () => 0.1),
          reward: Array.isArray(params[2]) ? Array.from({ length: count }, () => (params[2] as unknown[]).map(() => hex(PRIORITY_FEE_WEI))) : undefined,
        };
      }
      case 'eth_getBlockByNumber':
        return this.rpcBlock(this.resolveBlock(params[0] as string), params[1] === true);
      case 'eth_getBlockByHash': {
        for (const b of this.blocks.values()) if (b.hash === params[0]) return this.rpcBlock(b, params[1] === true);
        return null;
      }
      case 'eth_getBalance':
        return hex((await this.account(params[0] as Address)).balance);
      case 'eth_getTransactionCount': {
        const address = lower(params[0] as string);
        const nonce = Number((await this.account(address)).nonce);
        return hex(params[1] === 'pending' ? nonce + this.pendingFrom(address).length : nonce);
      }
      case 'eth_getCode':
        return bytesToHex(await this.sm.getCode(createAddressFromString(params[0] as string)));
      case 'eth_getStorageAt': {
        const key = hexToBytes(numberToHex(BigInt(params[1] as string), { size: 32 }));
        const value = await this.sm.getStorage(createAddressFromString(params[0] as string), key);
        return pad(bytesToHex(value), { size: 32 });
      }
      case 'eth_call':
        return this.ethCall(params[0] as CallParams);
      case 'eth_estimateGas':
        return this.estimateGas(params[0] as CallParams);
      case 'eth_sendRawTransaction':
        return this.sendRaw(params[0] as Hex);
      case 'eth_sendTransaction':
        return this.sendUnlocked(params[0] as CallParams);
      case 'eth_getTransactionByHash':
        return this.rpcTransaction(params[0] as Hex);
      case 'eth_getTransactionReceipt':
        return this.rpcReceipt(params[0] as Hex);
      case 'eth_getLogs':
        return this.getLogs((params[0] ?? {}) as LogFilter);
      case 'demo_info':
        return this.info();
      case 'demo_setBalance': {
        const address = lower(params[0] as string);
        const acct = await this.account(address);
        acct.balance = BigInt(params[1] as string);
        await this.sm.putAccount(createAddressFromString(address), acct);
        this.touchedAccounts.add(address);
        this.scheduleSnapshot();
        return true;
      }
      case 'demo_setBots':
        this.bots?.setEnabled(params[0] === true);
        return true;
      case 'demo_setFocus':
        this.focus = { x: Number(params[0]), y: Number(params[1]) };
        return true;
      case 'demo_snapshot':
        return this.snapshot();
      case 'demo_mine':
        return hex((await this.mineBlock()).number);
      default:
        throw new RpcError(-32601, `The method ${method} does not exist or is not available`);
    }
  }

  private info(): NodeInfo {
    return {
      contract: this.contract,
      deployer: DEPLOYER,
      bots: BOTS,
      chainId: CHAIN_ID,
      blockGasLimit: hex(BLOCK_GAS_LIMIT),
      blockTimeMs: BLOCK_TIME_MS,
      seedBlock: this.seedBlock,
    };
  }

  private async account(address: string): Promise<Account> {
    return (await this.sm.getAccount(createAddressFromString(address))) ?? new Account();
  }

  private pendingFrom(address: string): TxRequest[] {
    return this.pending.filter((t) => t.from === address);
  }

  // ---- execution ----------------------------------------------------------

  private evmBlock(number: number, timestamp: number) {
    return {
      header: {
        number: BigInt(number),
        coinbase: createAddressFromString(VALIDATOR),
        timestamp: BigInt(timestamp),
        difficulty: 0n,
        prevRandao: hexToBytes(keccak256(numberToHex(number, { size: 32 }))),
        gasLimit: BLOCK_GAS_LIMIT,
        baseFeePerGas: BASE_FEE_WEI,
        getBlobGasPrice: () => 1n,
      },
    };
  }

  /**
   * EIP-2929 bookkeeping that a full client does per transaction: start from an
   * empty warm set, then pre-warm the sender, the target, the precompiles and
   * the coinbase. Without this, slots touched by one transaction would stay
   * warm (and cheaper) for the next.
   */
  private warm(from: EthAddress, to: EthAddress | undefined): void {
    const j = this.evm.journal;
    j.cleanJournal();
    this.sm.originalStorageCache.clear();
    for (const address of this.evm.precompiles.keys()) j.addAlwaysWarmAddress(address);
    j.addAlwaysWarmAddress(from.toString().slice(2));
    if (to) j.addAlwaysWarmAddress(to.toString().slice(2));
    j.addAlwaysWarmAddress(VALIDATOR.slice(2));
  }

  /** Runs a message against the head state and throws the result away. */
  private async simulate(call: CallParams): Promise<{ execGas: bigint; refund: bigint; returnValue: Uint8Array; error?: string; intrinsic: bigint }> {
    const from = createAddressFromString(call.from ?? '0x0000000000000000000000000000000000000000');
    const to = call.to ? createAddressFromString(call.to) : undefined;
    const data = hexToBytes(call.data ?? call.input ?? '0x');
    const value = call.value ? BigInt(call.value) : 0n;
    const intrinsic = intrinsicGas(data, !to);
    const gas = call.gas ? BigInt(call.gas) : BLOCK_GAS_LIMIT;
    if (gas < intrinsic) throw new RpcError(-32000, `intrinsic gas too low: have ${gas}, want ${intrinsic}`);
    if (value > 0n && (await this.account(from.toString())).balance < value) {
      throw new RpcError(-32000, 'insufficient funds for gas * price + value');
    }
    this.warm(from, to);
    await this.evm.journal.checkpoint();
    try {
      const res = await this.evm.runCall({
        block: this.evmBlock(this.head.number, this.head.timestamp),
        gasPrice: GAS_PRICE_WEI,
        origin: from,
        caller: from,
        to,
        data,
        value,
        gasLimit: gas - intrinsic,
        skipNonceIncrement: true,
      });
      const r = res.execResult;
      return {
        execGas: r.executionGasUsed,
        refund: r.gasRefund ?? 0n,
        returnValue: r.returnValue,
        error: r.exceptionError?.error,
        intrinsic,
      };
    } finally {
      await this.evm.journal.revert();
      this.evm.journal.cleanJournal();
      this.sm.originalStorageCache.clear();
    }
  }

  private static revertError(error: string, returnValue: Uint8Array): RpcError {
    if (error === 'out of gas') return new RpcError(-32000, `gas required exceeds allowance (${BLOCK_GAS_LIMIT})`);
    if (error !== 'revert') return new RpcError(-32000, `execution failed: ${error}`);
    const data = bytesToHex(returnValue);
    const reason = decodeRevertString(data);
    return new RpcError(3, reason ? `execution reverted: ${reason}` : 'execution reverted', data);
  }

  private async ethCall(call: CallParams): Promise<Hex> {
    const res = await this.simulate(call);
    if (res.error) throw DevNode.revertError(res.error, res.returnValue);
    return bytesToHex(res.returnValue);
  }

  private async estimateGas(call: CallParams): Promise<Hex> {
    const res = await this.simulate(call);
    if (res.error) throw DevNode.revertError(res.error, res.returnValue);
    // The contract makes no calls of its own, so the gas burned before refunds
    // is exactly the limit a transaction needs.
    return hex(res.intrinsic + res.execGas);
  }

  private async admit(tx: TxRequest, maxPrice: bigint): Promise<Hex> {
    if (tx.gas > BLOCK_GAS_LIMIT) throw new RpcError(-32000, 'exceeds block gas limit');
    const data = hexToBytes(tx.data);
    const intrinsic = intrinsicGas(data, tx.to === null);
    if (tx.gas < intrinsic) throw new RpcError(-32000, `intrinsic gas too low: have ${tx.gas}, want ${intrinsic}`);
    if (maxPrice < BASE_FEE_WEI) throw new RpcError(-32000, 'max fee per gas less than block base fee');
    const acct = await this.account(tx.from);
    const queued = this.pendingFrom(tx.from);
    const expected = Number(acct.nonce) + queued.length;
    if (tx.nonce < expected) throw new RpcError(-32000, `nonce too low: next nonce ${expected}, tx nonce ${tx.nonce}`);
    if (tx.nonce > expected) throw new RpcError(-32000, `nonce too high: next nonce ${expected}, tx nonce ${tx.nonce}`);
    let committed = tx.value + tx.gas * maxPrice;
    for (const q of queued) committed += q.value + q.gas * q.gasPrice;
    if (acct.balance < committed) throw new RpcError(-32000, 'insufficient funds for gas * price + value');
    tx.reserves = this.reservedPixels(tx);
    for (const id of tx.reserves) this.reserved.add(id);
    this.pending.push(tx);
    return tx.hash;
  }

  private reservedPixels(tx: TxRequest): number[] {
    if (tx.to !== this.contract.toLowerCase() || tx.data.length < 10) return [];
    try {
      const { functionName, args } = decodeFunctionData({ abi: pixelsAbi, data: tx.data });
      if (functionName === 'mintMultiple') return (args[0] as readonly bigint[]).map(Number);
      if (functionName === 'mint') return [Number(args[0])];
    } catch {
      // Not a call this contract understands. It will revert on its own.
    }
    return [];
  }

  private async sendRaw(raw: Hex): Promise<Hex> {
    let parsed;
    try {
      parsed = parseTransaction(raw);
    } catch {
      throw new RpcError(-32000, 'rlp: could not decode transaction');
    }
    const type = parsed.type;
    if (type !== 'legacy' && type !== 'eip1559' && type !== 'eip2930') {
      throw new RpcError(-32000, `transaction type not supported: ${String(type)}`);
    }
    if (parsed.chainId === undefined) throw new RpcError(-32000, 'only replay-protected (EIP-155) transactions allowed over RPC');
    if (parsed.chainId !== CHAIN_ID) {
      throw new RpcError(-32000, `invalid chain id for signer: have ${parsed.chainId} want ${CHAIN_ID}`);
    }
    if (parsed.r === undefined || parsed.s === undefined) throw new RpcError(-32000, 'transaction is not signed');
    let from: Address;
    try {
      from = lower(await recoverTransactionAddress({ serializedTransaction: raw as Parameters<typeof recoverTransactionAddress>[0]['serializedTransaction'] }));
    } catch {
      throw new RpcError(-32000, 'invalid signature');
    }
    const maxPrice = type === 'eip1559' ? (parsed.maxFeePerGas ?? 0n) : (parsed.gasPrice ?? 0n);
    const yParity = parsed.yParity ?? (parsed.v !== undefined ? Number((parsed.v - 35n) % 2n) : 0);
    return this.admit(
      {
        from,
        to: parsed.to ? lower(parsed.to) : null,
        nonce: parsed.nonce ?? 0,
        gas: parsed.gas ?? 0n,
        value: parsed.value ?? 0n,
        data: parsed.data ?? '0x',
        type,
        gasPrice: maxPrice,
        maxPriorityFeePerGas: type === 'eip1559' ? (parsed.maxPriorityFeePerGas ?? 0n) : undefined,
        hash: keccak256(raw),
        signature: {
          r: parsed.r,
          s: parsed.s,
          v: hex(parsed.v ?? BigInt(yParity)),
          yParity: hex(yParity),
        },
        reserves: [],
      },
      maxPrice,
    );
  }

  /** eth_sendTransaction for the node's own unlocked accounts (the bots and the deployer). */
  private async sendUnlocked(call: CallParams): Promise<Hex> {
    const from = lower(call.from ?? '');
    if (from !== DEPLOYER.toLowerCase() && !BOTS.some((b) => b.toLowerCase() === from)) {
      throw new RpcError(-32000, 'unknown account: this node only signs for its own dev accounts. Use eth_sendRawTransaction.');
    }
    const data = call.data ?? call.input ?? '0x';
    const to = call.to ? lower(call.to) : null;
    const value = call.value ? BigInt(call.value) : 0n;
    const acct = await this.account(from);
    const nonce = call.nonce ? Number(BigInt(call.nonce)) : Number(acct.nonce) + this.pendingFrom(from).length;
    let gas: bigint;
    if (call.gas) gas = BigInt(call.gas);
    else {
      const res = await this.simulate({ from, to, data, value: hex(value) });
      if (res.error) throw DevNode.revertError(res.error, res.returnValue);
      gas = ((res.intrinsic + res.execGas) * 12n) / 10n;
      if (gas > BLOCK_GAS_LIMIT) gas = BLOCK_GAS_LIMIT;
    }
    const gasPrice = call.gasPrice ? BigInt(call.gasPrice) : GAS_PRICE_WEI;
    const unsigned = serializeTransaction({ type: 'legacy', chainId: CHAIN_ID, nonce, gas, gasPrice, to: to ?? undefined, value, data });
    return this.admit(
      { from, to, nonce, gas, value, data, type: 'legacy', gasPrice, hash: keccak256(concatHex([unsigned, from])), reserves: [] },
      gasPrice,
    );
  }

  /** Mines one block now (the seeder and the tests drive the chain by hand). */
  mine(): Promise<{ number: number; txs: Hex[] }> {
    return this.run(() => this.mineBlock());
  }

  /** Mines one block from the head of the mempool. Empty blocks are fine. */
  private async mineBlock(): Promise<StoredBlock> {
    const number = this.head.number + 1;
    const timestamp = Math.max(this.head.timestamp + 1, Math.floor(this.now() / 1000));
    const hash = blockHash(this.head.hash, number, timestamp);
    const block: StoredBlock = { number, hash, parentHash: this.head.hash, timestamp, gasUsed: 0n, txs: [] };
    let logIndex = 0;

    while (this.pending.length > 0) {
      const tx = this.pending[0];
      if (block.gasUsed + tx.gas > BLOCK_GAS_LIMIT) break;
      this.pending.shift();
      for (const id of tx.reserves) this.reserved.delete(id);
      const stored = await this.applyTx(tx, block, logIndex);
      if (!stored) continue; // no longer valid against current state: dropped
      logIndex += stored.logs.length;
      block.gasUsed += stored.gasUsed;
      block.txs.push(tx.hash);
      this.txs.set(tx.hash, stored);
    }

    this.head = block;
    this.blocks.set(number, block);
    const drop = number - KEEP_BLOCKS;
    const old = this.blocks.get(drop);
    if (old) {
      for (const h of old.txs) this.txs.delete(h);
      this.blocks.delete(drop);
    }
    this.onEvent?.({ type: 'block', number, timestamp, txHashes: block.txs });
    if (block.txs.length > 0) this.scheduleSnapshot();
    return block;
  }

  private async applyTx(tx: TxRequest, block: StoredBlock, firstLogIndex: number): Promise<StoredTx | undefined> {
    const from = createAddressFromString(tx.from);
    const to = tx.to ? createAddressFromString(tx.to) : undefined;
    const data = hexToBytes(tx.data);
    const price =
      tx.type === 'eip1559'
        ? tx.gasPrice < BASE_FEE_WEI + (tx.maxPriorityFeePerGas ?? 0n)
          ? tx.gasPrice
          : BASE_FEE_WEI + (tx.maxPriorityFeePerGas ?? 0n)
        : tx.gasPrice;

    const sender = await this.account(tx.from);
    const upfront = tx.gas * price;
    if (Number(sender.nonce) !== tx.nonce || sender.balance < upfront + tx.value) return undefined;
    // Buy the gas and bump the nonce before execution: both survive a revert.
    sender.nonce += 1n;
    sender.balance -= upfront;
    await this.sm.putAccount(from, sender);
    this.touchedAccounts.add(tx.from);
    if (tx.to && tx.to !== this.contract.toLowerCase() && tx.value > 0n) this.touchedAccounts.add(tx.to);

    const intrinsic = intrinsicGas(data, !to);
    this.warm(from, to);
    let res;
    try {
      res = await this.evm.runCall({
        block: this.evmBlock(block.number, block.timestamp),
        gasPrice: price,
        origin: from,
        caller: from,
        to,
        data,
        value: tx.value,
        gasLimit: tx.gas - intrinsic,
        skipNonceIncrement: true,
      });
    } finally {
      this.evm.journal.cleanJournal();
      this.sm.originalStorageCache.clear();
    }
    const r = res.execResult;
    let gasUsed = intrinsic + r.executionGasUsed;
    const refund = r.gasRefund ?? 0n;
    const maxRefund = gasUsed / 5n;
    gasUsed -= refund < maxRefund ? refund : maxRefund;

    const after = await this.account(tx.from);
    after.balance += (tx.gas - gasUsed) * price;
    await this.sm.putAccount(from, after);

    const failed = r.exceptionError !== undefined;
    const logs: StoredLog[] = failed
      ? []
      : (r.logs ?? []).map(([address, topics, logData]) => ({
          address: lower(bytesToHex(address)),
          topics: topics.map((t) => bytesToHex(t)),
          data: bytesToHex(logData),
        }));
    if (!failed) await this.syncFromLogs(logs);
    this.txCount++;

    return {
      tx,
      blockNumber: block.number,
      blockHash: block.hash,
      index: block.txs.length,
      status: !failed,
      gasUsed,
      cumulativeGasUsed: block.gasUsed + gasUsed,
      effectiveGasPrice: price,
      contractAddress: !failed && res.createdAddress ? lower(res.createdAddress.toString()) : null,
      logs,
      firstLogIndex,
      revertReason: failed ? bytesToHex(r.returnValue) : undefined,
    };
  }

  // ---- canvas mirror ------------------------------------------------------

  /**
   * Brings the mirror up to date for every pixel a transaction touched. The
   * events only say which pixels to look at: the values are read back from
   * contract storage, which stays right even where the contract's own events
   * are not (PixelColourChanged reports a new URL the contract may have refused).
   */
  private async syncFromLogs(logs: StoredLog[]): Promise<void> {
    const contract = this.contract.toLowerCase();
    const ids = new Set<number>();
    for (const log of logs) {
      if (log.address !== contract) continue;
      if (log.topics[0] === TOPIC_TRANSFER && log.topics[3]) ids.add(Number(BigInt(log.topics[3])));
      else if (log.topics[0] === TOPIC_COLOUR_CHANGED) ids.add(Number(BigInt(`0x${log.data.slice(2 + 128, 2 + 192)}`)));
    }
    for (const id of ids) if (id < TOTAL_PIXELS) await this.syncPixel(id);
  }

  private async syncPixel(id: number): Promise<void> {
    const t = this.table;
    const owner = await this.sm.getStorage(this.contractEth, mappingSlot(id, SLOT.owners));
    if (owner.length === 0) {
      t.ownerIdx[id] = 0;
      t.colours[id] = 0;
      t.urlIdx[id] = 0;
    } else {
      const address = lower(pad(bytesToHex(owner), { size: 20 }));
      let o = this.ownerIndex.get(address);
      if (o === undefined) {
        t.owners.push(getAddress(address));
        o = t.owners.length;
        this.ownerIndex.set(address, o);
      }
      t.ownerIdx[id] = o;
      const colour = await this.sm.getStorage(this.contractEth, mappingSlot(id, SLOT.pixelColours));
      let c = 0;
      for (const byte of colour) c = (c << 8) | byte;
      t.colours[id] = c;
      const url = await this.readString(mappingSlot(id, SLOT.pixelURL));
      if (url === '') t.urlIdx[id] = 0;
      else {
        let u = this.urlIndex.get(url);
        if (u === undefined) {
          t.urls.push(url);
          u = t.urls.length;
          this.urlIndex.set(url, u);
        }
        t.urlIdx[id] = u;
      }
    }
    this.dirtyPixels.add(id);
  }

  /** Decodes a Solidity `string` stored at `slot` of the Pixels contract. */
  private async readString(slot: Uint8Array): Promise<string> {
    const raw = await this.sm.getStorage(this.contractEth, slot);
    if (raw.length === 0) return '';
    const word = new Uint8Array(32);
    word.set(raw, 32 - raw.length);
    const decoder = new TextDecoder();
    if ((word[31] & 1) === 0) return decoder.decode(word.subarray(0, word[31] >> 1));
    const length = Number((BigInt(bytesToHex(word)) - 1n) / 2n);
    const base = BigInt(keccak256(slot));
    const out = new Uint8Array(length);
    for (let i = 0; i * 32 < length; i++) {
      const chunk = await this.sm.getStorage(this.contractEth, hexToBytes(numberToHex(base + BigInt(i), { size: 32 })));
      const padded = new Uint8Array(32);
      padded.set(chunk, 32 - chunk.length);
      out.set(padded.subarray(0, Math.min(32, length - i * 32)), i * 32);
    }
    return decoder.decode(out);
  }

  // ---- snapshots ----------------------------------------------------------

  private async accountList(): Promise<SeedAccount[]> {
    const out: SeedAccount[] = [];
    for (const address of this.touchedAccounts) {
      const a = await this.account(address);
      out.push({ address: getAddress(address), balance: a.balance, nonce: Number(a.nonce) });
    }
    return out;
  }

  /** Everything that changed since the seed, as a base64 string for localStorage. */
  async snapshot(): Promise<string> {
    const t = this.table;
    const pixels: DeltaPixel[] = [];
    for (const id of this.dirtyPixels) pixels.push({ id, ownerIdx: t.ownerIdx[id], colour: t.colours[id], urlIdx: t.urlIdx[id] });
    return encodeDelta({
      seed: this.seedIdentity,
      blockNumber: this.head.number,
      timestamp: this.head.timestamp,
      contractBalance: (await this.account(this.contract)).balance,
      accounts: await this.accountList(),
      owners: t.owners.slice(this.seedOwners),
      urls: t.urls.slice(this.seedUrls),
      pixels,
    });
  }

  private scheduleSnapshot(): void {
    if (!this.onEvent || this.stopped) return;
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = undefined;
      void this.run(() => this.snapshot()).then(
        (data) => this.onEvent?.({ type: 'snapshot', data }),
        () => {},
      );
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  /** The whole canvas plus accounts, in the format shipped as public/seed.bin. */
  async exportSeed(): Promise<Uint8Array> {
    return this.run(async () => {
      let ownedCount = 0;
      for (let i = 0; i < TOTAL_PIXELS; i++) if (this.table.ownerIdx[i] !== 0) ownedCount++;
      const meta: SeedMeta = {
        blockNumber: this.head.number,
        timestamp: this.head.timestamp,
        contract: this.contract,
        deployer: DEPLOYER,
        contractBalance: (await this.account(this.contract)).balance,
        accounts: await this.accountList(),
        ownedCount,
        txCount: this.txCount,
      };
      return encodeSeed(this.table, meta);
    });
  }

  // ---- RPC formatting -----------------------------------------------------

  private resolveBlock(tag: string | undefined): StoredBlock | undefined {
    if (tag === undefined || tag === 'latest' || tag === 'pending' || tag === 'safe' || tag === 'finalized') return this.head;
    if (tag === 'earliest') return this.blocks.get(Math.min(...this.blocks.keys()));
    return this.blocks.get(Number(BigInt(tag)));
  }

  private rpcBlock(b: StoredBlock | undefined, full: boolean) {
    if (!b) return null;
    return {
      number: hex(b.number),
      hash: b.hash,
      parentHash: b.parentHash,
      nonce: '0x0000000000000000',
      sha3Uncles: ZERO_HASH,
      logsBloom: ZERO_BLOOM,
      transactionsRoot: ZERO_HASH,
      stateRoot: ZERO_HASH,
      receiptsRoot: ZERO_HASH,
      miner: VALIDATOR,
      difficulty: '0x0',
      totalDifficulty: '0x0',
      extraData: '0x',
      size: '0x0',
      gasLimit: hex(BLOCK_GAS_LIMIT),
      gasUsed: hex(b.gasUsed),
      timestamp: hex(b.timestamp),
      baseFeePerGas: hex(BASE_FEE_WEI),
      mixHash: ZERO_HASH,
      uncles: [],
      transactions: full ? b.txs.map((h) => this.rpcTransaction(h)) : b.txs,
    };
  }

  private rpcTransaction(hash: Hex) {
    const stored = this.txs.get(hash);
    const tx = stored?.tx ?? this.pending.find((t) => t.hash === hash);
    if (!tx) return null;
    const sig = tx.signature ?? { r: '0x0' as Hex, s: '0x0' as Hex, v: '0x0' as Hex, yParity: '0x0' as Hex };
    const typed = tx.type === 'eip1559';
    return {
      hash: tx.hash,
      nonce: hex(tx.nonce),
      blockHash: stored?.blockHash ?? null,
      blockNumber: stored ? hex(stored.blockNumber) : null,
      transactionIndex: stored ? hex(stored.index) : null,
      from: tx.from,
      to: tx.to,
      value: hex(tx.value),
      gas: hex(tx.gas),
      gasPrice: hex(stored ? stored.effectiveGasPrice : tx.gasPrice),
      ...(typed ? { maxFeePerGas: hex(tx.gasPrice), maxPriorityFeePerGas: hex(tx.maxPriorityFeePerGas ?? 0n) } : {}),
      ...(tx.type !== 'legacy' ? { accessList: [], yParity: sig.yParity } : {}),
      input: tx.data,
      type: tx.type === 'legacy' ? '0x0' : tx.type === 'eip2930' ? '0x1' : '0x2',
      chainId: hex(CHAIN_ID),
      v: sig.v,
      r: sig.r,
      s: sig.s,
    };
  }

  private rpcLogs(stored: StoredTx) {
    return stored.logs.map((log, i) => ({
      address: log.address,
      topics: log.topics,
      data: log.data,
      blockNumber: hex(stored.blockNumber),
      blockHash: stored.blockHash,
      transactionHash: stored.tx.hash,
      transactionIndex: hex(stored.index),
      logIndex: hex(stored.firstLogIndex + i),
      removed: false,
    }));
  }

  private rpcReceipt(hash: Hex): DemoReceipt | null {
    const s = this.txs.get(hash);
    if (!s) return null;
    return {
      transactionHash: s.tx.hash,
      transactionIndex: hex(s.index),
      blockHash: s.blockHash,
      blockNumber: hex(s.blockNumber),
      from: s.tx.from,
      to: s.tx.to,
      contractAddress: s.contractAddress,
      cumulativeGasUsed: hex(s.cumulativeGasUsed),
      gasUsed: hex(s.gasUsed),
      effectiveGasPrice: hex(s.effectiveGasPrice),
      status: s.status ? '0x1' : '0x0',
      type: s.tx.type === 'legacy' ? '0x0' : s.tx.type === 'eip2930' ? '0x1' : '0x2',
      logsBloom: ZERO_BLOOM,
      logs: this.rpcLogs(s),
      ...(s.revertReason !== undefined ? { revertReason: s.revertReason } : {}),
    };
  }

  private getLogs(filter: LogFilter) {
    let from: number;
    let to: number;
    if (filter.blockHash) {
      const b = [...this.blocks.values()].find((x) => x.hash === filter.blockHash);
      if (!b) throw new RpcError(-32000, 'unknown block');
      from = to = b.number;
    } else {
      const number = (tag: string | undefined): number =>
        tag === undefined || tag === 'latest' || tag === 'pending' || tag === 'safe' || tag === 'finalized'
          ? this.head.number
          : tag === 'earliest'
            ? 0
            : Number(BigInt(tag));
      from = number(filter.fromBlock);
      to = Math.min(number(filter.toBlock), this.head.number);
    }
    const addresses = filter.address === undefined ? undefined : (Array.isArray(filter.address) ? filter.address : [filter.address]).map((a) => a.toLowerCase());
    const topics = (filter.topics ?? []).map((t) => (t === null ? null : (Array.isArray(t) ? t : [t]).map((x) => x.toLowerCase())));
    const out: unknown[] = [];
    // Only blocks still in memory can answer. Older history is gone, as on a pruned node.
    const first = Math.max(from, this.head.number - KEEP_BLOCKS);
    for (let n = first; n <= to; n++) {
      const b = this.blocks.get(n);
      if (!b || b.txs.length === 0) continue;
      for (const h of b.txs) {
        const stored = this.txs.get(h);
        if (!stored || stored.logs.length === 0) continue;
        for (const log of this.rpcLogs(stored)) {
          if (addresses && !addresses.includes(log.address)) continue;
          let ok = true;
          for (let i = 0; i < topics.length && ok; i++) {
            const want = topics[i];
            if (want !== null && !(log.topics[i] && want.includes(log.topics[i].toLowerCase()))) ok = false;
          }
          if (ok) out.push(log);
        }
      }
    }
    return out;
  }
}

/**
 * ethereumjs scans a contract's bytecode for JUMPDESTs at the start of every
 * call, about half a millisecond for the 18 KB of Pixels. The result depends
 * only on the code, so it is remembered per code array. This reaches into the
 * interpreter's prototype (it is not exported): if a future ethereumjs moves
 * the method, the patch quietly does nothing and calls are merely slower.
 */
function memoizeJumpAnalysis(interpreter: object | undefined): void {
  if (!interpreter) return;
  const proto = Object.getPrototypeOf(interpreter) as {
    _getValidJumpDestinations?: (code: Uint8Array) => object;
    __polypaintMemo?: boolean;
  } | null;
  const original = proto?._getValidJumpDestinations;
  if (!proto || typeof original !== 'function' || proto.__polypaintMemo) return;
  const cache = new WeakMap<Uint8Array, object>();
  proto._getValidJumpDestinations = function (this: unknown, code: Uint8Array): object {
    let hit = cache.get(code);
    if (hit === undefined) {
      hit = original.call(this, code);
      cache.set(code, hit);
    }
    return hit;
  };
  proto.__polypaintMemo = true;
}

function blockHash(parent: Hex, number: number, timestamp: number): Hex {
  return keccak256(concatHex([parent, numberToHex(number, { size: 8 }), numberToHex(timestamp, { size: 8 })]));
}

/** Decodes the `Error(string)` payload of a revert, if that is what it is. */
export function decodeRevertString(data: Hex): string | undefined {
  if (!data.startsWith('0x08c379a0') || data.length < 10 + 128) return undefined;
  try {
    const length = Number(BigInt(`0x${data.slice(10 + 64, 10 + 128)}`));
    return new TextDecoder().decode(hexToBytes(`0x${data.slice(10 + 128, 10 + 128 + length * 2)}`));
  } catch {
    return undefined;
  }
}
