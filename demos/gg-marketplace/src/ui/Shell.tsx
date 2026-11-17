import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ACCOUNTS, ADMIN_UID, backend, href, navigate, resetDemo, session, toast, ui, useRoute, userPic } from '../app.ts';
import { VISITOR_UID, type Account, type Mail } from '../backend/index.ts';
import { Icon, Logo } from './bits.tsx';

const CASE_STUDY = '/work/gg-marketplace/';

/** Sign in as one of the demo accounts and land where the 2020 app would have sent you. */
export function signInAs(uid: string, then?: string): void {
  ui.set({ toast: null });
  const { registered } = session.signIn(uid);
  if (!registered) navigate('/register');
  else if (then) navigate(then);
}

function nameOf(acct: Account): string {
  const me = Object.values(backend.store.data.users).find((u) => u.UID === acct.uid);
  return me ? `${me.fName} ${me.lName}` : acct.label;
}

function AccountRow({ acct, onPick }: { acct: Account; onPick: () => void }) {
  const name = nameOf(acct);
  const role = acct.uid === ADMIN_UID ? 'Admin' : acct.uid === VISITOR_UID ? 'You' : acct.blurb.split(' ')[0];
  return (
    <button className="acct-row" onClick={onPick} data-testid={`account-${acct.email.split('@')[0]}`}>
      <img src={userPic('', name)} alt="" />
      <span>
        <strong>
          {name} <i>{role}</i>
        </strong>
        <small>{acct.blurb}</small>
      </span>
    </button>
  );
}

function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);
  return ref;
}

