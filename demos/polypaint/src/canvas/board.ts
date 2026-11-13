// The canvas engine. Imperative on purpose: one <canvas>, one requestAnimationFrame
// loop that only runs while something changed, pixels kept in a 1000x1000
// ImageData that is patched by dirty rectangle. React never re-renders per frame.
import { GRID, TOTAL_PIXELS, type PixelTable } from '../chain/types.ts';
import { clamp, hexColour } from '../lib/format.ts';
import { activeAccount, getApp, setApp, toast, useApp, EMPTY_BASKET, type HoverInfo, type Tool } from '../store.ts';
import { PixelMirror, boundsOf, type Bounds, type PixelLog } from './pixels.ts';

const PAGE_BG = '#0d0d0c';
const EMPTY = 0x1b1b21;
const ACCENT = '#ff6b3d';
const RULER = 17;
const MAX_DRAFT = 60_000;
const FILL_CAP = 4_000;
const FILL_REACH = 90;
const MAX_ZOOM = 64;
const GRID_FROM = 8;

/** 0xRRGGBB to the little-endian ABGR word ImageData uses. */
const abgr = (c: number) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >>> 16) & 0xff)) >>> 0;

export interface StampImage {
  w: number;
  h: number;
  /** 0xRRGGBB per cell, or -1 for transparent. */
  data: Int32Array;
  name: string;
}

type Drag =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean; tap: boolean }
  | { kind: 'paint'; erase: boolean; lx: number; ly: number }
  | { kind: 'rect'; ax: number; ay: number; bx: number; by: number; erase: boolean }
  | { kind: 'stamp'; ox: number; oy: number }
  | { kind: 'fill' };

type UndoOp = [id: number, previous: number][]; // previous = -1 when the pixel was not in the draft

export class Board {
  readonly mirror = new PixelMirror();
  /** Painted but not yet bought/recolored pixels: id -> 0xRRGGBB. */
  readonly draft = new Map<number, number>();

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private mini: HTMLCanvasElement | null = null;
  private base = document.createElement('canvas');
  private baseCtx: CanvasRenderingContext2D;
  private baseImg: ImageData;
  private base32: Uint32Array;
  private draftLayer = document.createElement('canvas');
  private draftCtx: CanvasRenderingContext2D;
  private flagLayer = document.createElement('canvas');
  private flagCtx: CanvasRenderingContext2D;
  private flagged = new Set<number>();
  private dirty: Bounds | null = null;

  // view: top-left corner in art pixels, zoom in CSS px per art pixel
  x = 0;
  y = 0;
  zoom = 1;
  private W = 0;
  private H = 0;
  private dpr = 1;
  private anim: { ax: number; ay: number; sx: number; sy: number; target: number } | { cx: number; cy: number; target: number } | null = null;
  private raf = 0;
  private needsDraw = false;
  private basketDirty = false;
  private groupsTimer = 0;
  private miniTimer = 0;
  private lastViewPush = 0;

  // input
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private drag: Drag | null = null;
  private pinch: { dist: number; zoom: number; ax: number; ay: number } | null = null;
  private stroke: UndoOp | null = null;
  private undoStack: UndoOp[] = [];
  private anchor: { x: number; y: number } | null = null;
  private spaceDown = false;
  private hoverPx: { x: number; y: number } | null = null;
  private pinned: { x: number; y: number } | null = null;
  private ro: ResizeObserver | null = null;

  // stamp ghost
  private stamp: { img: StampImage; canvas: HTMLCanvasElement; x: number; y: number } | null = null;

  constructor() {
    for (const c of [this.base, this.draftLayer, this.flagLayer]) {
      c.width = GRID;
      c.height = GRID;
    }
    this.baseCtx = this.base.getContext('2d', { alpha: false })!;
    this.draftCtx = this.draftLayer.getContext('2d')!;
    this.flagCtx = this.flagLayer.getContext('2d')!;
    this.baseImg = this.baseCtx.createImageData(GRID, GRID);
    this.base32 = new Uint32Array(this.baseImg.data.buffer);
    this.base32.fill(abgr(EMPTY));
    this.baseCtx.putImageData(this.baseImg, 0, 0);

    // Anything that changes which draft pixels are actionable.
    useApp.subscribe((s, p) => {
      if (s.mode !== p.mode || s.wallet.connected !== p.wallet.connected || s.wallet.selected !== p.wallet.selected || s.wallet.accounts !== p.wallet.accounts) {
        this.basketDirty = true;
        this.scheduleGroups(0);
        this.requestDraw();
      }
      if (s.tool !== p.tool) this.updateCursor();
    });
  }

