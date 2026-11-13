// Header, tool rail, palette, minimap, ticker: the chrome around the canvas.
import { useEffect, useRef, useState } from 'react';
import { botsEnabled, resetDemo, setBots } from '../boot.ts';
import { board } from '../canvas/board.ts';
import { GRID, TOTAL_PIXELS } from '../chain/types.ts';
import { connect } from '../dapp/dapp.ts';
import { ago, formatInt, formatPol, hexColour, parseHexColour, shortAddr } from '../lib/format.ts';
import { Identicon } from '../lib/Identicon.tsx';
import { PALETTE, activeAccount, pickColour, setApp, useApp, type Mode, type Tool } from '../store.ts';
import { wallet } from '../wallet/wallet.ts';
import { Icon, Mark } from './Icon.tsx';

export const CASE_STUDY_URL = '/work/polypaint/';

export function Ribbon() {
  const show = useApp((s) => s.ribbon);
  if (!show) return null;
  return (
    <div className="ribbon" role="note">
      <b>Concept demo</b>
      <span className="sep">/</span>
      <span className="long">A simulated chain running in this tab. Nothing touches a real network.</span>
      <span className="short">Nothing here is on a real chain.</span>
      <span className="sep">/</span>
      <a href={CASE_STUDY_URL}>
        &larr; <span className="long">Back to the case study</span>
        <span className="short">Case study</span>
      </a>
      <button className="x" aria-label="Dismiss this notice" onClick={() => setApp({ ribbon: false })}>
        <Icon name="close" size={12} />
      </button>
    </div>
  );
}

function ModeSwitch() {
  const mode = useApp((s) => s.mode);
  const set = (m: Mode) => setApp({ mode: m });
  return (
    <div className="mode" role="group" aria-label="Mode">
      <button className={mode === 'buy' ? 'on' : ''} aria-pressed={mode === 'buy'} onClick={() => set('buy')}>
        Buy
      </button>
      <button className={mode === 'recolor' ? 'on' : ''} aria-pressed={mode === 'recolor'} onClick={() => set('recolor')}>
        Recolor
      </button>
    </div>
  );
}

export function Stats() {
  const stats = useApp((s) => s.stats);
  const chain = useApp((s) => s.chain);
  const pct = ((stats.owned / TOTAL_PIXELS) * 100).toFixed(2);
  return (
    <div className="stats" aria-label="Canvas statistics">
      <div className="stat"><span className="mono">Owned</span><b>{formatInt(stats.owned)} px</b></div>
      <div className="stat"><span className="mono">Painted</span><b>{pct}%</b></div>
      <div className="stat"><span className="mono">Owners</span><b>{stats.owners}</b></div>
      <div className="stat"><span className="mono">Spent</span><b>{formatPol(BigInt(stats.spentWei), 0)} POL</b></div>
      <div className="stat">
        <span className="mono">Block</span>
        {chain.status === 'ready' ? (
          <b className="teal">#{formatInt(chain.block)}</b>
        ) : chain.status === 'error' ? (
          <b className="warn">offline</b>
        ) : (
          <b className="booting">booting {Math.round(chain.progress * 100)}%</b>
        )}
      </div>
    </div>
  );
}

function WalletChip() {
  const w = useApp((s) => s.wallet);
  const ready = useApp((s) => s.chain.status === 'ready');
  const account = w.connected ? w.accounts[w.selected] : null;
  if (!account) {
    return (
      <button className="chip connect" data-tour="wallet" onClick={() => void connect()} aria-label="Connect the demo wallet">
        <Icon name="wallet" size={16} />
        <span>Connect wallet</span>
      </button>
    );
  }
  const bal = w.balances[account.address.toLowerCase()];
  return (
    <button className="chip" data-tour="wallet" onClick={() => (w.open ? wallet.close() : wallet.open())} aria-label="Open the demo wallet" aria-expanded={w.open}>
      <Identicon address={account.address} size={24} round />
      <span className="addr">{shortAddr(account.address)}</span>
      <span className="bal">{ready && bal !== undefined ? `${formatPol(BigInt(bal), 2)} POL` : '…'}</span>
      {w.queue.length > 0 && <span className="badge">{w.queue.length}</span>}
    </button>
  );
}

