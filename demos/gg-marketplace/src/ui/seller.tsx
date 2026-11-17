import { useEffect, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { ACCOUNTS, ADMIN_UID, backend, call, fileToDataUrl, href, money, navigate, productImg, server, session, toast, userPic } from '../app.ts';
import type { Product, ProductStatus } from '../backend/index.ts';
import { SAMPLE_ART, artUrl } from '../art/products.ts';
import { Empty, ErrorNote, Field, Icon, StatusChip } from './bits.tsx';
import { NotFound } from './pages.tsx';
import { signInAs } from './Shell.tsx';

/** A chosen picture: an uploaded file (already shrunk) or one of the sample illustrations. */
interface Picked {
  name: string;
  url: string;
  upload: boolean;
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/gif'];

function ImageDrop({
  value,
  onChange,
  onError,
  samples,
}: {
  value: Picked | null;
  onChange: (p: Picked | null) => void;
  onError: (msg: string | null) => void;
  samples?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  // The same two checks, and the same messages, as the 2020 drop zone.
  const add = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.includes(file.type)) return onError('Accepted formats: jpeg/jpg, png, gif');
    if (file.size / 1024 / 1024 >= 10) return onError('Files under 10MB please...');
    try {
      onChange({ name: file.name, url: await fileToDataUrl(file), upload: true });
      onError(null);
    } catch {
      onError('That image could not be read');
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    void add(e.dataTransfer.files[0]);
  };

  return (
    <div className="drop-col">
      <div
        className={`dropzone${over ? ' over' : ''}${value ? ' has' : ''}`}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
        data-testid="dropzone"
      >
        <input
          ref={input}
          type="file"
          accept={ACCEPT.join(', ')}
          hidden
          onChange={(e) => void add(e.target.files?.[0])}
          data-testid="file-input"
        />
        {value ? (
          <img src={value.url} alt="Preview" />
        ) : (
          <span className="drop-hint">
            <Icon name="upload" size={28} />
            <strong>Drop a photo here</strong>
            <small>or click to choose. JPEG, PNG or GIF, under 10 MB.</small>
          </span>
        )}
      </div>
      {samples && (
        <div className="samples">
          <small>No photo to hand? Use a sample:</small>
          <div>
            {SAMPLE_ART.map((k) => (
              <button
                key={k}
                type="button"
                className={value?.name === `${k}.svg` ? 'on' : ''}
                onClick={() => {
                  onChange({ name: `${k}.svg`, url: artUrl(k)!, upload: false });
                  onError(null);
                }}
                aria-label={`Sample photo: ${k}`}
                data-testid={`sample-${k}`}
              >
                <img src={artUrl(k)!} alt="" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SignInGate({ what }: { what: string }) {
  return (
    <main className="wrap page narrow">
      <Empty title="Please sign in to continue">You need an account to {what}.</Empty>
      <div className="center">
        <button className="btn ink" onClick={() => signInAs(ACCOUNTS[1]!.uid)} data-testid="gate-signin">
          Sign in as Tom
        </button>
      </div>
    </main>
  );
}

const EXAMPLE = {
  name: 'Ceramic vase',
  desc: 'Hand-thrown blue vase, 25 cm tall. No chips or cracks. Flowers not included.',
  price: '16',
  stock: '',
};

export function Sell() {
  const me = session.me();
  const [form, setForm] = useState({ name: '', desc: '', location: me?.user.address ?? '', stock: '', price: '' });
  const [pic, setPic] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (session.uid && !me) navigate('/register');
  }, [me]);
  if (!session.uid) return <SignInGate what="list an item" />;
  if (!me) return null;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    // checkFields() in the 2020 client
    if (!form.name || !form.desc || !form.location || !form.price || !pic)
      return setError('Fill in all required fields, including a photo');
    setBusy(true);
    setError(null);
    const r = await call(() =>
      server.newProduct({
        authToken: session.token(),
        product: { name: form.name, desc: form.desc, location: form.location, stock: form.stock, price: form.price },
        image: { name: pic.name },
      }),
    );
    setBusy(false);
    if (!r.success) return setError(r.error);
    // Then, as in 2020, the browser uploads the file to the path the server handed back.
    if (pic.upload) backend.uploads.put(r.imgRef, pic.url);
    const key = r.imgRef.split('/')[2]!;
    const g = session.guide;
    const prev = g.key ? backend.store.data.products[g.key] : undefined;
    if (!prev || prev.status === 'rejected') session.setGuide({ key, mail: undefined });
    setDone(key);
  };

  if (done) {
    const item = backend.store.data.products[done];
    return (
      <main className="wrap page narrow">
        <div className="confirm" data-testid="sell-done">
          <span className="confirm-mark">
            <Icon name="check" size={26} />
          </span>
          <h1>Sent for review</h1>
          <p>
            <strong>{item?.name}</strong> is saved as <StatusChip status="pending" />. It will not appear on the home
            page or in search until an admin approves it.
          </p>
          <div className="row center">
            <a className="btn ink" href={href(`/selling/${done}`)}>
              View your listing
            </a>
            <button className="btn plain" onClick={() => signInAs(ADMIN_UID, '/admin')} data-testid="to-admin">
              <Icon name="swap" /> Review it as the admin
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap page">
      <div className="section-head">
        <h1>List an item</h1>
        <button
          type="button"
          className="btn plain small"
          onClick={() => {
            setForm({ ...EXAMPLE, location: form.location || me.user.address });
            setPic({ name: 'vase.svg', url: artUrl('vase')!, upload: false });
            setError(null);
          }}
          data-testid="fill-example"
        >
          Fill in an example
        </button>
      </div>
      <form className="panel form-2" onSubmit={submit} noValidate>
        <div className="form-col">
          <Field label="What are you selling?">
            <input value={form.name} onChange={set('name')} placeholder="Product name" maxLength={80} data-testid="f-name" />
          </Field>
          <Field label="Description">
            <textarea value={form.desc} onChange={set('desc')} placeholder="Condition, size, anything a buyer should know" rows={5} data-testid="f-desc" />
          </Field>
          <div className="form-row">
            <Field label="Price">
              <span className="prefix">
                <i>£</i>
                <input value={form.price} onChange={set('price')} inputMode="decimal" placeholder="0" data-testid="f-price" />
              </span>
            </Field>
            <Field label="Quantity" hint="default 1">
              <input value={form.stock} onChange={set('stock')} inputMode="numeric" placeholder="1" data-testid="f-stock" />
            </Field>
          </div>
          <Field label="Location">
            <input value={form.location} onChange={set('location')} placeholder="e.g. London" data-testid="f-location" />
          </Field>
        </div>
        <div className="form-col">
          <span className="field-label">Photo</span>
          <ImageDrop value={pic} onChange={setPic} onError={setError} samples />
        </div>
        <div className="form-foot">
          <ErrorNote error={error} />
          <p className="muted">New listings are reviewed by an admin before they go live.</p>
          <button className="btn lime big" type="submit" disabled={busy} data-testid="submit-listing">
            {busy ? 'Uploading...' : 'Submit for review'}
          </button>
        </div>
      </form>
    </main>
  );
}

function ShippingAddress() {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const current = server.shippingAddressGet({ authToken: session.token() });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const r = await call(() => server.shippingAddressEdit({ authToken: session.token(), address: value }));
    if (!r.success) return setError(r.error);
    setEditing(false);
    setError(null);
    toast('Shipping address saved');
  };
  return (
    <div className="panel address">
      <div>
        <small>Your shipping address</small>
        {editing ? (
          <form onSubmit={save}>
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Type address, enter to submit" autoFocus data-testid="address-input" />
            <button className="btn ink small" type="submit">
              Save
            </button>
            <button className="btn plain small" type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <strong data-testid="address">{current.success ? current.address : "Can't retrieve current shipping address"}</strong>
        )}
        <ErrorNote error={error} />
      </div>
      {!editing && (
        <button
          className="btn plain small"
          onClick={() => {
            setValue(current.success ? current.address : '');
            setEditing(true);
          }}
          data-testid="address-edit"
        >
          <Icon name="pencil" size={15} /> Edit
        </button>
      )}
    </div>
  );
}

const TABS: { id: ProductStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'on-sale', label: 'On sale' },
  { id: 'pending', label: 'In review' },
  { id: 'off-sale', label: 'Off sale' },
  { id: 'sold', label: 'Sold' },
  { id: 'rejected', label: 'Rejected' },
];

export function Selling() {
  const [tab, setTab] = useState<ProductStatus | 'all'>('all');
  if (!session.uid) return <SignInGate what="see your listings" />;
  const page = server.myProducts(session.token());
  if (!page.ok) {
    return (
      <main className="wrap page narrow">
        <Empty title="Finish registering first">
          <a href={href('/register')}>Complete your account</a> to start listing.
        </Empty>
      </main>
    );
  }
  const { products, dbid } = page.data;
  const all = Object.keys(products).sort().reverse();
  const keys = all.filter((k) => tab === 'all' || products[k]!.status === tab);
  const count = (id: ProductStatus | 'all') => (id === 'all' ? all.length : all.filter((k) => products[k]!.status === id).length);
  const admin = session.isAdmin();
  return (
    <main className="wrap page">
      <div className="section-head">
        <h1>
          {admin ? 'All listings' : 'Your listings'}
          {admin && <small>The admin account can manage every listing</small>}
        </h1>
        <div className="row">
          {dbid && (
            <a className="btn plain small" href={href(`/u/${dbid}`)}>
              <Icon name="user" size={15} /> My profile
            </a>
          )}
          <a className="btn lime small" href={href('/sell')}>
            <Icon name="plus" size={15} /> New listing
          </a>
        </div>
      </div>
      {!admin && <ShippingAddress />}
      <div className="tabs" role="tablist">
        {TABS.filter((t) => t.id === 'all' || count(t.id) > 0).map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label} <i>{count(t.id)}</i>
          </button>
        ))}
      </div>
      {keys.length ? (
        <ul className="rows" data-testid="my-listings">
          {keys.map((k) => {
            const p = products[k]!;
            return (
              <li key={k}>
                <a className="rowlink" href={href(`/selling/${k}`)} data-testid="my-listing">
                  <img src={productImg(p)} alt="" />
                  <span className="row-main">
                    <strong>{p.name}</strong>
                    <small>
                      {p.location} · Qty {p.stock}
                    </small>
                  </span>
                  <StatusChip status={p.status} />
                  <span className="row-price">{money(p.price)}</span>
                  <Icon name="arrow" size={16} />
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="No products listed">
          <a href={href('/sell')}>List your first item</a>. It takes about a minute.
        </Empty>
      )}
    </main>
  );
}

const MANAGE_NOTE: Record<ProductStatus, string> = {
  pending: 'Waiting for an admin to review it. You can still edit the details.',
  'on-sale': 'Live. Buyers can find it in search and send you a request.',
  'off-sale': 'Hidden from search. Put it back on sale whenever you like.',
  sold: 'Marked as sold. Sold listings are final.',
  rejected: 'Rejected in review. It will not be shown to buyers.',
};

function useOwned(id: string): { item: Product; key: string } | null {
  const page = server.myProduct(session.token(), id);
  return page.ok ? page.data : null;
}

export function Manage({ id }: { id: string }) {
  const owned = useOwned(id);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSold, setConfirmSold] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!owned) return <NotFound />;
  const { item, key } = owned;
  const live = item.status === 'on-sale' || item.status === 'off-sale';

  const run = async (name: string, fn: () => { success: boolean; error: string | null }, okMsg: string) => {
    setBusy(name);
    setError(null);
    const r = await call(fn);
    setBusy(null);
    setConfirmSold(false);
    if (r.success) toast(okMsg);
    else setError(r.error);
  };

  return (
    <main className="wrap page">
      <a className="crumb" href={href('/selling')}>
        <Icon name="back" size={16} /> {session.isAdmin() ? 'All listings' : 'Your listings'}
      </a>
      <div className="product">
        <div className="product-img">
          <img src={productImg(item)} alt={item.name} />
        </div>
        <div className="product-info">
          <StatusChip status={item.status} />
          <h1>{item.name}</h1>
          <div className="price">{money(item.price)}</div>
          <p className={`note${item.status === 'pending' ? '' : ' plain'}`} data-testid="manage-note">
            {MANAGE_NOTE[item.status]}
          </p>
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
          <div className="manage">
            {(live || item.status === 'pending') && (
              <a className="btn plain" href={href(`/selling/${key}/edit`)} data-testid="edit-link">
                <Icon name="pencil" /> Edit
              </a>
            )}
            {live && (
              <button
                className="btn plain"
                disabled={!!busy}
                onClick={() =>
                  run(
                    'toggle',
                    () => server.toggleSale({ prodID: key, authToken: session.token(), targetState: item.status !== 'on-sale' }),
                    item.status === 'on-sale' ? 'Taken off sale' : 'Back on sale',
                  )
                }
                data-testid="toggle-sale"
              >
                {busy === 'toggle' ? 'Saving...' : item.status === 'on-sale' ? 'Take off sale' : 'Place on sale'}
              </button>
            )}
            {item.status === 'on-sale' &&
              (confirmSold ? (
                <span className="confirm-inline">
                  <button
                    className="btn ink"
                    disabled={!!busy}
                    onClick={() => run('sold', () => server.sold({ prodID: key, authToken: session.token() }), 'Marked as sold')}
                    data-testid="confirm-sold"
                  >
                    {busy === 'sold' ? 'Saving...' : 'Confirm: it is sold'}
                  </button>
                  <button className="btn plain" onClick={() => setConfirmSold(false)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button className="btn lime" onClick={() => setConfirmSold(true)} data-testid="mark-sold">
                  <Icon name="check" /> Mark sold
                </button>
              ))}
          </div>
          <ErrorNote error={error} />
          <a className="textlink" href={href(`/item/${key}`)}>
            See it as a buyer <Icon name="arrow" size={15} />
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

export function Edit({ id }: { id: string }) {
  const owned = useOwned(id);
  const [form, setForm] = useState(() =>
    owned
      ? { name: owned.item.name, desc: owned.item.desc, location: owned.item.location, stock: String(owned.item.stock), price: String(owned.item.price) }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!owned || !form) return <NotFound />;
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const r = await call(() => server.updateProduct({ authToken: session.token(), product: form, productID: owned.key }));
    setBusy(false);
    if (!r.success) return setError(r.error);
    toast('Listing updated');
    navigate(`/selling/${owned.key}`);
  };
  return (
    <main className="wrap page narrow">
      <a className="crumb" href={href(`/selling/${owned.key}`)}>
        <Icon name="back" size={16} /> Back to listing
      </a>
      <h1>Edit listing</h1>
      <form className="panel form-col" onSubmit={submit}>
        <Field label="Name">
          <input value={form.name} onChange={set('name')} data-testid="e-name" />
        </Field>
        <Field label="Description">
          <textarea value={form.desc} onChange={set('desc')} rows={5} />
        </Field>
        <div className="form-row">
          <Field label="Price">
            <span className="prefix">
              <i>£</i>
              <input value={form.price} onChange={set('price')} inputMode="decimal" data-testid="e-price" />
            </span>
          </Field>
          <Field label="Quantity">
            <input value={form.stock} onChange={set('stock')} inputMode="numeric" />
          </Field>
        </div>
        <Field label="Location">
          <input value={form.location} onChange={set('location')} />
        </Field>
        <ErrorNote error={error} />
        <div className="row">
          <button className="btn lime" type="submit" disabled={busy} data-testid="save-edit">
            {busy ? 'Updating...' : 'Update'}
          </button>
          <a className="btn plain" href={href(`/selling/${owned.key}`)}>
            Cancel
          </a>
        </div>
      </form>
    </main>
  );
}

export function Admin() {
  const page = server.adminReview(session.token());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!page.ok) return <NotFound />;
  const { products } = page.data;
  const keys = Object.keys(products).sort();
  const decide = async (key: string, approved: boolean) => {
    setBusy(key);
    const name = products[key]!.name;
    const r = await call(() => server.productAR({ authToken: session.token(), prodID: key, approved }));
    setBusy(null);
    if (!r.success) return setError(r.error);
    toast(approved ? `Approved: ${name} is now on sale` : `Rejected: ${name}`);
  };
  return (
    <main className="wrap page">
      <div className="section-head">
        <h1>
          Review queue
          <small>
            {keys.length} waiting. Oldest first.
          </small>
        </h1>
      </div>
      <ErrorNote error={error} />
      {keys.length ? (
        <ul className="queue" data-testid="queue">
          {keys.map((k) => {
            const p = products[k]!;
            const seller = Object.values(backend.store.data.users).find((u) => u.UID === p.owner);
            const sellerName = seller ? `${seller.fName} ${seller.lName}` : 'Unknown';
            return (
              <li key={k} className="panel" data-testid="queue-item">
                <a href={href(`/item/${k}`)} className="queue-img">
                  <img src={productImg(p)} alt="" />
                </a>
                <div className="queue-main">
                  <div className="queue-top">
                    <strong>{p.name}</strong>
                    <span>{money(p.price)}</span>
                  </div>
                  <small className="queue-seller">
                    <img src={userPic(seller?.pPic ?? '', sellerName)} alt="" /> {sellerName} · {p.location} · Qty {p.stock}
                  </small>
                  <p>{p.desc}</p>
                  <div className="row">
                    <button className="btn lime" disabled={busy === k} onClick={() => decide(k, true)} data-testid="approve">
                      <Icon name="check" /> Approve
                    </button>
                    <button className="btn danger" disabled={busy === k} onClick={() => decide(k, false)} data-testid="reject">
                      <Icon name="x" /> Reject
                    </button>
                    <a className="btn plain" href={href(`/item/${k}`)}>
                      Preview
                    </a>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <Empty title="Nothing to review">New listings show up here the moment a seller submits them.</Empty>
      )}
    </main>
  );
}

export function Register() {
  const acct = session.account();
  const me = session.me();
  const [form, setForm] = useState({ fName: '', lName: '', address: '' });
  const [pic, setPic] = useState<Picked | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me) navigate('/');
  }, [me]);
  if (!acct)
    return (
      <main className="wrap page narrow">
        <Empty title="Please log in to continue">Pick “New account” from the sign-in menu to try registration.</Empty>
      </main>
    );
  if (me) return null;

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await call(() =>
      server.registerNewUser({ authToken: session.token(), data: { ...form, pPic: pic?.name ?? 'default.png' } }),
    );
    setBusy(false);
    if (!r.success) return setError(r.error === 'invalid data' ? 'Fill in your name and address' : r.error);
    if (pic?.upload) backend.uploads.put(r.imgRef, pic.url);
    toast(`Welcome, ${form.fName}`);
    navigate('/');
  };

  return (
    <main className="wrap page narrow">
      <h1>Create your account</h1>
      <p className="muted lead">
        You are signed in as <strong>{acct.email}</strong>, but GG does not know you yet. In 2020 every first sign-in
        was sent here before it could do anything else.
      </p>
      <form className="panel form-2" onSubmit={submit} noValidate>
        <div className="form-col">
          <div className="form-row">
            <Field label="First name">
              <input value={form.fName} onChange={set('fName')} autoComplete="off" data-testid="r-first" />
            </Field>
            <Field label="Last name">
              <input value={form.lName} onChange={set('lName')} autoComplete="off" data-testid="r-last" />
            </Field>
          </div>
          <Field label="Location" hint="shown on your profile">
            <input value={form.address} onChange={set('address')} placeholder="Address" autoComplete="off" data-testid="r-address" />
          </Field>
        </div>
        <div className="form-col">
          <span className="field-label">
            Profile photo<em>optional here</em>
          </span>
          <ImageDrop value={pic} onChange={setPic} onError={setError} />
        </div>
        <div className="form-foot">
          <ErrorNote error={error} />
          <button className="btn lime big" type="submit" disabled={busy} data-testid="register-submit">
            {busy ? 'Saving...' : 'Create account'}
          </button>
        </div>
      </form>
    </main>
  );
}
