// Web Worker entry: hosts the node so the EVM never blocks the canvas.
// Protocol (see client.ts):
//   main -> worker  { type: 'init', seed, restore, bots, head }
//                   { type: 'request', id, req }
//   worker -> main  { type: 'event', event }            (NodeEvent)
//                   { type: 'response', id, result }
//                   { type: 'response', id, error: { code, message, data } }
import { DevNode } from './node.ts';
import type { NodeEvent, RpcErrorShape, RpcRequest } from './types.ts';

type Inbound =
  | { type: 'init'; seed: Uint8Array; restore?: string | null; bots?: boolean; head?: { blockNumber: number; timestamp: number } | null }
  | { type: 'request'; id: number; req: RpcRequest };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<Inbound>) => void) | null;
  postMessage: (message: unknown) => void;
};

let node: Promise<DevNode> | undefined;

function toShape(err: unknown): RpcErrorShape {
  const e = err as Partial<RpcErrorShape> | undefined;
  return {
    code: typeof e?.code === 'number' ? e.code : -32603,
    message: typeof e?.message === 'string' ? e.message : String(err),
    ...(e?.data !== undefined ? { data: e.data } : {}),
  };
}

scope.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    node = DevNode.create({
      seed: msg.seed,
      restore: msg.restore,
      head: msg.head,
      bots: msg.bots ?? true,
      autoMine: true,
      onEvent: (event: NodeEvent) => scope.postMessage({ type: 'event', event }),
    });
    node.catch((err) => scope.postMessage({ type: 'event', event: { type: 'fatal', message: toShape(err).message } satisfies NodeEvent }));
    return;
  }
  if (!node) {
    scope.postMessage({ type: 'response', id: msg.id, error: { code: -32002, message: 'node is not initialized' } });
    return;
  }
  // Requests that arrive while the chain is still booting simply wait for it.
  node
    .then((n) => n.request(msg.req))
    .then(
      (result) => scope.postMessage({ type: 'response', id: msg.id, result }),
      (err) => scope.postMessage({ type: 'response', id: msg.id, error: toShape(err) }),
    );
};
