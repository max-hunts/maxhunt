import { useEffect, useRef } from 'react';
import { resetDemo, setBots, botsEnabled } from './boot.ts';
import { board } from './canvas/board.ts';
import { formatInt } from './lib/format.ts';
import { getApp, setApp, useApp, type Tool } from './store.ts';
import { Header, Minimap, Palette, Ribbon, Stats, Ticker, Tools, ZoomControl } from './ui/Chrome.tsx';
import { Icon } from './ui/Icon.tsx';
import { Help, HoverCard, SidePanel, StampBar, Toast, Tour, loadStampFile } from './ui/Panels.tsx';
import { WalletPopup } from './wallet/WalletPopup.tsx';
import { wallet } from './wallet/wallet.ts';

const TOOL_KEYS: Record<string, Tool> = { v: 'select', b: 'brush', r: 'rect', f: 'fill', e: 'erase', i: 'stamp', h: 'pan' };

function useKeyboard(): void {
  useEffect(() => {
    // Shortcuts stay live on checkboxes, color pickers and buttons; only real text entry swallows keys.
    const NON_TEXT = new Set(['checkbox', 'radio', 'button', 'color', 'file', 'range', 'submit']);
    const typing = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      ((t instanceof HTMLInputElement && !NON_TEXT.has(t.type)) || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const s = getApp();
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') {
        e.preventDefault();
        board.undo();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (k === ' ') {
        e.preventDefault();
        board.setSpace(true);
      } else if (k === 'escape') {
        if (s.help) setApp({ help: false });
        else if (s.sheet) setApp({ sheet: null });
        else if (s.stamp) board.setStamp(null);
        else if (s.wallet.open) wallet.close();
        else if (s.hover?.pinned) board.unpin();
        else if (s.tour >= 0) setApp({ tour: -1 });
        else board.clearDraft();
      } else if (k === 'enter' && s.stamp) {
        board.commitStamp();
      } else if (k === '+' || k === '=') {
        board.zoomBy(1.6);
      } else if (k === '-' || k === '_') {
        board.zoomBy(1 / 1.6);
      } else if (k === '0') {
        board.fit();
      } else if (k === '?') {
        setApp({ help: !s.help });
      } else if (TOOL_KEYS[k]) {
        setApp({ tool: TOOL_KEYS[k] });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') board.setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);
}

/** Dropping an image anywhere starts the stamp tool with it. */
function useImageDrop(): void {
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      const f = e.dataTransfer?.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (f.type.startsWith('image/')) void loadStampFile(f, f.name);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
}

/** Phone-only bottom bar: opens the basket, My pixels and the stats sheet. */
function MobileDock() {
  const basket = useApp((s) => s.basket);
  const mine = useApp((s) => s.myCount);
  const sheet = useApp((s) => s.sheet);
  const toggle = (which: 'basket' | 'mine' | 'stats') => setApp({ sheet: sheet === which ? null : which, ...(which === 'stats' ? {} : { panel: which }) });
  return (
    <nav className="dock" aria-label="Panels">
      <button className={sheet === 'basket' ? 'on' : ''} onClick={() => toggle('basket')} data-testid="dock-basket">
        <Icon name="cart" size={18} />
        Basket{basket.actionable ? <em>{formatInt(basket.actionable)}</em> : null}
      </button>
      <button className={sheet === 'mine' ? 'on' : ''} onClick={() => toggle('mine')}>
        <Icon name="grid" size={16} />
        Mine{mine ? <em>{formatInt(mine)}</em> : null}
      </button>
      <button className={sheet === 'stats' ? 'on' : ''} onClick={() => toggle('stats')} aria-label="Stats and settings">
        <Icon name="more" size={18} />
        More
      </button>
    </nav>
  );
}

function MobileMore() {
  const open = useApp((s) => s.sheet === 'stats');
  const bots = botsEnabled();
  return (
    <div className={`panel sheet more${open ? ' open' : ''}`} aria-hidden={!open}>
      <button className="grab" aria-label="Close" onClick={() => setApp({ sheet: null })} />
      <Stats />
      <div className="morebtns">
        <button
          onClick={() => {
            setBots(!bots);
            setApp({ sheet: null });
          }}
        >
          <Icon name={bots ? 'pause' : 'play'} size={14} /> {bots ? 'Pause other buyers' : 'Resume other buyers'}
        </button>
        <button onClick={() => board.fit()}>
          <Icon name="fit" size={14} /> Fit the whole canvas
        </button>
        <button
          onClick={() => {
            if (window.confirm('Reset the demo? This clears your wallet, your pixels and the saved chain state in this browser.')) resetDemo();
          }}
        >
          <Icon name="reset" size={14} /> Reset demo
        </button>
      </div>
    </div>
  );
}

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chainError = useApp((s) => (s.chain.status === 'error' ? s.chain.error : null));
  useEffect(() => (canvas.current ? board.attach(canvas.current) : undefined), []);
  useKeyboard();
  useImageDrop();
  return (
    <div className="app">
      <Ribbon />
      <Header />
      <main className="board">
        <canvas ref={canvas} className="view" aria-label="PolyPaint canvas, 1000 by 1000 pixels. Use the tools to paint a draft, then buy it." />
        {chainError && <div className="fatal">The in-browser chain could not start ({chainError}). You can still explore the canvas; reload to try again.</div>}
        <Tools />
        <StampBar />
        <ZoomControl />
        <Minimap />
        <Palette />
        {/* Wallet above, basket below: stacked in one column so they never overlap. */}
        <div className="rightcol">
          <WalletPopup />
          <SidePanel />
        </div>
        <MobileMore />
        <MobileDock />
      </main>
      <Ticker />
      <HoverCard />
      <Tour />
      <Toast />
      <Help />
    </div>
  );
}
