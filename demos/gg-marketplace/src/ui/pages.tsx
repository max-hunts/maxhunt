import { useState } from 'react';
import { ACCOUNTS, backend, call, href, money, productImg, server, session, toast, ui, userPic } from '../app.ts';
import type { ApiResult, Products } from '../backend/index.ts';
import { artUrl } from '../art/products.ts';
import { Empty, ErrorNote, Icon, ProductCard, StatusChip } from './bits.tsx';
import { signInAs } from './Shell.tsx';

const newestFirst = (products: Products): string[] => Object.keys(products).sort().reverse();

export function NotFound() {
  return (
    <main className="wrap page narrow">
      <div className="notfound">
        <span>404</span>
        <h1>Nothing here</h1>
        <p>That page does not exist, or it is not yours to see.</p>
        <a className="btn ink" href={href('/')}>
          Back to the marketplace
        </a>
      </div>
    </main>
  );
}

export function Home() {
  const { products } = server.home();
  const keys = newestFirst(products);
  const cities = [...new Set(Object.values(products).map((p) => p.location))].sort();
  return (
    <main className="wrap page">
      <section className="hero">
        <div className="hero-copy">
          <h1>Good stuff, from people near you.</h1>
          <p>
            List something in a minute. A person checks every listing before it goes live, and buyers reach you by
            email.
          </p>
          <div className="hero-cta">
            <a
              className="btn ink"
              href={href('/sell')}
              onClick={(e) => {
                if (!session.uid) {
                  e.preventDefault();
                  signInAs(ACCOUNTS[1]!.uid, '/sell');
                  toast('Signed in as Tom Whitfield');
                }
              }}
            >
              Start selling <Icon name="arrow" />
            </a>
            <a className="btn plain" href={href('/search')}>
              Browse everything
            </a>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <img src={artUrl('turntable')!} alt="" />
          <img src={artUrl('bike')!} alt="" />
          <img src={artUrl('armchair')!} alt="" />
        </div>
      </section>

      <ol className="how">
        <li>
          <Icon name="tag" />
          <span>
            <strong>List it</strong>A photo, a price and where you are.
          </span>
        </li>
        <li>
          <Icon name="shield" />
          <span>
            <strong>It gets reviewed</strong>Nothing is public until an admin approves it.
          </span>
        </li>
        <li>
          <Icon name="mail" />
          <span>
            <strong>Buyers email you</strong>A request lands in your inbox. You arrange the rest.
          </span>
        </li>
      </ol>

      <section>
        <div className="section-head">
          <h2>Recently added</h2>
          <a href={href('/search')}>
            See all <Icon name="arrow" size={15} />
          </a>
        </div>
        <div className="grid" data-testid="home-grid">
          {keys.map((k) => (
            <ProductCard key={k} id={k} p={products[k]!} />
          ))}
        </div>
      </section>

      <section className="cities">
        <h2>Browse by city</h2>
        <div className="pills">
          {cities.map((c) => (
            <a key={c} className="pill" href={href(`/search?city=${encodeURIComponent(c)}`)}>
              <Icon name="pin" size={14} /> {c}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}

type Sort = 'new' | 'low' | 'high';

export function Search({ q, city }: { q: string; city: string }) {
  const [sort, setSort] = useState<Sort>('new');
  const { products } = server.search(q || undefined);
  const cities = [...new Set(Object.values(products).map((p) => p.location))].sort();
  let keys = newestFirst(products).filter((k) => !city || products[k]!.location === city);
  if (sort !== 'new')
    keys = [...keys].sort((a, b) => (Number(products[a]!.price) - Number(products[b]!.price)) * (sort === 'low' ? 1 : -1));
  const link = (c: string) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (c) qs.set('city', c);
    const s = qs.toString();
    return href('/search' + (s ? `?${s}` : ''));
  };
  return (
    <main className="wrap page">
      <div className="section-head">
        <h1 data-testid="search-title">
          {q ? (
            <>
              Results for <q>{q}</q>
            </>
          ) : (
            'Everything on sale'
          )}
          <small>
            {keys.length} {keys.length === 1 ? 'listing' : 'listings'}
          </small>
        </h1>
        <label className="sort">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} data-testid="sort">
            <option value="new">Newest</option>
            <option value="low">Price: low to high</option>
            <option value="high">Price: high to low</option>
          </select>
        </label>
      </div>
      {cities.length > 1 || city ? (
        <div className="pills">
          <a className={`pill${city ? '' : ' on'}`} href={link('')}>
            Anywhere
          </a>
          {(city && !cities.includes(city) ? [...cities, city] : cities).map((c) => (
            <a key={c} className={`pill${c === city ? ' on' : ''}`} href={link(c)}>
              {c}
            </a>
          ))}
        </div>
      ) : null}
      {keys.length ? (
        <div className="grid" data-testid="search-grid">
          {keys.map((k) => (
            <ProductCard key={k} id={k} p={products[k]!} />
          ))}
        </div>
      ) : (
        <Empty title="Nothing found">
          Search looks at the name and description of listings that are on sale. Try a shorter word, or{' '}
          <a href={href('/search')}>browse everything</a>.
        </Empty>
      )}
    </main>
  );
}

/** The 2020 "Request!" and "Contact" buttons: reveal a message box, send, confirm. */
function Composer({
  cta,
  initial,
  placeholder,
  sentTitle,
  sentBody,
  send,
  testid,
}: {
  cta: string;
  initial: string;
  placeholder: string;
  sentTitle: string;
  sentBody: string;
  send: (msg: string) => ApiResult;
  testid: string;
}) {
  const [stage, setStage] = useState<'idle' | 'writing' | 'sending' | 'sent'>('idle');
  const [msg, setMsg] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  if (!session.uid)
    return (
      <div className="composer">
        <button
          className="btn lime big"
          onClick={() => toast('Sign in to send a message', { label: 'Sign in as Maya', run: () => signInAs(ACCOUNTS[0]!.uid) })}
          data-testid={testid}
        >
          Sign in to {cta.toLowerCase()}
        </button>
      </div>
    );

  if (stage === 'sent')
    return (
      <div className="sent" data-testid={`${testid}-sent`}>
        <Icon name="check" size={20} />
        <div>
          <strong>{sentTitle}</strong>
          <p>{sentBody}</p>
        </div>
      </div>
    );

  if (stage === 'idle')
    return (
      <div className="composer">
        <button className="btn lime big" onClick={() => setStage('writing')} data-testid={testid}>
          <Icon name="mail" /> {cta}
        </button>
        <ErrorNote error={error} />
      </div>
    );

  const submit = async () => {
    setStage('sending');
    setError(null);
    const r = await call(() => send(msg));
    if (r.success) setStage('sent');
    else {
      setError(r.error);
      setStage('writing');
    }
  };

  return (
    <div className="composer open">
      <label className="field">
        <span className="field-label">Your message</span>
        <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
          data-testid={`${testid}-message`}
        />
      </label>
      <div className="row">
        <button className="btn lime" onClick={submit} disabled={stage === 'sending' || !msg.trim()} data-testid={`${testid}-send`}>
          {stage === 'sending' ? 'Sending...' : 'Send'}
        </button>
        <button className="btn plain" onClick={() => setStage('idle')} disabled={stage === 'sending'}>
          Cancel
        </button>
      </div>
      <ErrorNote error={error} />
    </div>
  );
}

const STATUS_NOTE: Record<string, string> = {
  pending: 'This listing is waiting for review. Only people with the link can see it.',
  'off-sale': 'The seller has taken this listing off sale.',
  sold: 'This item has been sold.',
  rejected: 'This listing was rejected in review.',
};

export function ProductPage({ id }: { id: string }) {
  const page = server.product(id);
  if (!page.ok) return <NotFound />;
  const { item, key, seller } = page.data;
  const mine = session.uid === item.owner;
  const sellerUser = backend.store.data.users[seller.dbid];
  const sellerFirst = seller.name.split(' ')[0];

  return (
    <main className="wrap page">
      <a className="crumb" href={href('/search')}>
        <Icon name="back" size={16} /> All listings
      </a>
      <div className="product">
        <div className="product-img">
          <img src={productImg(item)} alt={item.name} />
        </div>
        <div className="product-info">
          {item.status !== 'on-sale' && <StatusChip status={item.status} />}
          <h1 data-testid="product-name">{item.name}</h1>
          <div className="price" data-testid="product-price">
            {money(item.price)}
          </div>
          <dl className="facts">
            <div>
              <dt>Location</dt>
              <dd>{item.location}</dd>
            </div>
            <div>
              <dt>Quantity</dt>
              <dd>{item.stock}</dd>
            </div>
          </dl>

          {item.status !== 'on-sale' && <p className="note">{STATUS_NOTE[item.status]}</p>}

          {mine ? (
            <div className="composer">
              <a className="btn ink big" href={href(`/selling/${key}`)} data-testid="manage-link">
                <Icon name="pencil" /> Manage your listing
              </a>
            </div>
          ) : item.status === 'on-sale' ? (
            <Composer
              key={`${key}:${session.uid}`}
              cta="Request to buy"
              initial="Hi, I would like to purchase your item"
              placeholder="Your message to the seller"
              sentTitle={`Request sent to ${sellerFirst}`}
              sentBody={`${sellerFirst} gets an email with your message and your address, and replies to you directly.`}
              testid="request"
              send={(usrMsg) => {
                const r = server.request({ prodID: key, authToken: session.token(), usrMsg });
                if (r.success) {
                  const sent = sellerUser ? backend.mail.inbox(sellerUser.email)[0] : undefined;
                  if (sent && session.guide.key === key && !session.guide.mail) session.setGuide({ mail: sent.id });
                  toast(`Email sent to ${sellerFirst}`, {
                    label: `Read it as ${sellerFirst}`,
                    run: () => {
                      signInAs(item.owner);
                      ui.set({ inbox: true });
                    },
                  });
                }
                return r;
              }}
            />
          ) : null}

          <a className="seller" href={href(`/u/${seller.dbid}`)} data-testid="seller-link">
            <img src={userPic(sellerUser?.pPic ?? '', seller.name)} alt="" />
            <span>
              <small>Seller</small>
              <strong>{mine ? 'You' : seller.name}</strong>
              {sellerUser && <small>Member since {sellerUser.memberSince}</small>}
            </span>
            <Icon name="arrow" size={16} />
          </a>
        </div>
      </div>
      <section className="desc">
        <h2>Description</h2>
        <p>{item.desc}</p>
      </section>
    </main>
  );
}

export function Profile({ dbid }: { dbid: string }) {
  const page = server.userProfile(dbid);
  if (!page.ok) return <NotFound />;
  const { user, userProducts, userDBID } = page.data;
  const keys = newestFirst(userProducts);
  const me = session.me();
  const mine = me?.key === userDBID;
  const first = user.name.split(' ')[0];
  return (
    <main className="wrap page">
      <section className="profile">
        <img className="profile-pic" src={userPic(user.pPic, user.name)} alt="" />
        <div className="profile-info">
          <h1 data-testid="profile-name">{user.name}</h1>
          <p>
            <Icon name="pin" size={15} /> {user.location} · Member since {user.memberSince}
          </p>
        </div>
        <div className="profile-cta">
          {mine ? (
            <a className="btn ink" href={href('/selling')}>
              Manage your listings
            </a>
          ) : (
            <Composer
              key={`${userDBID}:${session.uid}`}
              cta="Contact"
              initial=""
              placeholder={`Your message to ${first}`}
              sentTitle={`Message sent to ${first}`}
              sentBody="It goes out as an email with your address in it."
              testid="contact"
              send={(usrMsg) => server.contact({ userDBID, authToken: session.token(), usrMsg })}
            />
          )}
        </div>
      </section>
      <section>
        <div className="section-head">
          <h2>
            On sale
            <small>
              {keys.length} {keys.length === 1 ? 'listing' : 'listings'}
            </small>
          </h2>
        </div>
        {keys.length ? (
          <div className="grid">
            {keys.map((k) => (
              <ProductCard key={k} id={k} p={userProducts[k]!} />
            ))}
          </div>
        ) : (
          <Empty title="Nothing listed">{mine ? 'Your listings appear here once they are approved.' : `${first} has nothing on sale right now.`}</Empty>
        )}
      </section>
    </main>
  );
}
