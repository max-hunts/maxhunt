// The Demo Wallet's popup, styled like a browser-extension wallet but generic:
// its own name and mark, no real wallet brand.
import { useState } from 'react';
import { CHAIN_NAME } from '../chain/types.ts';
import { ago, formatInt, formatPol, shortAddr, shortHash } from '../lib/format.ts';
import { Identicon } from '../lib/Identicon.tsx';
import { patchWallet, useApp, type Activity, type PendingTx } from '../store.ts';
import { Icon } from '../ui/Icon.tsx';
import { DemoWallet, FAUCET_POL, wallet } from './wallet.ts';

function Head() {
  return (
    <div className="w-head">
      <span className="w-mark" aria-hidden="true" />
      <b>Demo Wallet</b>
      <span className="net">{CHAIN_NAME}</span>
      <button className="w-x" aria-label="Close the wallet" onClick={() => wallet.close()}>
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function Connect() {
  const w = useApp((s) => s.wallet);
  return (
    <div className="w-body">
      <h4>Connect to PolyPaint</h4>
      <div className="from">This page is asking to see an address. Pick the account to connect.</div>
      <ul className="w-accounts">
        {w.accounts.map((a, i) => (
          <li key={a.address}>
            <button onClick={() => wallet.connect(i)} data-testid={`account-${i}`}>
              <Identicon address={a.address} size={30} round />
              <span>
                <b>{a.label}</b>
                <i>{shortAddr(a.address)}</i>
              </span>
              <em>{w.balances[a.address.toLowerCase()] !== undefined ? `${formatPol(BigInt(w.balances[a.address.toLowerCase()]), 2)} POL` : '…'}</em>
            </button>
          </li>
        ))}
      </ul>
      <p className="w-note">Three throwaway keys were generated in this browser. They are demo keys: never send real funds to them.</p>
    </div>
  );
}

function AccountRow() {
  const w = useApp((s) => s.wallet);
  const [open, setOpen] = useState(false);
  const account = w.accounts[w.selected];
  if (!account) return null;
  const bal = w.balances[account.address.toLowerCase()];
  return (
    <>
      <button className="w-acct" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Switch account">
        <Identicon address={account.address} size={30} round />
        <div>
          <b>{account.label}</b>
          <span>{shortAddr(account.address)}</span>
        </div>
        <div className="bal">
          <b data-testid="wallet-balance">{bal !== undefined ? `${formatPol(BigInt(bal), 4)} POL` : '…'}</b>
          <span>demo funds</span>
        </div>
        <Icon name="chev" size={14} />
      </button>
      {open && (
        <ul className="w-accounts inset">
          {w.accounts.map((a, i) => (
            <li key={a.address}>
              <button
                className={i === w.selected ? 'on' : ''}
                onClick={() => {
                  wallet.switchAccount(i);
                  setOpen(false);
                }}
              >
                <Identicon address={a.address} size={22} round />
                <span>
                  <b>{a.label}</b>
                  <i>{shortAddr(a.address)}</i>
                </span>
                <em>{w.balances[a.address.toLowerCase()] !== undefined ? `${formatPol(BigInt(w.balances[a.address.toLowerCase()]), 2)} POL` : ''}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Home() {
  const myCount = useApp((s) => s.myCount);
  const ready = useApp((s) => s.chain.status === 'ready');
  return (
    <div className="w-body">
      <div className="w-assets">
        <div>
          <span>POL</span>
          <i>native token of the simulated chain</i>
        </div>
        <div>
          <span>PIX</span>
          <i>{formatInt(myCount)} Pixels (ERC-721) owned</i>
        </div>
      </div>
      <div className="w-btns">
        <button onClick={() => void wallet.faucet()} disabled={!ready} data-testid="faucet">
          <Icon name="drop" size={14} /> Faucet: refill to {formatInt(FAUCET_POL)} POL
        </button>
      </div>
      <button className="w-link" onClick={() => wallet.disconnect()}>
        Disconnect this page
      </button>
    </div>
  );
}

function Confirm() {
  const w = useApp((s) => s.wallet);
  const [index, setIndex] = useState(0);
  const queue = w.queue;
  if (!queue.length) return null;
  const i = Math.min(index, queue.length - 1);
  const tx: PendingTx = queue[i];
  const account = w.accounts.find((a) => a.address.toLowerCase() === tx.from.toLowerCase());
  const balance = wallet.balanceOf(tx.from);
  const totalAll = queue.reduce((sum, t) => sum + DemoWallet.maxCost(t), 0n);
  const broke = totalAll > balance;
  const fee = DemoWallet.estFee(tx);
  return (
    <div className="w-body">
      <h4>
        Confirm transaction
        {queue.length > 1 && (
          <span className="pager">
            <button aria-label="Previous transaction" disabled={i === 0} onClick={() => setIndex(i - 1)}>
              <Icon name="back" size={12} />
            </button>
            {i + 1} of {queue.length}
            <button aria-label="Next transaction" disabled={i === queue.length - 1} onClick={() => setIndex(i + 1)}>
              <Icon name="back" size={12} className="flip" />
            </button>
          </span>
        )}
      </h4>
      <div className="from">Requested by polypaint (this page){account ? `, from ${account.label}` : ''}</div>
      <div className="call">
        <b>{tx.fn}</b>
        <span>{tx.summary}</span>
      </div>
      <div className="w-rows">
        <div>To</div>
        <span>Pixels (PIX) {shortAddr(tx.to)}</span>
        <div>Value</div>
        <span>{formatPol(tx.value, 4)} POL</span>
        <div>Gas (est.)</div>
        <span>{formatPol(fee, 4)} POL</span>
        <div className="t">Total</div>
        <span className="t" data-testid="confirm-total">{formatPol(tx.value + fee, 4)} POL</span>
      </div>
      {tx.willRevert ? (
        <div className="w-warn" data-testid="sim-revert">
          <Icon name="warn" size={14} />
          <span>
            Simulation: this transaction is expected to revert with <b>"{tx.willRevert}"</b>. You can still send it. You would pay gas and nothing else happens.
          </span>
        </div>
      ) : (
        !broke && (
          <div className="w-ok">
            <Icon name="check" size={13} /> Simulated against the contract: it should succeed.
          </div>
        )
      )}
      {broke && (
        <div className="w-warn bad" data-testid="insufficient">
          <Icon name="warn" size={14} />
          <span>
            Insufficient funds. {queue.length > 1 ? `These ${queue.length} transactions need` : 'This needs'} up to {formatPol(totalAll, 3)} POL including gas, and this account has {formatPol(balance, 3)} POL.
            <button onClick={() => void wallet.faucet()}>Refill from the faucet</button>
          </span>
        </div>
      )}
      <div className="w-btns two">
        <button onClick={() => wallet.rejectAll()} data-testid="reject">
          Reject{queue.length > 1 ? ' all' : ''}
        </button>
        <button className="go" disabled={broke} onClick={() => void wallet.confirm()} data-testid="confirm">
          Confirm{queue.length > 1 ? ` all ${queue.length}` : ''}
        </button>
      </div>
    </div>
  );
}

function ActivityItem({ a }: { a: Activity }) {
  return (
    <li className={`act ${a.status}`} data-testid="activity-item">
      <span className="dot">
        {a.status === 'pending' ? <Icon name="spinner" size={13} className="spin" /> : <Icon name={a.status === 'confirmed' ? (a.kind === 'faucet' ? 'drop' : 'check') : 'close'} size={13} />}
      </span>
      <div>
        <b>{a.title}</b>
        <span>
          {a.status === 'pending' && 'Pending, waiting for the next block'}
          {a.status === 'confirmed' && (a.kind === 'faucet' ? 'Dev-node top-up, not a transaction' : `Confirmed in block #${formatInt(a.block ?? 0)}`)}
          {a.status === 'reverted' && <em data-testid="revert-reason">Reverted: {a.reason}</em>}
          {a.status === 'dropped' && 'Dropped (the chain session ended)'}
        </span>
        {a.hash && (
          <i>
            {shortHash(a.hash)}
            {a.gasUsed ? ` / gas ${formatInt(BigInt(a.gasUsed))}` : ''}
            {a.fee ? ` / fee ${formatPol(BigInt(a.fee), 4)} POL` : ''}
          </i>
        )}
      </div>
      <div className="amt">
        {BigInt(a.value) > 0n && a.status !== 'reverted' ? <b>-{formatPol(BigInt(a.value), 2)} POL</b> : null}
        <span>{ago(a.ts)}</span>
      </div>
    </li>
  );
}

function ActivityList() {
  const items = useApp((s) => s.wallet.activity);
  const selected = useApp((s) => s.wallet.accounts[s.wallet.selected]?.address);
  const mine = items.filter((a) => a.from.toLowerCase() === selected?.toLowerCase());
  return (
    <div className="w-body list">
      {mine.length === 0 ? <p className="w-note">No activity for this account yet. Buy a few pixels and the transaction shows up here, reverted ones included.</p> : <ul className="w-activity">{mine.map((a) => <ActivityItem key={a.id} a={a} />)}</ul>}
    </div>
  );
}

export function WalletPopup() {
  const w = useApp((s) => s.wallet);
  if (!w.open) return null;
  const view = !w.connected ? 'connect' : w.queue.length && w.view === 'confirm' ? 'confirm' : w.view === 'activity' ? 'activity' : 'home';
  const pending = w.activity.filter((a) => a.status === 'pending').length;
  return (
    <div className="panel wallet" role="dialog" aria-label="Demo Wallet" data-testid="wallet">
      <Head />
      {view !== 'connect' && <AccountRow />}
      {view === 'connect' && <Connect />}
      {view === 'home' && <Home />}
      {view === 'confirm' && <Confirm />}
      {view === 'activity' && <ActivityList />}
      {view !== 'connect' && (
        <div className="w-tabs" role="tablist">
          <button role="tab" aria-selected={view === 'home'} className={view === 'home' ? 'on' : ''} onClick={() => patchWallet({ view: 'home' })}>
            Assets
          </button>
          {w.queue.length > 0 && (
            <button role="tab" aria-selected={view === 'confirm'} className={view === 'confirm' ? 'on' : ''} onClick={() => patchWallet({ view: 'confirm' })}>
              Requests <em>{w.queue.length}</em>
            </button>
          )}
          <button role="tab" aria-selected={view === 'activity'} className={view === 'activity' ? 'on' : ''} onClick={() => patchWallet({ view: 'activity' })} data-testid="tab-activity">
            Activity{pending ? <em>{pending}</em> : null}
          </button>
        </div>
      )}
      <div className="w-foot">
        <span>DEMO KEYS. NEVER USE.</span>
        <span>NOTHING IS BROADCAST</span>
      </div>
    </div>
  );
}