export function Header() {
  return (
    <header className="hdr">
      <a className="brand" href={CASE_STUDY_URL} aria-label="PolyPaint, back to the case study">
        <Mark />
        <span className="word">poly<i>paint</i></span>
        <span className="mono tag">1,000 &times; 1,000 px &nbsp;/&nbsp; ERC-721 &nbsp;/&nbsp; est. 2022</span>
      </a>
      <ModeSwitch />
      <Stats />
      <WalletChip />
    </header>
  );
}

const TOOLS: { tool: Tool; icon: string; key: string; label: string }[] = [
  { tool: 'select', icon: 'select', key: 'V', label: 'Select: click pixels, drag to pan' },
  { tool: 'rect', icon: 'rect', key: 'R', label: 'Rectangle' },
  { tool: 'brush', icon: 'brush', key: 'B', label: 'Brush' },
  { tool: 'fill', icon: 'fill', key: 'F', label: 'Fill the connected area' },
  { tool: 'erase', icon: 'erase', key: 'E', label: 'Erase from the draft' },
  { tool: 'stamp', icon: 'stamp', key: 'I', label: 'Image stamp' },
  { tool: 'pan', icon: 'pan', key: 'H', label: 'Pan' },
];

export function Tools() {
  const tool = useApp((s) => s.tool);
  return (
    <div className="panel tools" role="toolbar" aria-label="Tools" data-tour="tools">
      {TOOLS.map((t) => (
        <button
          key={t.tool}
          className={`tool${tool === t.tool ? ' on' : ''}`}
          aria-label={`${t.label} (${t.key})`}
          aria-pressed={tool === t.tool}
          title={`${t.label} (${t.key})`}
          onClick={() => setApp({ tool: t.tool })}
        >
          <Icon name={t.icon} size={19} />
          <kbd>{t.key}</kbd>
        </button>
      ))}
      <hr />
      <button className="tool" aria-label="Undo the last draft change (Ctrl+Z)" title="Undo (Ctrl+Z)" onClick={() => board.undo()}>
        <Icon name="undo" size={19} />
      </button>
    </div>
  );
}

export function ZoomControl() {
  const zoom = useApp((s) => s.view.zoom);
  return (
    <div className="panel zoom" role="group" aria-label="Zoom">
      <button aria-label="Zoom out (-)" onClick={() => board.zoomBy(1 / 1.6)}><Icon name="minus" size={16} /></button>
      <span aria-live="off">{zoom >= 10 ? zoom.toFixed(0) : zoom.toFixed(1)}&times;</span>
      <button aria-label="Zoom in (+)" onClick={() => board.zoomBy(1.6)}><Icon name="plus" size={16} /></button>
      <button aria-label="Fit the whole canvas (0)" title="Fit (0)" onClick={() => board.fit()}><Icon name="fit" size={15} /></button>
    </div>
  );
}

export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useApp((s) => s.view);
  const pointer = useApp((s) => s.pointer);
  useEffect(() => (ref.current ? board.attachMinimap(ref.current) : undefined), []);
  const size = 120;
  const k = size / GRID;
  const w = Math.max(6, (view.w / view.zoom) * k), h = Math.max(5, (view.h / view.zoom) * k);
  const x = Math.min(size - 2, Math.max(-w + 2, view.x * k)), y = Math.min(size - 2, Math.max(-h + 2, view.y * k));
  return (
    <div className="panel map">
      <div className="mapbox">
        <canvas ref={ref} className="minimap" width={size} height={size} aria-label="Minimap. Click or drag to move the view." />
        <i className="viewbox" style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: w, height: h }} />
      </div>
      <div className="mono maplabel">
        <span>Map</span>
        <span>{pointer ? `${pointer.x}, ${pointer.y}` : `${Math.max(0, Math.round(view.x))}, ${Math.max(0, Math.round(view.y))}`}</span>
      </div>
    </div>
  );
}

