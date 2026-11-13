// Shared test plumbing: throwaway signers and thin wrappers over the node's RPC.
import { createPublicClient, custom, decodeErrorResult, decodeFunctionResult, defineChain, encodeFunctionData, numberToHex, parseEther } from 'viem';
import type { Abi, Address, Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import type { PrivateKeyAccount } from 'viem/accounts';
import type { DevNode } from '../src/chain/node.ts';
import { pixelsAbi } from '../src/chain/pixelsArtifact.ts';
import { CHAIN_ID, GAS_PRICE_WEI, PIXEL_PRICE_WEI } from '../src/chain/types.ts';
import type { DemoReceipt } from '../src/chain/types.ts';

export const PRICE = PIXEL_PRICE_WEI;
export const rgb = (c: number): Hex => numberToHex(c, { size: 3 });

export const chain = defineChain({
  id: CHAIN_ID,
  name: 'Polygon (simulated)',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1'] } },
});

export function publicClient(node: DevNode) {
  return createPublicClient({ chain, transport: custom({ request: (args) => node.request(args) }), pollingInterval: 20 });
}

export async function newAccount(node: DevNode, pol = '1000'): Promise<PrivateKeyAccount> {
  const account = privateKeyToAccount(generatePrivateKey());
  await node.request({ method: 'demo_setBalance', params: [account.address, numberToHex(parseEther(pol))] });
  return account;
}

export const balanceOf = async (node: DevNode, address: Address): Promise<bigint> =>
  BigInt(await node.request<Hex>({ method: 'eth_getBalance', params: [address, 'latest'] }));

export const nonceOf = async (node: DevNode, address: Address, tag = 'latest'): Promise<number> =>
  Number(await node.request<Hex>({ method: 'eth_getTransactionCount', params: [address, tag] }));

type Fn = Extract<(typeof pixelsAbi)[number], { type: 'function' }>['name'];

export interface SendOptions {
  value?: bigint;
  gas?: bigint;
  nonce?: number;
  chainId?: number;
  gasPrice?: bigint;
}

/** Signs a legacy transaction calling the Pixels contract. Returns the raw bytes. */
export async function sign(node: DevNode, from: PrivateKeyAccount, functionName: Fn, args: readonly unknown[], opts: SendOptions = {}): Promise<Hex> {
  const data = encodeFunctionData({ abi: pixelsAbi as Abi, functionName, args });
  return from.signTransaction({
    type: 'legacy',
    chainId: opts.chainId ?? CHAIN_ID,
    to: node.contract,
    data,
    value: opts.value ?? 0n,
    gas: opts.gas ?? 28_000_000n,
    gasPrice: opts.gasPrice ?? GAS_PRICE_WEI,
    nonce: opts.nonce ?? (await nonceOf(node, from.address, 'pending')),
  });
}

/** Signs, submits, mines one block and returns the receipt. */
export async function send(node: DevNode, from: PrivateKeyAccount, functionName: Fn, args: readonly unknown[], opts: SendOptions = {}): Promise<DemoReceipt> {
  const raw = await sign(node, from, functionName, args, opts);
  const hash = await node.request<Hex>({ method: 'eth_sendRawTransaction', params: [raw] });
  await node.mine();
  const receipt = await node.request<DemoReceipt | null>({ method: 'eth_getTransactionReceipt', params: [hash] });
  if (!receipt) throw new Error('transaction was not mined');
  return receipt;
}

/** eth_call against the Pixels contract, decoded. */
export async function read<T = unknown>(node: DevNode, functionName: Fn, args: readonly unknown[] = [], from?: Address): Promise<T> {
  const data = encodeFunctionData({ abi: pixelsAbi as Abi, functionName, args });
  const result = await node.request<Hex>({ method: 'eth_call', params: [{ from, to: node.contract, data }, 'latest'] });
  return decodeFunctionResult({ abi: pixelsAbi as Abi, functionName, data: result }) as T;
}

export function reason(data: Hex | undefined): string | undefined {
  if (!data || data === '0x') return undefined;
  return decodeErrorResult({ abi: [{ type: 'error', name: 'Error', inputs: [{ type: 'string', name: 'message' }] }], data }).args[0];
}

/** Awaits a promise that must reject and returns what it rejected with. */
export async function rejection(p: Promise<unknown>): Promise<{ code?: number; message: string; data?: unknown }> {
  try {
    await p;
  } catch (err) {
    return err as { code?: number; message: string; data?: unknown };
  }
  throw new Error('expected a rejection');
}