function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const acct = session.account();
  const me = session.me();
  const name = me ? `${me.user.fName} ${me.user.lName}` : (acct?.label ?? '');
  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };
  const pick = (uid: string) => {
    setOpen(false);
    signInAs(uid);
    const a = ACCOUNTS.find((x) => x.uid === uid)!;
    toast(`Signed in as ${nameOf(a)}`);
  };

  return (
    <div className="menu-wrap" ref={ref}>
      {acct ? (
        <button className="acct-btn" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="account-button">
          <img src={me ? userPic(me.user.pPic, name) : userPic('', name)} alt="" />
          <span className="acct-name">{me ? me.user.fName : 'Unregistered'}</span>
          <Icon name="chevron" size={16} />
        </button>
      ) : (
        <button className="btn ghost" onClick={() => setOpen(!open)} aria-expanded={open} data-testid="signin-button">
          <Icon name="user" /> Sign in
        </button>
      )}
      {open && (
        <div className="menu" role="menu">
          {acct ? (
            <>
              <div className="menu-head">
                <strong>{name}</strong>
                <small>{acct.email}</small>
              </div>
              {me ? (
                <>
                  <button className="menu-item" onClick={() => go('/selling')} data-testid="menu-selling">
                    <Icon name="tag" /> {session.isAdmin() ? 'All listings' : 'My listings'}
                  </button>
                  <button className="menu-item" onClick={() => go(`/u/${me.key}`)}>
                    <Icon name="user" /> My profile
                  </button>
                </>
              ) : (
                <button className="menu-item" onClick={() => go('/register')}>
                  <Icon name="user" /> Finish registration
                </button>
              )}
              {session.isAdmin() && (
                <button className="menu-item" onClick={() => go('/admin')} data-testid="menu-admin">
                  <Icon name="shield" /> Review queue
                </button>
              )}
              <div className="menu-label">Switch account</div>
              {ACCOUNTS.filter((a) => a.uid !== acct.uid).map((a) => (
                <AccountRow key={a.uid} acct={a} onPick={() => pick(a.uid)} />
              ))}
              <button
                className="menu-item"
                onClick={() => {
                  setOpen(false);
                  session.signOut();
                  navigate('/');
                }}
                data-testid="signout"
              >
                <Icon name="out" /> Sign out
              </button>
            </>
          ) : (
            <>
              <div className="menu-head">
                <strong>Pick a demo account</strong>
                <small>In 2020 this was Google, Facebook or a password. Here you can be anyone.</small>
              </div>
              {ACCOUNTS.map((a) => (
                <AccountRow key={a.uid} acct={a} onPick={() => pick(a.uid)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SearchBox() {
  const route = useRoute();
  const current = route.parts[0] === 'search' ? (route.query.get('q') ?? '') : '';
  const [q, setQ] = useState(current);
  useEffect(() => setQ(current), [current]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    navigate(q.trim() ? `/search?q=${encodeURIComponent(q.trim())}` : '/search');
  };
  return (
    <form className="search" onSubmit={submit} role="search">
      <Icon name="search" />
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="I want..."
        aria-label="Search listings"
        data-testid="search-input"
      />
      <button type="submit">Search</button>
    </form>
  );
}

export function Header() {
  const unread = session.unread();
  const signedIn = !!session.uid;
  return (
    <header className="header">
      <div className="wrap header-in">
        <a className="brand" href={href('/')} aria-label="GG Marketplace home">
          <Logo />
          <span>marketplace</span>
        </a>
        <SearchBox />
        <nav className="actions">
          <a
            className="btn lime"
            href={href('/sell')}
            onClick={(e) => {
              if (!signedIn) {
                e.preventDefault();
                toast('Sign in to list an item', { label: 'Sign in as Tom', run: () => signInAs(ACCOUNTS[1]!.uid, '/sell') });
              }
            }}
            data-testid="sell-link"
          >
            <Icon name="plus" /> <span>Sell</span>
          </a>
          <button
            className="icon-btn"
            onClick={() => ui.set({ inbox: true })}
            aria-label={`Inbox, ${unread} unread`}
            data-testid="inbox-button"
          >
            <Icon name="bell" size={20} />
            {unread > 0 && <b data-testid="unread">{unread}</b>}
          </button>
          <AccountMenu />
        </nav>
      </div>
    </header>
  );
}

export function DemoBar() {
  return (
    <div className="demobar">
      <div className="wrap">
        <span>
          <b>Concept demo.</b>{' '}
          <span className="long">
            A 2020 prototype rebuilt in 2026. No server: accounts, listings and email all live in this browser tab.
          </span>
        </span>
        <span className="demobar-links">
          {session.guide.hidden && (
            <button onClick={() => session.setGuide({ hidden: false })} data-testid="show-guide">
              Show guide
            </button>
          )}
          <a href={CASE_STUDY}>About this project</a>
          <button
            onClick={() => {
              resetDemo();
              navigate('/');
              toast('Demo reset to its starting state');
            }}
            data-testid="reset"
          >
            <Icon name="reset" size={14} /> Reset
          </button>
        </span>
      </div>
    </div>
  );
}

function MailItem({ mail }: { mail: Mail }) {
  const [open, setOpen] = useState(false);
  const unread = !session.isRead(mail.id);
  return (
    <li className={`mail${unread ? ' unread' : ''}${open ? ' open' : ''}`} data-testid="mail">
      <button
        className="mail-head"
        onClick={() => {
          setOpen(!open);
          session.markRead(mail.id);
        }}
        aria-expanded={open}
      >
        <span className="mail-dot" />
        <span>
          <strong>{mail.subject}</strong>
          <small>
            {mail.from} · {new Date(mail.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </small>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="mail-body">
          <dl>
            <dt>From</dt>
            <dd>{mail.from}</dd>
            <dt>To</dt>
            <dd>{mail.to}</dd>
          </dl>
          <pre data-testid="mail-text">{mail.text}</pre>
        </div>
      )}
    </li>
  );
}

export function Inbox() {
  const acct = session.account();
  const mails = acct ? backend.mail.inbox(acct.email) : [];
  useEffect(() => {
    if (!ui.inbox) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && ui.set({ inbox: false });
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [ui.inbox]);
  return (
    <div className={`drawer-wrap${ui.inbox ? ' open' : ''}`} aria-hidden={!ui.inbox}>
      <div className="scrim" onClick={() => ui.set({ inbox: false })} />
      <aside className="drawer" role="dialog" aria-label="Inbox" data-testid="inbox">
        <div className="drawer-head">
          <div>
            <h2>Inbox</h2>
            <small>{acct ? acct.email : 'Not signed in'}</small>
          </div>
          <button className="icon-btn" onClick={() => ui.set({ inbox: false })} aria-label="Close inbox">
            <Icon name="x" />
          </button>
        </div>
        <p className="drawer-note">
          <Icon name="info" size={15} />
          <span>
            The 2020 app emailed sellers through Gmail. In this demo the same message, word for word, lands here.
          </span>
        </p>
        {mails.length ? (
          <ul className="mails">
            {mails.map((m) => (
              <MailItem key={m.id} mail={m} />
            ))}
          </ul>
        ) : (
          <div className="empty">
            <strong>{acct ? 'No mail yet' : 'Sign in to see an inbox'}</strong>
            <p>
              {acct
                ? 'When someone requests one of your listings or contacts you from your profile, the email shows up here.'
                : 'Each demo account has its own.'}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}

// ---- the guided loop ------------------------------------------------------

const TOM = ACCOUNTS[1]!.uid;
const MAYA = ACCOUNTS[0]!.uid;

export function Guide() {
  const g = session.guide;
  const item = g.key ? backend.store.data.products[g.key] : undefined;
  const rejected = item?.status === 'rejected';
  const listed = !!item && !rejected;
  const approved = listed && item.status !== 'pending';
  const requested = approved && !!g.mail;
  const read = requested && session.isRead(g.mail!);
  const done = [listed, approved, requested, read];
  const step = done.findIndex((d) => !d);
  const at = useRoute().parts.join('/');
  if (g.hidden) return null;

  const buyer = item?.owner === MAYA ? TOM : MAYA;
  const buyerName = buyer === MAYA ? 'Maya' : 'Tom';
  const sellerAcct = ACCOUNTS.find((a) => a.uid === item?.owner);
  const sellerName = sellerAcct ? nameOf(sellerAcct).split(' ')[0] : 'the seller';
  const canSell = !!session.me() && !session.isAdmin();

  // Each step knows whether the visitor is already the right person in the
  // right place. If so the bar says what to do there instead of offering a jump.
  const uid = session.uid;
  const steps: { title: string; hint: string; here: boolean; cta: string; run: () => void }[] = [
    {
      title: 'List an item',
      hint: rejected ? 'Rejected. Submit another listing' : 'Fill in the form and submit it',
      here: canSell && at === 'sell',
      cta: canSell ? 'Open the sell form' : 'Sign in as Tom and sell',
      run: () => (canSell ? navigate('/sell') : signInAs(TOM, '/sell')),
    },
    {
      title: 'Approve it as admin',
      hint: 'Approve the new listing',
      here: session.isAdmin() && at === 'admin',
      cta: session.isAdmin() ? 'Open the review queue' : 'Switch to Admin',
      run: () => signInAs(ADMIN_UID, '/admin'),
    },
    {
      title: 'Request it as a buyer',
      hint: 'Press Request to buy, then Send',
      here: uid === buyer && at === `item/${g.key}`,
      cta: uid === buyer ? 'Open the listing' : `Switch to ${buyerName}`,
      run: () => signInAs(buyer, `/item/${g.key}`),
    },
    {
      title: 'Read the email',
      hint: 'Open the email in the inbox',
      here: uid === item?.owner && ui.inbox,
      cta: uid === item?.owner ? 'Open your inbox' : `Switch to ${sellerName}`,
      run: () => {
        if (item && uid !== item.owner) signInAs(item.owner);
        ui.set({ inbox: true });
      },
    },
  ];
  const now = steps[step];

  return (
    <>
      <div className="guide-spacer" />
      <aside className="guide" aria-label="Demo guide" data-testid="guide">
        <div className="wrap">
          <b className="guide-title">Try the whole loop</b>
          <ol>
            {steps.map((s, i) => (
              <li key={s.title} className={done[i] ? 'done' : i === step ? 'now' : ''} data-step={i + 1}>
                <span className="guide-mark">{done[i] ? <Icon name="check" size={13} /> : i + 1}</span>
                <span className="guide-step">{s.title}</span>
              </li>
            ))}
          </ol>
          {now ? (
            <div className="guide-now">
              {now.here ? (
                <span className="guide-hint" data-testid="guide-hint">
                  {now.hint}
                </span>
              ) : (
                <button className="btn small" onClick={now.run} data-testid="guide-cta">
                  {now.cta} <Icon name="arrow" size={15} />
                </button>
              )}
            </div>
          ) : (
            <div className="guide-now">
              <span data-testid="guide-done">All four steps done</span>
              <a className="btn small" href={CASE_STUDY}>
                How it was built <Icon name="arrow" size={15} />
              </a>
            </div>
          )}
          <button className="guide-hide" onClick={() => session.setGuide({ hidden: true })} aria-label="Hide the guide">
            <Icon name="x" size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}

export function ToastHost() {
  const t = ui.toast;
  return (
    <div className={`toast${t ? ' show' : ''}`} role="status" aria-live="polite" data-testid="toast">
      {t && (
        <>
          <span>{t.text}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                ui.set({ toast: null });
              }}
              data-testid="toast-action"
            >
              {t.action.label}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <span>
          <Logo size={26} /> GG Marketplace, a 2020 prototype by <a href="/">Max Hunt</a>
        </span>
        <span>
          Everyone on this page is fictional. <a href={CASE_STUDY}>Case study</a> ·{' '}
          <a href="https://github.com/max-hunts/gg-marketplace" target="_blank" rel="noopener noreferrer">
            Original source
          </a>
        </span>
      </div>
    </footer>
  );
}
