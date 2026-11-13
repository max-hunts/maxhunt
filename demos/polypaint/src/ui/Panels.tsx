// Basket / My pixels side panel, hover card, stamp bar, tour, toast, shortcuts.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { board } from '../canvas/board.ts';
import { LOCKED_URL, type PixelGroup } from '../canvas/pixels.ts';
import { STAMP_SIZES, imageToStamp, sampleStamp } from '../canvas/stamp.ts';
import { PIXEL_PRICE_WEI } from '../chain/types.ts';
import { batchSize, checkout, connect, dismissCheckout, estimateFeeWei, relink } from '../dapp/dapp.ts';
import { formatInt, formatPol, hexColour, shortAddr, shortHash } from '../lib/format.ts';
import { Identicon } from '../lib/Identicon.tsx';
import { activeAccount, setApp, toast, useApp, type CheckoutBatch } from '../store.ts';
import { Icon } from './Icon.tsx';

// ------------------------------------------------------------------ basket

const STATUS_LABEL: Record<CheckoutBatch['status'], string> = {
  signing: 'Waiting for wallet',
  pending: 'Pending',
  confirmed: 'Confirmed',
  reverted: 'Reverted',
  rejected: 'Rejected',
  failed: 'Failed',
};

function CheckoutProgress() {
  const co = useApp((s) => s.checkout);
  if (!co) return null;
  return (
    <div className="progress" aria-live="polite">
      <div className="mono prow">
        <span>{co.kind === 'buy' ? 'Buy' : co.kind === 'recolor' ? 'Recolor' : 'Link'} / {co.batches.length} transaction{co.batches.length > 1 ? 's' : ''}</span>
        {!co.busy && (
          <button onClick={dismissCheckout} aria-label="Dismiss transaction list">
            Dismiss
          </button>
        )}
      </div>
      {co.batches.map((b, i) => (
        <div key={i} className={`batch ${b.status}`}>
          <span className="dot">{b.status === 'signing' || b.status === 'pending' ? <Icon name="spinner" size={12} className="spin" /> : <Icon name={b.status === 'confirmed' ? 'check' : 'close'} size={12} />}</span>
          <span className="what">
            {b.n} px{b.hash ? <i> {shortHash(b.hash)}</i> : null}
            {b.reason ? <em>{b.reason}</em> : null}
          </span>
          <span className="st">{STATUS_LABEL[b.status]}</span>
        </div>
      ))}
    </div>
  );
}

