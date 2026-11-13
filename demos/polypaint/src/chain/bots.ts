// The simulated other buyers. They live inside the node and use the same path
// as everyone else: eth_sendTransaction (their accounts are unlocked dev
// accounts) into the mempool, mined in the next block, visible through logs.
import { encodeFunctionData, numberToHex } from 'viem';
import type { Hex } from 'viem';
import type { DevNode } from './node.ts';
import { BOTS } from './node.ts';
import { pixelsAbi } from './pixelsArtifact.ts';
import { BRIGHTS, pick, randomSprite } from './sprites.ts';
import type { Sprite } from './sprites.ts';
import { GRID, PIXEL_PRICE_WEI, TOTAL_PIXELS } from './types.ts';

const FIRST_DELAY_MS: [number, number] = [4000, 8000];
const DELAY_MS: [number, number] = [10_000, 30_000];
const TOP_UP_WEI = 5000n * 10n ** 18n;
const RECOLOR_CHANCE = 0.15;
const REMEMBERED = 24;

const between = ([lo, hi]: [number, number]): number => lo + Math.random() * (hi - lo);
const rgb = (c: number): Hex => numberToHex(c, { size: 3 });

export class Bots {
  private readonly node: DevNode;
  private enabled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** Sprites minted this session, so a bot can come back and recolor its own work. */
  private recent: { bot: number; ids: number[] }[] = [];

  constructor(node: DevNode) {
    this.node = node;
  }

  setEnabled(on: boolean): void {
    if (on === this.enabled) return;
    this.enabled = on;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (on) this.schedule(between(FIRST_DELAY_MS));
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => {
      void this.act()
        .catch(() => {})
        .finally(() => {
          if (this.enabled) this.schedule(between(DELAY_MS));
        });
    }, ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  /** One bot action. Returns the transaction hash, or undefined if it found nothing to do. */
  async act(): Promise<Hex | undefined> {
    if (this.recent.length > 0 && Math.random() < RECOLOR_CHANCE) return this.recolor();
    return this.mint();
  }

  private async fund(bot: number, needWei: bigint): Promise<void> {
    const balance = BigInt(await this.node.request<Hex>({ method: 'eth_getBalance', params: [BOTS[bot], 'latest'] }));
    if (balance < needWei * 3n + 10n ** 18n) {
      await this.node.request({ method: 'demo_setBalance', params: [BOTS[bot], numberToHex(TOP_UP_WEI + needWei)] });
    }
  }

  private async mint(): Promise<Hex | undefined> {
    const sprite = randomSprite(Math.random);
    const spot = this.findSpot(sprite);
    if (!spot) return undefined;
    const bot = Math.floor(Math.random() * BOTS.length);
    const ids = sprite.px.map(([dx, dy]) => (spot.y + dy) * GRID + spot.x + dx);
    const value = PIXEL_PRICE_WEI * BigInt(ids.length);
    await this.fund(bot, value);
    const data = encodeFunctionData({
      abi: pixelsAbi,
      functionName: 'mintMultiple',
      args: [ids.map(BigInt), sprite.px.map(([, , c]) => rgb(c)), ''],
    });
    const hash = await this.node.request<Hex>({
      method: 'eth_sendTransaction',
      params: [{ from: BOTS[bot], to: this.node.contract, data, value: numberToHex(value) }],
    });
    this.recent.push({ bot, ids });
    if (this.recent.length > REMEMBERED) this.recent.shift();
    return hash;
  }

  private async recolor(): Promise<Hex | undefined> {
    const target = pick(Math.random, this.recent);
    const owner = this.node.table.owners.findIndex((o) => o.toLowerCase() === BOTS[target.bot].toLowerCase()) + 1;
    // Still pending, or no longer theirs: leave it.
    if (owner === 0 || target.ids.some((id) => this.node.table.ownerIdx[id] !== owner)) return undefined;
    await this.fund(target.bot, 0n);
    const colour = rgb(pick(Math.random, BRIGHTS));
    const data = encodeFunctionData({
      abi: pixelsAbi,
      functionName: 'changePixelColourMultiple',
      args: [target.ids.map(BigInt), target.ids.map(() => colour), ''],
    });
    return this.node.request<Hex>({
      method: 'eth_sendTransaction',
      params: [{ from: BOTS[target.bot], to: this.node.contract, data }],
    });
  }

  /** Top-left corner for the sprite where every pixel (plus a one pixel margin) is free. */
  private findSpot(sprite: Sprite): { x: number; y: number } | undefined {
    const { table, focus } = this.node;
    for (let attempt = 0; attempt < 80; attempt++) {
      let cx: number;
      let cy: number;
      const k = Math.random();
      if (focus && k < 0.55) {
        // Where the visitor is looking.
        cx = focus.x + (Math.random() - 0.5) * 120;
        cy = focus.y + (Math.random() - 0.5) * 90;
      } else if (k < 0.88) {
        // Next to existing art.
        let id = -1;
        for (let t = 0; t < 200 && id < 0; t++) {
          const probe = Math.floor(Math.random() * TOTAL_PIXELS);
          if (table.ownerIdx[probe] !== 0) id = probe;
        }
        if (id < 0) continue;
        cx = (id % GRID) + (Math.random() - 0.5) * 50;
        cy = Math.floor(id / GRID) + (Math.random() - 0.5) * 50;
      } else {
        cx = Math.random() * GRID;
        cy = Math.random() * GRID;
      }
      const x = Math.round(cx - sprite.w / 2);
      const y = Math.round(cy - sprite.h / 2);
      if (x < 1 || y < 1 || x + sprite.w >= GRID - 1 || y + sprite.h >= GRID - 1) continue;
      let free = true;
      for (let dy = -1; dy <= sprite.h && free; dy++) {
        for (let dx = -1; dx <= sprite.w && free; dx++) {
          if (!this.node.isFree((y + dy) * GRID + x + dx)) free = false;
        }
      }
      if (free) return { x, y };
    }
    return undefined;
  }
}