export function Palette() {
  const colour = useApp((s) => s.colour);
  const recent = useApp((s) => s.recent);
  const [text, setText] = useState(hexColour(colour));
  useEffect(() => setText(hexColour(colour)), [colour]);
  const commit = () => {
    const c = parseHexColour(text);
    if (c === null) setText(hexColour(colour));
    else pickColour(c);
  };
  return (
    <div className="panel palette" role="group" aria-label="Color">
      <div className="sw" role="listbox" aria-label="Palette">
        {PALETTE.map((c) => (
          <button
            key={c}
            role="option"
            aria-selected={c === colour}
            aria-label={`Color ${hexColour(c)}`}
            className={c === colour ? 'on' : ''}
            style={{ background: hexColour(c) }}
            onClick={() => pickColour(c)}
          />
        ))}
      </div>
      <span className="sep" />
      <label className="hex">
        <input type="color" aria-label="Pick any color" value={hexColour(colour).toLowerCase()} onChange={(e) => pickColour(parseHexColour(e.target.value) ?? colour)} />
        <input
          type="text"
          aria-label="Hex color"
          value={text}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            e.stopPropagation();
          }}
        />
      </label>
      {recent.length > 0 && (
        <div className="recent">
          <span className="mono">Recent</span>
          <div>
            {recent.slice(0, 5).map((c) => (
              <button key={c} aria-label={`Recent color ${hexColour(c)}`} style={{ background: hexColour(c) }} onClick={() => pickColour(c)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function Ticker() {
  const items = useApp((s) => s.ticker);
  const chain = useApp((s) => s.chain);
  const [bots, setBotsState] = useState(botsEnabled());
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 5000);
    return () => window.clearInterval(t);
  }, []);
  const me = useApp((s) => activeAccount(s));
  return (
    <footer className="ticker">
      <span className={`live${chain.status === 'ready' && bots ? '' : ' off'}`}>{chain.status === 'ready' ? (bots ? 'LIVE' : 'PAUSED') : 'BOOT'}</span>
      <div className="items" aria-live="polite">
        {items.length === 0 && (
          <span className="idle">
            {chain.status === 'ready'
              ? 'Chain is up. Other buyers (simulated wallets) mint a small sprite every 10 to 30 seconds.'
              : chain.status === 'error'
                ? (chain.error ?? 'The chain could not start.')
                : 'Booting the in-browser chain: loading the EVM, deploying Pixels.sol, restoring the canvas…'}
          </span>
        )}
        {items.slice(0, 6).map((it) => (
          <button key={it.key} className="item" onClick={() => board.jumpTo({ x0: it.x - 6, y0: it.y - 6, x1: it.x + 14, y1: it.y + 14 })} title="Jump to these pixels">
            <b>{me && it.mine ? 'You' : shortAddr(it.who)}</b> {it.kind === 'buy' ? 'bought' : 'recolored'} {formatInt(it.count)} px at ({it.x}, {it.y})
            <i>/ {ago(it.ts)}</i>
          </button>
        ))}
      </div>
      <div className="r">
        <button
          onClick={() => {
            setBots(!bots);
            setBotsState(!bots);
          }}
          aria-pressed={!bots}
          title="Pause or resume the simulated other buyers"
        >
          <Icon name={bots ? 'pause' : 'play'} size={12} /> {bots ? 'Pause buyers' : 'Resume buyers'}
        </button>
        <button onClick={() => setApp({ help: true })}><Icon name="help" size={12} /> Shortcuts</button>
        <button
          onClick={() => {
            if (window.confirm('Reset the demo? This clears your wallet, your pixels and the saved chain state in this browser.')) resetDemo();
          }}
        >
          <Icon name="reset" size={12} /> Reset demo
        </button>
      </div>
    </footer>
  );
}