function Basket() {
  const basket = useApp((s) => s.basket);
  const mode = useApp((s) => s.mode);
  const link = useApp((s) => s.link);
  const include = useApp((s) => s.includeFlagged);
  const chain = useApp((s) => s.chain);
  const connected = useApp((s) => s.wallet.connected);
  const busy = useApp((s) => !!s.checkout?.busy);

  const flagged = mode === 'buy' ? basket.others + basket.mine : basket.others + basket.free;
  const n = basket.actionable + (include ? flagged : 0);
  const subtotal = mode === 'buy' ? PIXEL_PRICE_WEI * BigInt(n) : 0n;
  const fee = estimateFeeWei(mode, n, link.trim());
  const txs = n ? Math.ceil(n / batchSize(mode, link.trim())) : 0;
  const verb = mode === 'buy' ? 'Buy' : 'Recolor';

  return (
    <div className="basket">
      <h3>
        <span className="mono">Basket / {verb}</span>
        <button className="mono clear" onClick={() => board.clearDraft()} disabled={!basket.total}>
          Clear &nbsp;Esc
        </button>
      </h3>
      <div className="big">
        <span data-testid="basket-count">{formatInt(n)}</span>
        <small>PIXELS</small>
      </div>
      {basket.total === 0 ? (
        <p className="hint">
          {mode === 'buy'
            ? 'Pick the brush (B) and paint on empty canvas, or click single pixels with the select tool. Every pixel is its own ERC-721 token at 0.4 POL.'
            : connected
              ? 'Paint over pixels you own to change their color. Recoloring is free apart from gas.'
              : 'Connect the wallet, then paint over pixels you own to change their color.'}
        </p>
      ) : (
        <div className="spec">
          <span className="mono">Price / px</span>
          <span>{mode === 'buy' ? '0.4 POL' : 'free'}</span>
          <span className="mono">Subtotal</span>
          <span>{formatPol(subtotal, 2)} POL</span>
          <span className="mono">Gas (est.)</span>
          <span>{formatPol(fee, 3)} POL</span>
          {txs > 1 && (
            <>
              <span className="mono">Transactions</span>
              <span>{txs}</span>
            </>
          )}
          <span className="mono tot">Total</span>
          <span className="tot" data-testid="basket-total">{formatPol(subtotal + fee, 3)} POL</span>
        </div>
      )}
      {flagged > 0 && (
        <div className="note">
          <Icon name="warn" size={15} />
          <div>
            <span data-testid="flagged-count">{formatInt(flagged)}</span> px {mode === 'buy' ? 'already owned' : 'not yours'}.{' '}
            {include ? 'Included: the contract will revert the transaction.' : 'Excluded, they would revert.'}
            <label className="anyway">
              <input type="checkbox" checked={include} onChange={(e) => setApp({ includeFlagged: e.target.checked })} />
              Send them anyway and watch it revert
            </label>
          </div>
        </div>
      )}
      {basket.total > 0 && (
        <label className="field">
          <Icon name="link" size={14} />
          <input
            type="url"
            inputMode="url"
            placeholder={mode === 'buy' ? 'https://your-link.xyz (optional)' : 'New link (optional)'}
            aria-label="Link for these pixels"
            maxLength={120}
            value={link}
            onChange={(e) => setApp({ link: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
      )}
      <CheckoutProgress />
      <button
        className="cta"
        data-tour="buy"
        data-testid="checkout"
        disabled={busy || n === 0 || chain.status !== 'ready'}
        onClick={() => void checkout()}
      >
        {chain.status !== 'ready' && chain.status !== 'error'
          ? `Chain booting ${Math.round(chain.progress * 100)}%`
          : busy
            ? 'Waiting for transactions…'
            : !connected && n > 0
              ? `Connect wallet to ${verb.toLowerCase()}`
              : `${verb} ${formatInt(n)} pixel${n === 1 ? '' : 's'}`}
        {!busy && n > 0 && chain.status === 'ready' && <Icon name="arrow" size={16} />}
      </button>
    </div>
  );
}

// --------------------------------------------------------------- my pixels

function GroupRow({ g }: { g: PixelGroup }) {
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const current = board.mirror.urlOf(g.ids[0]);
  const locked = current === LOCKED_URL;
  const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
  return (
    <li className="group">
      <button className="grow" onClick={() => board.jumpTo(g)} title="Jump to these pixels">
        <span className="thumb" style={{ background: g.colours.length > 1 ? `conic-gradient(${g.colours.map((c, i) => `${hexColour(c)} ${(i / g.colours.length) * 100}% ${((i + 1) / g.colours.length) * 100}%`).join(',')})` : hexColour(g.colours[0]) }} />
        <span className="meta">
          <b>{g.count === 1 ? `Pixel (${g.x0}, ${g.y0})` : `Block at (${g.x0}, ${g.y0})`}</b>
          <span>
            {formatInt(g.count)} px{g.count > 1 ? `, ${w} × ${h}` : ''}
            {current ? `, ${current}` : ''}
          </span>
        </span>
      </button>
      <span className="acts">
        <button
          aria-label="Recolor this block with the current color"
          title="Recolor with the current color"
          onClick={() => {
            setApp({ mode: 'recolor', panel: 'basket' });
            board.addToDraft(g.ids, useApp.getState().colour);
            board.jumpTo(g);
          }}
        >
          <Icon name="brush" size={14} />
        </button>
        <button aria-label="Set a link on this block" title="Set link" onClick={() => setEditing((v) => !v)}>
          <Icon name="link" size={14} />
        </button>
      </span>
      {editing && (
        <form
          className="relink"
          onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            void relink(g.ids, url);
          }}
        >
          <input autoFocus type="text" placeholder="https://" aria-label="New link" maxLength={120} value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
          <button type="submit">Set</button>
          {locked && <p>This block was minted with the 2022 client's "/#" placeholder. Pixels.sol ignores new links for it (a real bug in the contract): the transaction will succeed and the link will not change.</p>}
        </form>
      )}
    </li>
  );
}

function MyPixels() {
  const groups = useApp((s) => s.myGroups);
  const count = useApp((s) => s.myCount);
  const me = useApp((s) => activeAccount(s));
  if (!me) {
    return (
      <div className="mine empty">
        <p className="hint">Connect the demo wallet to see the pixels you own, jump to them, recolor them or give them a link.</p>
        <button className="cta ghost" onClick={() => void connect()}>
          Connect wallet
        </button>
      </div>
    );
  }
  return (
    <div className="mine">
      <h3>
        <span className="mono">My pixels</span>
        <span className="mono">{formatInt(count)} px</span>
      </h3>
      {groups.length === 0 ? (
        <p className="hint">Nothing yet. Paint a few pixels and buy them: they show up here once the transaction is mined.</p>
      ) : (
        <ul className="groups">
          {groups.slice(0, 40).map((g) => (
            <GroupRow key={`${g.ids[0]}-${g.count}`} g={g} />
          ))}
        </ul>
      )}
      <CheckoutProgress />
    </div>
  );
}

export function SidePanel() {
  const panel = useApp((s) => s.panel);
  const sheet = useApp((s) => s.sheet);
  const count = useApp((s) => s.myCount);
  return (
    <aside className={`panel side${sheet === 'basket' || sheet === 'mine' ? ' open' : ''}`} aria-label="Basket and my pixels">
      <button className="grab" aria-label="Close panel" onClick={() => setApp({ sheet: null })} />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={panel === 'basket'} className={panel === 'basket' ? 'on' : ''} onClick={() => setApp({ panel: 'basket' })}>
          Basket
        </button>
        <button role="tab" aria-selected={panel === 'mine'} className={panel === 'mine' ? 'on' : ''} onClick={() => setApp({ panel: 'mine' })} data-testid="tab-mine">
          My pixels{count ? <em>{formatInt(count)}</em> : null}
        </button>
      </div>
      {panel === 'basket' ? <Basket /> : <MyPixels />}
    </aside>
  );
}

// -------------------------------------------------------------- hover card

export function HoverCard() {
  const h = useApp((s) => s.hover);
  const zoom = useApp((s) => s.view.zoom);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 236, h: 150 });
  useLayoutEffect(() => {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      if (Math.abs(r.width - size.w) > 1 || Math.abs(r.height - size.h) > 1) setSize({ w: r.width, h: r.height });
    }
  });
  if (!h) return null;
  const gap = 14 + zoom / 2;
  const vw = window.innerWidth, vh = window.innerHeight;
  const narrow = vw < 760;
  let x = h.sx + gap, y = h.sy - size.h - gap + 20;
  if (x + size.w > vw - 12) x = h.sx - gap - size.w;
  if (y < 96) y = h.sy + gap;
  if (y + size.h > vh - 12) y = vh - size.h - 12;
  if (narrow) {
    x = (vw - size.w) / 2;
    y = 64;
  }
  const status = h.owner ? (h.mine ? 'Yours' : 'Owned') : 'Unowned';
  return (
    <div ref={ref} className={`panel hcard${h.pinned ? ' pinned' : ''}`} style={{ transform: `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)` }} role="status" data-testid="hover-card">
      <div className="top">
        <i style={{ background: h.colour === null ? 'transparent' : hexColour(h.colour) }} className={h.colour === null ? 'none' : ''} />
        <div>
          <b>{h.colour === null ? 'No color yet' : hexColour(h.colour)}</b>
          <span className="mono">Pixel #{h.id}</span>
        </div>
        <span className={`pill ${status.toLowerCase()}`}>{status}</span>
      </div>
      <div className="rows">
        <span className="mono">X, Y</span>
        <span>({h.x}, {h.y})</span>
        {h.owner ? (
          <>
            <span className="mono">Owner</span>
            <span>
              <Identicon address={h.owner} size={16} />
              {shortAddr(h.owner)}
            </span>
            <span className="mono">Link</span>
            <span className="link">
              {h.url && h.url !== LOCKED_URL ? (
                h.pinned && /^https?:\/\//i.test(h.url) ? (
                  <a href={h.url} target="_blank" rel="noopener noreferrer nofollow">
                    {h.url.replace(/^https?:\/\//i, '')} &#8599;
                  </a>
                ) : (
                  <span className="teal">{h.url.replace(/^https?:\/\//i, '')}</span>
                )
              ) : h.url === LOCKED_URL ? (
                <span className="dim">/# (locked placeholder)</span>
              ) : (
                <span className="dim">none</span>
              )}
            </span>
          </>
        ) : (
          <>
            <span className="mono">Price</span>
            <span className="price">0.4 POL</span>
          </>
        )}
        {h.draftColour !== null && (
          <>
            <span className="mono">Draft</span>
            <span>
              <i className="dsw" style={{ background: hexColour(h.draftColour) }} />
              {hexColour(h.draftColour)}
            </span>
          </>
        )}
      </div>
      {h.pinned && (
        <button className="unpin" aria-label="Close pixel details" onClick={() => board.unpin()}>
          <Icon name="close" size={12} />
        </button>
      )}
    </div>
  );
}

// --------------------------------------------------------------- stamp bar

let stampSource: Blob | null = null;
let stampName = 'image';

export async function loadStampFile(file: Blob, name: string, size = 32, colours = 32): Promise<void> {
  stampSource = file;
  stampName = name;
  try {
    board.setStamp(await imageToStamp(file, size, colours, name));
  } catch {
    toast('That file could not be read as an image.', 'warn');
  }
}

export function StampBar() {
  const tool = useApp((s) => s.tool);
  const stamp = useApp((s) => s.stamp);
  const [size, setSize] = useState(32);
  const [colours, setColours] = useState(32);
  const input = useRef<HTMLInputElement>(null);
  if (tool !== 'stamp') return null;
  const rerun = (nextSize: number, nextColours: number) => {
    setSize(nextSize);
    setColours(nextColours);
    if (stampSource) void loadStampFile(stampSource, stampName, nextSize, nextColours);
  };
  return (
    <div className="panel stampbar" role="group" aria-label="Image stamp">
      <span className="mono">Image stamp</span>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadStampFile(f, f.name, size, colours);
          e.target.value = '';
        }}
      />
      <button onClick={() => input.current?.click()}>{stamp ? 'Replace image' : 'Choose image'}</button>
      {!stamp && (
        <button
          onClick={() => {
            stampSource = null;
            board.setStamp(sampleStamp());
          }}
        >
          Use a sample
        </button>
      )}
      <label>
        Size
        <select value={size} onChange={(e) => rerun(Number(e.target.value), colours)} aria-label="Stamp size in pixels">
          {STAMP_SIZES.map((s) => (
            <option key={s} value={s}>
              {s} px
            </option>
          ))}
        </select>
      </label>
      <label>
        Colors
        <select value={colours} onChange={(e) => rerun(size, Number(e.target.value))} aria-label="Number of colors">
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={32}>32</option>
          <option value={0}>Full</option>
        </select>
      </label>
      {stamp ? (
        <>
          <span className="dim">
            {stamp.w} &times; {stamp.h}, drag to position
          </span>
          <button className="go" onClick={() => board.commitStamp()} data-testid="stamp-place">
            Place <kbd>Enter</kbd>
          </button>
          <button onClick={() => board.setStamp(null)}>Cancel</button>
        </>
      ) : (
        <span className="dim">or drop an image anywhere on the canvas</span>
      )}
    </div>
  );
}