  // ------------------------------------------------------------------ setup

  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    const onDown = (e: PointerEvent) => this.onPointerDown(e);
    const onMove = (e: PointerEvent) => this.onPointerMove(e);
    const onUp = (e: PointerEvent) => this.onPointerUp(e);
    const onLeave = () => this.setHover(null);
    const onWheel = (e: WheelEvent) => this.onWheel(e);
    const onMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onMenu);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize(true);
    this.updateCursor();
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onMenu);
      this.ro?.disconnect();
      this.canvas = null;
      this.ctx = null;
    };
  }

  attachMinimap(canvas: HTMLCanvasElement): () => void {
    this.mini = canvas;
    let down = false;
    const go = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * GRID;
      const py = ((e.clientY - r.top) / r.height) * GRID;
      this.anim = null;
      this.x = px - this.W / (2 * this.zoom);
      this.y = py - this.H / (2 * this.zoom);
      this.clampView();
      this.requestDraw();
    };
    const onDown = (e: PointerEvent) => {
      down = true;
      canvas.setPointerCapture(e.pointerId);
      go(e);
    };
    const onMove = (e: PointerEvent) => down && go(e);
    const onUp = () => (down = false);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    this.drawMinimap();
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      this.mini = null;
    };
  }

  private resize(first = false): void {
    const c = this.canvas;
    if (!c) return;
    const r = c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const cx = this.x + this.W / (2 * this.zoom);
    const cy = this.y + this.H / (2 * this.zoom);
    const had = this.W > 0;
    this.W = r.width;
    this.H = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    c.width = Math.round(this.W * this.dpr);
    c.height = Math.round(this.H * this.dpr);
    if (first || !had) {
      // Open on the seeded centerpiece rather than a mostly empty overview.
      this.zoom = clamp(Math.min(this.W / 250, this.H / 135), 2, 8);
      this.x = 527 - this.W / (2 * this.zoom);
      // On phones the bottom third is covered by the tool, color and panel bars.
      this.y = 505 - (this.H * (this.W < 760 ? 0.36 : 0.5)) / this.zoom;
    } else {
      this.x = cx - this.W / (2 * this.zoom);
      this.y = cy - this.H / (2 * this.zoom);
    }
    this.clampView();
    this.draw();
    this.pushView(true);
  }

  // ------------------------------------------------------------------- data

  /** Replace the whole canvas (seed load). */
  loadTable(table: PixelTable): void {
    this.mirror.load(table);
    this.repaintAll();
    this.afterPixelChange();
  }

  private repaintAll(): void {
    const { ownerIdx, colours } = this.mirror;
    const out = this.base32;
    const empty = abgr(EMPTY);
    for (let i = 0; i < TOTAL_PIXELS; i++) out[i] = ownerIdx[i] ? abgr(colours[i]) : empty;
    this.dirty = { x0: 0, y0: 0, x1: GRID - 1, y1: GRID - 1 };
    this.requestDraw();
  }

  /** Apply decoded contract events and repaint only what changed. */
  applyLogs(logs: PixelLog[]): void {
    if (!logs.length) return;
    for (const id of this.mirror.applyLogs(logs)) this.paint(id);
    this.afterPixelChange();
  }

  private paint(id: number): void {
    this.base32[id] = this.mirror.ownerIdx[id] ? abgr(this.mirror.colours[id]) : abgr(EMPTY);
    const x = id % GRID, y = (id / GRID) | 0;
    const d = this.dirty;
    if (!d) this.dirty = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < d.x0) d.x0 = x;
      if (x > d.x1) d.x1 = x;
      if (y < d.y0) d.y0 = y;
      if (y > d.y1) d.y1 = y;
    }
  }

  private afterPixelChange(): void {
    setApp((s) => ({ stats: { ...s.stats, owned: this.mirror.owned, owners: this.mirror.uniqueOwners() } }));
    this.basketDirty = true;
    this.scheduleGroups(250);
    this.scheduleMinimap();
    if (this.pinned) this.refreshHover();
    this.requestDraw();
  }

  private scheduleGroups(delay: number): void {
    window.clearTimeout(this.groupsTimer);
    this.groupsTimer = window.setTimeout(() => {
      const me = activeAccount();
      const groups = me ? this.mirror.groupsOwnedBy(me) : [];
      setApp({ myGroups: groups, myCount: groups.reduce((n, g) => n + g.count, 0) });
    }, delay);
  }

  // ------------------------------------------------------------------ draft

  private setDraft(id: number, colour: number): void {
    const prev = this.draft.get(id);
    if (prev === colour) return;
    if (prev === undefined && this.draft.size >= MAX_DRAFT) return;
    this.stroke?.push([id, prev ?? -1]);
    this.draft.set(id, colour);
    this.draftCtx.fillStyle = hexColour(colour);
    this.draftCtx.fillRect(id % GRID, (id / GRID) | 0, 1, 1);
    this.basketDirty = true;
  }

  private unsetDraft(id: number): void {
    const prev = this.draft.get(id);
    if (prev === undefined) return;
    this.stroke?.push([id, prev]);
    this.draft.delete(id);
    this.draftCtx.clearRect(id % GRID, (id / GRID) | 0, 1, 1);
    this.basketDirty = true;
  }

  private beginStroke(): void {
    this.stroke = [];
  }

  private endStroke(): void {
    if (this.stroke && this.stroke.length) {
      this.undoStack.push(this.stroke);
      if (this.undoStack.length > 60) this.undoStack.shift();
    }
    this.stroke = null;
    if (this.draft.size >= MAX_DRAFT) toast(`Draft is capped at ${MAX_DRAFT.toLocaleString('en-US')} pixels.`, 'warn');
  }

  undo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    for (let i = op.length - 1; i >= 0; i--) {
      const [id, prev] = op[i];
      if (prev < 0) this.unsetDraft(id);
      else this.setDraft(id, prev);
    }
    this.requestDraw();
  }

  clearDraft(): void {
    if (!this.draft.size) return;
    this.beginStroke();
    for (const id of [...this.draft.keys()]) this.unsetDraft(id);
    this.endStroke();
    this.requestDraw();
  }

  /** Drop pixels from the draft without recording undo (they were just bought or recolored). */
  removeFromDraft(ids: Iterable<number>): void {
    for (const id of ids) {
      if (this.draft.delete(id)) this.draftCtx.clearRect(id % GRID, (id / GRID) | 0, 1, 1);
    }
    this.undoStack = [];
    this.basketDirty = true;
    this.requestDraw();
  }

  /** Put pixels into the draft (My pixels: "recolor this block"). */
  addToDraft(ids: Iterable<number>, colour: number): void {
    this.beginStroke();
    for (const id of ids) this.setDraft(id, colour);
    this.endStroke();
    this.requestDraw();
  }

  /** Draft pixels the current mode can act on, sorted by id, plus the flagged rest. */
  split(): { ids: number[]; colours: number[]; flagged: number[] } {
    const { mode } = getApp();
    const me = this.mirror.indexOfOwner(activeAccount());
    const ids: number[] = [];
    const flagged: number[] = [];
    for (const id of this.draft.keys()) {
      const o = this.mirror.ownerIdx[id];
      const ok = mode === 'buy' ? o === 0 : o !== 0 && o === me;
      (ok ? ids : flagged).push(id);
    }
    ids.sort((a, b) => a - b);
    flagged.sort((a, b) => a - b);
    return { ids, colours: ids.map((id) => this.draft.get(id)!), flagged };
  }

  private recomputeBasket(): void {
    this.basketDirty = false;
    const { mode } = getApp();
    const me = this.mirror.indexOfOwner(activeAccount());
    let free = 0, mine = 0, others = 0;
    const flagged = this.flagged;
    flagged.clear();
    for (const id of this.draft.keys()) {
      const o = this.mirror.ownerIdx[id];
      if (o === 0) {
        free++;
        if (mode === 'recolor') flagged.add(id);
      } else if (o === me) {
        mine++;
        if (mode === 'buy') flagged.add(id);
      } else {
        others++;
        flagged.add(id);
      }
    }
    this.flagCtx.clearRect(0, 0, GRID, GRID);
    this.flagCtx.fillStyle = 'rgba(255, 64, 64, 0.62)';
    for (const id of flagged) this.flagCtx.fillRect(id % GRID, (id / GRID) | 0, 1, 1);
    const total = this.draft.size;
    setApp({
      basket: total
        ? { total, actionable: mode === 'buy' ? free : mine, others, mine, free, bounds: boundsOf(this.draft.keys()) }
        : EMPTY_BASKET,
    });
  }

  // ------------------------------------------------------------------- view

  private minZoom(): number {
    return Math.max(0.3, (Math.min(this.W, this.H) / GRID) * 0.7);
  }

  private clampView(): void {
    const halfW = this.W / (2 * this.zoom), halfH = this.H / (2 * this.zoom);
    this.x = clamp(this.x, -halfW, GRID - halfW);
    this.y = clamp(this.y, -halfH, GRID - halfH);
  }

  /** Zoom by a factor, keeping the given screen point (default: center) fixed. Eased. */
  zoomBy(factor: number, sx = this.W / 2, sy = this.H / 2): void {
    const from = this.anim ? this.anim.target : this.zoom;
    const target = clamp(from * factor, this.minZoom(), MAX_ZOOM);
    this.anim = { ax: this.x + sx / this.zoom, ay: this.y + sy / this.zoom, sx, sy, target };
    this.requestDraw();
  }

  fit(): void {
    this.anim = { cx: GRID / 2, cy: GRID / 2, target: (Math.min(this.W, this.H) / GRID) * 0.92 };
    this.requestDraw();
  }

  /** Fly to a region and frame it. */
  jumpTo(b: Bounds, maxZoom = 14): void {
    const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
    const target = clamp(Math.min((this.W * 0.5) / w, (this.H * 0.5) / h), this.minZoom(), maxZoom);
    this.anim = { cx: b.x0 + w / 2, cy: b.y0 + h / 2, target };
    this.requestDraw();
  }

  private stepAnim(): void {
    const a = this.anim;
    if (!a) return;
    const k = 0.24;
    const lz = Math.log(this.zoom) + (Math.log(a.target) - Math.log(this.zoom)) * k;
    let z = Math.exp(lz);
    const done = Math.abs(Math.log(a.target / z)) < 0.002;
    if (done) z = a.target;
    if ('ax' in a) {
      this.zoom = z;
      this.x = a.ax - a.sx / z;
      this.y = a.ay - a.sy / z;
      if (done) this.anim = null;
    } else {
      const cx = this.x + this.W / (2 * this.zoom), cy = this.y + this.H / (2 * this.zoom);
      const nx = cx + (a.cx - cx) * k, ny = cy + (a.cy - cy) * k;
      this.zoom = z;
      const close = Math.abs(a.cx - nx) < 0.05 && Math.abs(a.cy - ny) < 0.05;
      this.x = (close ? a.cx : nx) - this.W / (2 * z);
      this.y = (close ? a.cy : ny) - this.H / (2 * z);
      if (done && close) this.anim = null;
    }
    this.clampView();
  }

  private pushView(force = false): void {
    const now = performance.now();
    if (!force && now - this.lastViewPush < 90) return;
    this.lastViewPush = now;
    setApp({ view: { zoom: this.zoom, x: this.x, y: this.y, w: this.W, h: this.H } });
  }

  /** Client rect -> art pixel under a client coordinate (may be outside the grid). */
  private toPixel(clientX: number, clientY: number): { x: number; y: number; sx: number; sy: number } {
    const r = this.canvas!.getBoundingClientRect();
    const sx = clientX - r.left, sy = clientY - r.top;
    return { x: Math.floor(this.x + sx / this.zoom), y: Math.floor(this.y + sy / this.zoom), sx, sy };
  }

  private inGrid(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < GRID && y < GRID;
  }

  // ------------------------------------------------------------------ input

  private effectiveTool(e: PointerEvent): Tool {
    if (e.button === 1 || e.button === 2 || this.spaceDown) return 'pan';
    return getApp().tool;
  }

  private updateCursor(): void {
    if (!this.canvas) return;
    const t = this.spaceDown ? 'pan' : getApp().tool;
    this.canvas.style.cursor = t === 'pan' ? 'grab' : t === 'select' ? 'default' : t === 'stamp' ? 'move' : 'crosshair';
  }

  setSpace(down: boolean): void {
    if (this.spaceDown === down) return;
    this.spaceDown = down;
    this.updateCursor();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const r = this.canvas!.getBoundingClientRect();
    const unit = e.deltaMode === 1 ? 33 : 1;
    const speed = e.ctrlKey ? 0.012 : 0.0022; // ctrl+wheel is a trackpad pinch
    this.zoomBy(Math.exp(-e.deltaY * unit * speed), e.clientX - r.left, e.clientY - r.top);
  }

  private onPointerDown(e: PointerEvent): void {
    const c = this.canvas!;
    c.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.setHover(null, true);

    if (this.pointers.size === 2) {
      // Second finger: whatever the first one was doing becomes a pinch.
      if (this.stroke) {
        const op = this.stroke;
        this.stroke = null;
        for (let i = op.length - 1; i >= 0; i--) (op[i][1] < 0 ? this.unsetDraft(op[i][0]) : this.setDraft(op[i][0], op[i][1]));
      }
      this.drag = null;
      const [a, b] = [...this.pointers.values()];
      const p = this.toPixel((a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: this.zoom, ax: this.x + p.sx / this.zoom, ay: this.y + p.sy / this.zoom };
      this.anim = null;
      return;
    }
    if (this.pointers.size > 2) return;

    const tool = this.effectiveTool(e);
    const p = this.toPixel(e.clientX, e.clientY);
    const erase = e.altKey || tool === 'erase';
    this.anim = null;

    if (tool === 'pan' || tool === 'select') {
      this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.x, vy: this.y, moved: false, tap: tool === 'select' };
      if (tool === 'pan') c.style.cursor = 'grabbing';
    } else if (tool === 'brush' || tool === 'erase') {
      this.beginStroke();
      this.drag = { kind: 'paint', erase, lx: p.x, ly: p.y };
      this.paintLine(p.x, p.y, p.x, p.y, erase);
    } else if (tool === 'rect') {
      this.drag = { kind: 'rect', ax: p.x, ay: p.y, bx: p.x, by: p.y, erase };
    } else if (tool === 'fill') {
      this.drag = { kind: 'fill' };
    } else if (tool === 'stamp') {
      if (this.stamp) this.drag = { kind: 'stamp', ox: p.x - this.stamp.x, oy: p.y - this.stamp.y };
      else this.drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: this.x, vy: this.y, moved: false, tap: false };
    }
    this.requestDraw();
  }

  private onPointerMove(e: PointerEvent): void {
    const prev = this.pointers.get(e.pointerId);
    if (prev) {
      prev.x = e.clientX;
      prev.y = e.clientY;
    }

    if (this.pinch && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const p = this.toPixel((a.x + b.x) / 2, (a.y + b.y) / 2);
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.zoom = clamp(this.pinch.zoom * (dist / this.pinch.dist), this.minZoom(), MAX_ZOOM);
      this.x = this.pinch.ax - p.sx / this.zoom;
      this.y = this.pinch.ay - p.sy / this.zoom;
      this.clampView();
      this.requestDraw();
      return;
    }

    const p = this.toPixel(e.clientX, e.clientY);
    const d = this.drag;
    if (!d) {
      if (e.pointerType === 'mouse') {
        this.setHover(this.inGrid(p.x, p.y) ? { x: p.x, y: p.y } : null);
        const cur = getApp().pointer;
        if (!cur || cur.x !== p.x || cur.y !== p.y) setApp({ pointer: this.inGrid(p.x, p.y) ? { x: p.x, y: p.y } : null });
      }
      return;
    }
    if (d.kind === 'pan') {
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) > (e.pointerType === 'mouse' ? 3 : 8)) d.moved = true;
      if (d.moved) {
        this.x = d.vx - dx / this.zoom;
        this.y = d.vy - dy / this.zoom;
        this.clampView();
      }
    } else if (d.kind === 'paint') {
      this.paintLine(d.lx, d.ly, p.x, p.y, d.erase);
      d.lx = p.x;
      d.ly = p.y;
    } else if (d.kind === 'rect') {
      d.bx = p.x;
      d.by = p.y;
    } else if (d.kind === 'stamp' && this.stamp) {
      this.stamp.x = clamp(p.x - d.ox, 0, GRID - this.stamp.img.w);
      this.stamp.y = clamp(p.y - d.oy, 0, GRID - this.stamp.img.h);
    }
    this.requestDraw();
  }

  private onPointerUp(e: PointerEvent): void {
    this.pointers.delete(e.pointerId);
    if (this.pinch) {
      if (this.pointers.size < 2) this.pinch = null;
      this.drag = null;
      this.pushView(true);
      return;
    }
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const p = this.toPixel(e.clientX, e.clientY);
    if (d.kind === 'pan') {
      this.updateCursor();
      if (!d.moved && d.tap && e.type === 'pointerup') this.click(p.x, p.y, e.shiftKey, e.pointerType !== 'mouse');
    } else if (d.kind === 'paint') {
      this.endStroke();
    } else if (d.kind === 'rect') {
      this.beginStroke();
      const x0 = clamp(Math.min(d.ax, d.bx), 0, GRID - 1), x1 = clamp(Math.max(d.ax, d.bx), 0, GRID - 1);
      const y0 = clamp(Math.min(d.ay, d.by), 0, GRID - 1), y1 = clamp(Math.max(d.ay, d.by), 0, GRID - 1);
      const colour = getApp().colour;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) (d.erase ? this.unsetDraft(y * GRID + x) : this.setDraft(y * GRID + x, colour));
      this.endStroke();
    } else if (d.kind === 'fill' && e.type === 'pointerup' && this.inGrid(p.x, p.y)) {
      this.floodFill(p.x, p.y);
    }
    this.pushView(true);
    this.requestDraw();
  }

  /** Select tool click: toggle a pixel the mode can act on, otherwise pin its info card. */
  private click(x: number, y: number, shift: boolean, touch: boolean): void {
    if (!this.inGrid(x, y)) {
      this.pinned = null;
      this.setHover(null, true);
      return;
    }
    const id = y * GRID + x;
    const { mode, colour } = getApp();
    const o = this.mirror.ownerIdx[id];
    const me = this.mirror.indexOfOwner(activeAccount());
    const actionable = mode === 'buy' ? o === 0 : o !== 0 && o === me;
    if (shift && this.anchor) {
      this.beginStroke();
      const x0 = Math.min(x, this.anchor.x), x1 = Math.max(x, this.anchor.x);
      const y0 = Math.min(y, this.anchor.y), y1 = Math.max(y, this.anchor.y);
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) this.setDraft(yy * GRID + xx, colour);
      this.endStroke();
      this.pinned = null;
    } else if (actionable || this.draft.has(id)) {
      this.beginStroke();
      if (this.draft.has(id)) this.unsetDraft(id);
      else this.setDraft(id, colour);
      this.endStroke();
      this.anchor = { x, y };
      this.pinned = null;
      if (touch) this.setHover(null, true);
    } else {
      // Not something this mode can act on: show who owns it instead.
      this.pinned = this.pinned && this.pinned.x === x && this.pinned.y === y ? null : { x, y };
      this.anchor = { x, y };
      this.refreshHover();
    }
    this.requestDraw();
  }

  private paintLine(x0: number, y0: number, x1: number, y1: number, erase: boolean): void {
    const colour = getApp().colour;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (let guard = 0; guard < 4000; guard++) {
      if (this.inGrid(x, y)) (erase ? this.unsetDraft(y * GRID + x) : this.setDraft(y * GRID + x, colour));
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  /**
   * Fill the connected area around a click. Buy mode floods unowned pixels,
   * Recolor mode floods the connected block of your own pixels. Bounded, so a
   * click on the open canvas cannot select a million pixels.
   */
  private floodFill(x: number, y: number): void {
    const { mode, colour } = getApp();
    const me = this.mirror.indexOfOwner(activeAccount());
    const idx = this.mirror.ownerIdx;
    const ok = (id: number) => (mode === 'buy' ? idx[id] === 0 : idx[id] !== 0 && idx[id] === me) && this.draft.get(id) !== colour;
    const start = y * GRID + x;
    if (!ok(start)) {
      toast(mode === 'buy' ? 'Fill starts on an unowned pixel.' : 'Fill starts on one of your pixels (connect the wallet first).', 'warn');
      return;
    }
    this.beginStroke();
    const seen = new Set<number>([start]);
    const queue = [start];
    let n = 0;
    while (queue.length && n < FILL_CAP) {
      const id = queue.shift()!;
      this.setDraft(id, colour);
      n++;
      const px = id % GRID, py = (id / GRID) | 0;
      for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]] as const) {
        if (!this.inGrid(nx, ny) || Math.abs(nx - x) > FILL_REACH || Math.abs(ny - y) > FILL_REACH) continue;
        const nid = ny * GRID + nx;
        if (!seen.has(nid) && ok(nid)) {
          seen.add(nid);
          queue.push(nid);
        }
      }
    }
    this.endStroke();
    if (queue.length) toast(`Fill stopped at ${FILL_CAP.toLocaleString('en-US')} pixels.`, 'info');
  }

  // ------------------------------------------------------------------ hover

  private setHover(px: { x: number; y: number } | null, clearPin = false): void {
    if (clearPin) this.pinned = null;
    const same = (a: typeof px, b: typeof px) => (a && b ? a.x === b.x && a.y === b.y : a === b);
    if (same(px, this.hoverPx) && !clearPin) return;
    this.hoverPx = px;
    this.refreshHover();
    this.requestDraw();
  }

  private refreshHover(): void {
    const target = this.pinned ?? this.hoverPx;
    if (!target || !this.canvas) {
      if (getApp().hover) setApp({ hover: null });
      return;
    }
    setApp({ hover: this.describe(target.x, target.y, !!this.pinned) });
  }

  private describe(x: number, y: number, pinned: boolean): HoverInfo {
    const id = y * GRID + x;
    const owner = this.mirror.ownerOf(id);
    const me = activeAccount();
    const r = this.canvas!.getBoundingClientRect();
    return {
      x, y, id,
      colour: owner ? this.mirror.colours[id] : null,
      owner,
      url: owner ? this.mirror.urlOf(id) : '',
      mine: !!owner && !!me && owner.toLowerCase() === me.toLowerCase(),
      draftColour: this.draft.get(id) ?? null,
      sx: r.left + (x + 0.5 - this.x) * this.zoom,
      sy: r.top + (y + 0.5 - this.y) * this.zoom,
      pinned,
    };
  }

  unpin(): void {
    if (!this.pinned) return;
    this.pinned = null;
    this.refreshHover();
    this.requestDraw();
  }

  // ------------------------------------------------------------------ stamp

  setStamp(img: StampImage | null): void {
    if (!img) {
      this.stamp = null;
      setApp({ stamp: null });
      this.requestDraw();
      return;
    }
    const c = document.createElement('canvas');
    c.width = img.w;
    c.height = img.h;
    const g = c.getContext('2d')!;
    const im = g.createImageData(img.w, img.h);
    const out = new Uint32Array(im.data.buffer);
    for (let i = 0; i < img.data.length; i++) out[i] = img.data[i] < 0 ? 0 : abgr(img.data[i]);
    g.putImageData(im, 0, 0);
    const prev = this.stamp;
    const cx = prev ? prev.x + prev.img.w / 2 : this.x + this.W / (2 * this.zoom);
    const cy = prev ? prev.y + prev.img.h / 2 : this.y + this.H / (2 * this.zoom);
    this.stamp = {
      img,
      canvas: c,
      x: clamp(Math.round(cx - img.w / 2), 0, GRID - img.w),
      y: clamp(Math.round(cy - img.h / 2), 0, GRID - img.h),
    };
    setApp({ stamp: { w: img.w, h: img.h, name: img.name }, tool: 'stamp' });
    this.requestDraw();
  }

  /** Turn the ghost into draft pixels. */
  commitStamp(): void {
    const s = this.stamp;
    if (!s) return;
    this.beginStroke();
    for (let j = 0; j < s.img.h; j++) {
      for (let i = 0; i < s.img.w; i++) {
        const c = s.img.data[j * s.img.w + i];
        if (c >= 0) this.setDraft((s.y + j) * GRID + (s.x + i), c);
      }
    }
    this.endStroke();
    this.stamp = null;
    setApp({ stamp: null, tool: 'select' });
    this.requestDraw();
  }

  // ----------------------------------------------------------------- render

  requestDraw(): void {
    this.needsDraw = true;
    if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  }

  private frame(): void {
    this.raf = 0;
    if (this.anim) this.stepAnim();
    if (this.basketDirty) this.recomputeBasket();
    if (this.needsDraw || this.anim) {
      this.needsDraw = false;
      this.draw();
      this.pushView(!this.anim && !this.drag && !this.pinch);
      if (this.pinned) this.refreshHover();
    }
    if (this.anim) this.raf = requestAnimationFrame(() => this.frame());
  }

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx || !this.W) return;
    const { W, H, zoom: z, dpr } = this;
    if (this.dirty) {
      const d = this.dirty;
      this.baseCtx.putImageData(this.baseImg, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
      this.dirty = null;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = PAGE_BG;
    ctx.fillRect(0, 0, W, H);

    // visible source rectangle, snapped outward to whole pixels
    const sx0 = Math.max(0, Math.floor(this.x)), sy0 = Math.max(0, Math.floor(this.y));
    const sx1 = Math.min(GRID, Math.ceil(this.x + W / z)), sy1 = Math.min(GRID, Math.ceil(this.y + H / z));
    if (sx1 > sx0 && sy1 > sy0) {
      const dx = (sx0 - this.x) * z, dy = (sy0 - this.y) * z, dw = (sx1 - sx0) * z, dh = (sy1 - sy0) * z;
      ctx.imageSmoothingEnabled = z < 1;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.base, sx0, sy0, sx1 - sx0, sy1 - sy0, dx, dy, dw, dh);
      if (this.draft.size) {
        ctx.drawImage(this.draftLayer, sx0, sy0, sx1 - sx0, sy1 - sy0, dx, dy, dw, dh);
        if (this.flagged.size) ctx.drawImage(this.flagLayer, sx0, sy0, sx1 - sx0, sy1 - sy0, dx, dy, dw, dh);
      }

      // pixel grid fades in past ~8x
      if (z >= GRID_FROM) {
        ctx.strokeStyle = `rgba(255,255,255,${(0.075 * clamp((z - GRID_FROM) / 6, 0.25, 1)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let gx = sx0; gx <= sx1; gx++) {
          const p = Math.round((gx - this.x) * z) + 0.5;
          ctx.moveTo(p, dy);
          ctx.lineTo(p, dy + dh);
        }
        for (let gy = sy0; gy <= sy1; gy++) {
          const p = Math.round((gy - this.y) * z) + 0.5;
          ctx.moveTo(dx, p);
          ctx.lineTo(dx + dw, p);
        }
        ctx.stroke();
      }

      // crosses on flagged draft pixels once they are big enough to read
      if (z >= 6 && this.flagged.size && this.flagged.size < 40_000) {
        ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.lineWidth = Math.min(1.6, z / 6);
        ctx.beginPath();
        const m = Math.max(1.5, z * 0.25);
        for (const id of this.flagged) {
          const fx = id % GRID, fy = (id / GRID) | 0;
          if (fx < sx0 || fx >= sx1 || fy < sy0 || fy >= sy1) continue;
          const px = (fx - this.x) * z, py = (fy - this.y) * z;
          ctx.moveTo(px + m, py + m);
          ctx.lineTo(px + z - m, py + z - m);
          ctx.moveTo(px + z - m, py + m);
          ctx.lineTo(px + m, py + z - m);
        }
        ctx.stroke();
      }
    }

    // board edge
    ctx.strokeStyle = 'rgba(255,255,255,.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(-this.x * z) - 0.5, Math.round(-this.y * z) - 0.5, Math.round(GRID * z) + 1, Math.round(GRID * z) + 1);

    this.drawDraftFrame(ctx);
    this.drawStamp(ctx);

    // rectangle being dragged
    const d = this.drag;
    if (d && d.kind === 'rect') {
      const x0 = Math.min(d.ax, d.bx), y0 = Math.min(d.ay, d.by);
      const w = Math.abs(d.ax - d.bx) + 1, h = Math.abs(d.ay - d.by) + 1;
      const px = (x0 - this.x) * z, py = (y0 - this.y) * z;
      ctx.fillStyle = d.erase ? 'rgba(255,255,255,.12)' : hexColour(getApp().colour) + '99';
      ctx.fillRect(px, py, w * z, h * z);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, w * z - 1, h * z - 1);
      this.label(ctx, `${w} × ${h}`, px, py - 8);
    }

    // hovered / pinned pixel
    const hp = this.pinned ?? (this.drag ? null : this.hoverPx);
    if (hp && z >= 3) {
      const px = (hp.x - this.x) * z, py = (hp.y - this.y) * z;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0d0d0c';
      ctx.strokeRect(px - 2.25, py - 2.25, z + 4.5, z + 4.5);
      ctx.strokeStyle = this.pinned ? ACCENT : '#fff';
      ctx.strokeRect(px - 0.75, py - 0.75, z + 1.5, z + 1.5);
    }

    if (W >= 760) this.drawRulers(ctx);
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
    ctx.font = '700 10px "JetBrains Mono", ui-monospace, monospace';
    const w = ctx.measureText(text).width + 12;
    const lx = clamp(x, RULER + 4, this.W - w - 4), ly = Math.max(RULER + 20, y);
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.roundRect(lx, ly - 16, w, 18, 3);
    ctx.fill();
    ctx.fillStyle = '#0d0d0c';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, lx + 6, ly - 6.5);
  }

  private drawDraftFrame(ctx: CanvasRenderingContext2D): void {
    const b = getApp().basket.bounds;
    if (!b || !this.draft.size) return;
    const z = this.zoom;
    const px = (b.x0 - this.x) * z, py = (b.y0 - this.y) * z;
    const w = (b.x1 - b.x0 + 1) * z, h = (b.y1 - b.y0 + 1) * z;
    if (px > this.W || py > this.H || px + w < 0 || py + h < 0) return;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(px - 4.5, py - 4.5, w + 9, h + 9);
    ctx.restore();
    this.label(ctx, `DRAFT  ${b.x1 - b.x0 + 1} × ${b.y1 - b.y0 + 1}`, px - 5, py - 12);
  }

  private drawStamp(ctx: CanvasRenderingContext2D): void {
    const s = this.stamp;
    if (!s) return;
    const z = this.zoom;
    const px = (s.x - this.x) * z, py = (s.y - this.y) * z;
    const w = s.img.w * z, h = s.img.h * z;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.82;
    ctx.drawImage(s.canvas, px, py, w, h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(px - 1, py - 1, w + 2, h + 2);
    ctx.restore();
    this.label(ctx, `STAMP  ${s.img.w} × ${s.img.h}  DRAG TO PLACE`, px - 1, py - 8);
  }

  private drawRulers(ctx: CanvasRenderingContext2D): void {
    const { W, H, zoom: z } = this;
    const steps = [1, 2, 5, 10, 20, 50, 100, 200];
    const major = steps.find((s) => s * z >= 56) ?? 200;
    const minor = major >= 10 ? major / 5 : major >= 5 ? 1 : major;
    ctx.fillStyle = 'rgba(13,13,12,.88)';
    ctx.fillRect(0, 0, W, RULER);
    ctx.fillRect(0, 0, RULER, H);
    ctx.fillStyle = '#6b6a63';
    ctx.font = '400 8.5px "JetBrains Mono", ui-monospace, monospace';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let v = Math.ceil(Math.max(0, this.x) / minor) * minor; v <= Math.min(GRID, this.x + W / z); v += minor) {
      const p = Math.round((v - this.x) * z) + 0.5;
      if (p < RULER) continue;
      const maj = v % major === 0;
      ctx.moveTo(p, RULER);
      ctx.lineTo(p, RULER - (maj ? 7 : 4));
      if (maj) ctx.fillText(String(v), p + 3, RULER - 6);
    }
    for (let v = Math.ceil(Math.max(0, this.y) / minor) * minor; v <= Math.min(GRID, this.y + H / z); v += minor) {
      const p = Math.round((v - this.y) * z) + 0.5;
      if (p < RULER) continue;
      ctx.moveTo(RULER, p);
      ctx.lineTo(RULER - (v % major === 0 ? 7 : 4), p);
    }
    ctx.strokeStyle = 'rgba(255,255,255,.26)';
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.beginPath();
    ctx.moveTo(0, RULER + 0.5);
    ctx.lineTo(W, RULER + 0.5);
    ctx.moveTo(RULER + 0.5, 0);
    ctx.lineTo(RULER + 0.5, H);
    ctx.stroke();
    ctx.fillStyle = PAGE_BG;
    ctx.fillRect(0, 0, RULER, RULER);
  }

  // ---------------------------------------------------------------- minimap

  private scheduleMinimap(): void {
    if (this.miniTimer) return;
    this.miniTimer = window.setTimeout(() => {
      this.miniTimer = 0;
      this.drawMinimap();
    }, 400);
  }

  drawMinimap(): void {
    const m = this.mini;
    if (!m) return;
    const size = m.clientWidth || 120;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (m.width !== Math.round(size * dpr)) m.width = m.height = Math.round(size * dpr);
    const c = m.getContext('2d')!;
    if (this.dirty) {
      this.baseCtx.putImageData(this.baseImg, 0, 0);
      this.dirty = null;
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    c.drawImage(this.base, 0, 0, GRID, GRID, 0, 0, size, size);
  }
}

export const board = new Board();
