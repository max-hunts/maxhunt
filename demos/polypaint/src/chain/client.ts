// Main-thread handle on the node. Creating a client starts the worker (and so
// downloads the EVM chunk), which is why the app does it after first paint.
// Nothing here may import the EVM or node.ts.
import type { Address } from 'viem';
import type { NodeClient, NodeEvent, RpcErrorShape, RpcRequest } from './types.ts';

export interface NodeClientOptions {
  /** The encoded seed (the bytes of seed.bin). */
  seed: Uint8Array;
  /** Delta snapshot saved from an earlier `snapshot` event, if any. */
  restore?: string | null;
  /** Run the simulated other buyers. Default true. */
  bots?: boolean;
  /**
   * The last `block` event the previous session saw (number and timestamp).
   * The chain resumes from it when it is ahead of the snapshot, so the block
   * height never goes backwards across a reload.
   */
  head?: { blockNumber: number; timestamp: number } | null;
}

/** An Error that also carries the JSON-RPC `code` and `data` (viem reads both). */
export class NodeRpcError extends Error implements RpcErrorShape {
  code: number;
  data?: unknown;
  constructor(shape: RpcErrorShape) {
    super(shape.message);
    this.name = 'NodeRpcError';
    this.code = shape.code;
    if (shape.data !== undefined) this.data = shape.data;
  }
}

type Outbound =
  | { type: 'event'; event: NodeEvent }
  | { type: 'response'; id: number; result?: unknown; error?: RpcErrorShape };

export function createNodeClient(opts: NodeClientOptions): NodeClient {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'polypaint-node' });
  const listeners = new Set<(e: NodeEvent) => void>();
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 1;
  let dead: NodeRpcError | undefined;

  let resolveReady!: (v: { blockNumber: number; contract: Address }) => void;
  let rejectReady!: (e: Error) => void;
  const ready = new Promise<{ blockNumber: number; contract: Address }>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  ready.catch(() => {}); // a fatal boot is reported through `on` as well

  const fail = (message: string) => {
    dead = new NodeRpcError({ code: -32603, message });
    rejectReady(dead);
    for (const w of waiting.values()) w.reject(dead);
    waiting.clear();
    for (const l of listeners) l({ type: 'fatal', message });
  };

  worker.onmessage = (e: MessageEvent<Outbound>) => {
    const msg = e.data;
    if (msg.type === 'event') {
      if (msg.event.type === 'ready') resolveReady({ blockNumber: msg.event.blockNumber, contract: msg.event.contract });
      if (msg.event.type === 'fatal') {
        fail(msg.event.message);
        return;
      }
      for (const l of listeners) l(msg.event);
      return;
    }
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.reject(new NodeRpcError(msg.error));
    else w.resolve(msg.result);
  };
  worker.onerror = (e) => fail(e.message || 'the node worker crashed');

  worker.postMessage({ type: 'init', seed: opts.seed, restore: opts.restore ?? null, bots: opts.bots ?? true, head: opts.head ?? null });

  return {
    request<T = unknown>(req: RpcRequest): Promise<T> {
      if (dead) return Promise.reject(dead);
      const id = nextId++;
      return new Promise<T>((resolve, reject) => {
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
        worker.postMessage({ type: 'request', id, req });
      });
    },
    on(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ready,
    terminate() {
      worker.terminate();
      dead = new NodeRpcError({ code: -32603, message: 'node terminated' });
      for (const w of waiting.values()) w.reject(dead);
      waiting.clear();
    },
  };
}