// -------------------------------------------------------------------- tour

const STEPS = [
  { anchor: 'tools', title: 'Paint', body: 'Pick the brush or the rectangle, choose a color and draw on empty canvas. Scroll to zoom, drag with the select tool to pan.' },
  { anchor: 'wallet', title: 'Connect the Demo Wallet', body: 'A generic in-page wallet with throwaway keys and 1,000 play POL. It signs real transactions for a chain that only exists in this tab.' },
  { anchor: 'buy', title: 'Buy your pixels', body: 'The basket sends your draft to the original 2022 Pixels.sol contract, running in an in-browser EVM. Owned pixels really do revert.' },
];

export function Tour() {
  const step = useApp((s) => s.tour);
  const [pos, setPos] = useState<{ x: number; y: number; side: 'right' | 'below' | 'left' | 'narrow' } | null>(null);
  useEffect(() => {
    if (step < 0 || step >= STEPS.length) return;
    const place = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${STEPS[step].anchor}"]`);
      if (!el) return setPos(null);
      const r = el.getBoundingClientRect();
      const narrow = window.innerWidth < 760;
      if (narrow) setPos({ x: 0, y: 0, side: 'narrow' }); // phones: docked above the bottom bars by CSS
      else if (STEPS[step].anchor === 'tools') setPos({ x: r.right + 14, y: r.top + 20, side: 'right' });
      else if (STEPS[step].anchor === 'wallet') setPos({ x: Math.min(window.innerWidth - 316, r.right - 300), y: r.bottom + 12, side: 'below' });
      else setPos({ x: r.left - 314, y: r.top - 96, side: 'left' });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [step]);
  if (step < 0 || step >= STEPS.length || !pos) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;
  return (
    <div className={`panel tour ${pos.side}`} style={pos.side === 'narrow' ? undefined : { transform: `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)` }} role="dialog" aria-label={`Tour step ${step + 1} of ${STEPS.length}`}>
      <span className="mono">
        {step + 1} / {STEPS.length}
      </span>
      <h4>{s.title}</h4>
      <p>{s.body}</p>
      <div className="tbtns">
        <button onClick={() => setApp({ tour: -1 })}>Skip</button>
        <button className="go" onClick={() => setApp({ tour: last ? -1 : step + 1 })} data-testid="tour-next">
          {last ? 'Got it' : 'Next'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------ toast + help

export function Toast() {
  const t = useApp((s) => s.toast);
  useEffect(() => {
    if (!t) return;
    const id = window.setTimeout(() => setApp((s) => (s.toast?.key === t.key ? { toast: null } : {})), 4200);
    return () => window.clearTimeout(id);
  }, [t]);
  if (!t) return null;
  return (
    <div className={`toast ${t.tone}`} role="status" key={t.key}>
      {t.text}
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['V', 'Select (click pixels, drag to pan)'],
  ['B', 'Brush'],
  ['R', 'Rectangle'],
  ['F', 'Fill the connected area'],
  ['E', 'Erase from the draft'],
  ['I', 'Image stamp'],
  ['H / Space', 'Pan'],
  ['Alt + drag', 'Erase with the brush or rectangle'],
  ['Shift + click', 'Select a rectangle from the last pixel'],
  ['+  /  -', 'Zoom in / out'],
  ['0', 'Fit the whole canvas'],
  ['Ctrl/Cmd + Z', 'Undo the last draft change'],
  ['Esc', 'Clear the draft, cancel a stamp, close panels'],
];

export function Help() {
  const open = useApp((s) => s.help);
  if (!open) return null;
  return (
    <div className="scrim" onClick={() => setApp({ help: false })}>
      <div className="panel help" role="dialog" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
        <h3>
          <span className="mono">Keyboard shortcuts</span>
          <button aria-label="Close" onClick={() => setApp({ help: false })}>
            <Icon name="close" size={14} />
          </button>
        </h3>
        <dl>
          {SHORTCUTS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
