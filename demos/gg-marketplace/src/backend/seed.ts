import { prng, pushId } from './db.ts';
import type { Account, Database, Product, ProductStatus, User } from './types.ts';

// Everything here is fictional. The 2020 database is gone (and its listings
// were never in the repository), so the demo opens on a marketplace seeded by
// hand: five sellers, one buyer, and listings in every state of the lifecycle.

/** Bump when the seed changes: saved state from an older seed is discarded. */
export const SEED_ID = 'gg-2026-11-b';

export const ADMIN_UID = 'gGdemoAdmin0000000000000uid1';
export const VISITOR_UID = 'gGdemoVisitor00000000000uid7';

interface SeedUser {
  uid: string;
  fName: string;
  lName: string;
  city: string;
  since: string;
}

const PEOPLE: SeedUser[] = [
  { uid: 'gGdemoTom000000000000000uid2', fName: 'Tom', lName: 'Whitfield', city: 'Bristol', since: 'April 2020' },
  { uid: 'gGdemoAisha0000000000000uid3', fName: 'Aisha', lName: 'Rahman', city: 'Manchester', since: 'May 2020' },
  { uid: 'gGdemoCallum000000000000uid4', fName: 'Callum', lName: 'Fraser', city: 'Edinburgh', since: 'May 2020' },
  { uid: 'gGdemoGrace0000000000000uid5', fName: 'Grace', lName: 'Okafor', city: 'London', since: 'May 2020' },
  { uid: 'gGdemoDan000000000000000uid6', fName: 'Dan', lName: 'Morley', city: 'Leeds', since: 'June 2020' },
  { uid: 'gGdemoMaya00000000000000uid8', fName: 'Maya', lName: 'Collins', city: 'London', since: 'June 2020' },
  { uid: ADMIN_UID, fName: 'Robin', lName: 'Hale', city: 'London', since: 'April 2020' },
];

const [TOM, AISHA, CALLUM, GRACE, DAN, MAYA] = PEOPLE.map((p) => p.uid) as [string, string, string, string, string, string];

export const emailFor = (p: { fName: string; lName: string }): string =>
  `${p.fName}.${p.lName}`.toLowerCase() + '@example.com';

/** The sign-ins offered in place of Google, Facebook and email/password. */
export const ACCOUNTS: Account[] = [
  { uid: MAYA, email: 'maya.collins@example.com', label: 'Maya Collins', blurb: 'Buyer in London. Nothing listed yet.' },
  { uid: TOM, email: 'tom.whitfield@example.com', label: 'Tom Whitfield', blurb: 'Seller in Bristol with listings in every state.' },
  { uid: ADMIN_UID, email: 'robin.hale@example.com', label: 'Robin Hale', blurb: 'Admin. Reviews new listings before they go live.' },
  { uid: VISITOR_UID, email: 'you@example.com', label: 'New account', blurb: 'Not registered yet. Starts at sign-up.' },
];

type Row = [art: string, name: string, price: number, owner: string, status: ProductStatus, stock: number, desc: string];

// Oldest first. Keys are push ids minted from 2020 timestamps, so anything a
// visitor lists sorts after all of these.
const ROWS: Row[] = [
  ['helmet', 'Bike helmet, medium', 15, TOM, 'sold', 1, 'Yellow commuter helmet, 54 to 58 cm. Never dropped. Selling because I bought a second one by mistake.'],
  ['books', 'Box of paperbacks', 12, CALLUM, 'on-sale', 1, 'Around twenty paperbacks, mostly crime and a few classics. Spines creased, all pages present. One price for the lot.'],
  ['armchair', 'Mid-century armchair', 140, GRACE, 'on-sale', 1, 'Green wool armchair on beech legs. Reupholstered two years ago, very comfortable. Collection only, ground floor.'],
  ['tent', 'Two-person tent', 45, TOM, 'on-sale', 1, 'Lightweight two-person tent, used for four trips. All pegs and guy lines included, packs down to the size of a loaf.'],
  ['keyboard', 'Mechanical keyboard', 60, AISHA, 'on-sale', 1, 'Compact mechanical keyboard with tactile switches and a detachable cable. A couple of keycaps swapped for red ones.'],
  ['moka', 'Stovetop espresso maker', 10, DAN, 'on-sale', 2, 'Three-cup aluminium moka pot. New seal fitted last month. I have two, both the same.'],
  ['guitar', 'Acoustic guitar', 120, CALLUM, 'on-sale', 1, 'Full-size dreadnought with a solid top. Plays well up the neck, new strings last week. Soft case included.'],
  ['lamp', 'Desk lamp', 18, GRACE, 'on-sale', 1, 'Adjustable desk lamp in red enamel. Takes a standard screw bulb, which I will leave in.'],
  ['football', 'Match football, size 5', 9, TOM, 'off-sale', 1, 'Size 5 ball, holds air fine. Taken off sale while I check whether my nephew wants it.'],
  ['headphones', 'Over-ear headphones', 70, AISHA, 'on-sale', 1, 'Closed-back over-ear headphones. Pads replaced this year, cable is the original. Great for the office.'],
  ['trainers', 'Running trainers, size 9', 40, DAN, 'on-sale', 1, 'UK size 9 road shoes, about 60 miles on them. Too narrow for me, otherwise as new.'],
  ['turntable', 'Record player', 85, CALLUM, 'on-sale', 1, 'Belt-drive turntable in a walnut finish. New belt and stylus, plays 33 and 45. Dust cover has a small crack.'],
  ['plant', 'Monstera plant', 22, GRACE, 'on-sale', 3, 'Monstera cuttings I have grown on, each about 40 cm tall in a terracotta pot. Three available.'],
  ['bike', 'Vintage road bike', 180, TOM, 'on-sale', 1, 'Steel road bike, 56 cm frame, ten gears. Recently serviced with new tyres and brake cables. Rides beautifully.'],
  ['camera', '35mm film camera', 95, AISHA, 'on-sale', 1, 'Manual 35mm SLR with a 50mm lens. Light meter works, shutter speeds sound right. Tested with one roll last month.'],
  ['sunglasses', 'Sunglasses', 5, DAN, 'rejected', 1, 'Found on a train.'],
  ['watch', 'Wristwatch, leather strap', 55, DAN, 'on-sale', 1, 'Hand-wound watch on a brown leather strap. Keeps good time, gains about a minute a week.'],
  ['mirror', 'Round wall mirror', 28, GRACE, 'on-sale', 1, 'Round mirror in an oak frame, 60 cm across, with its leather hanging strap. No chips or marks.'],
  ['skateboard', 'Skateboard, barely used', 30, TOM, 'on-sale', 1, 'Complete board, 8 inch deck. Ridden a handful of times before I admitted defeat. Grip tape like new.'],
  ['speaker', 'Bookshelf speakers, pair', 65, CALLUM, 'on-sale', 1, 'Pair of two-way bookshelf speakers in a dark wood veneer. No amp included. Grilles are long gone.'],
  ['controller', 'Wireless game controller', 25, AISHA, 'on-sale', 1, 'White wireless controller, no stick drift. Comes with a charging cable.'],
  ['typewriter', 'Portable typewriter', 75, DAN, 'on-sale', 1, 'Blue portable typewriter in its carry case. All keys strike cleanly, ribbon has plenty of life left.'],
  ['backpack', 'Hiking backpack, 40 litres', 35, TOM, 'on-sale', 1, 'Forty litre pack with a rain cover and hip belt. One small repair on a side pocket, done properly.'],
  ['kettle', 'Electric kettle', 8, DAN, 'pending', 1, 'Cream 1.7 litre kettle. Descaled and working. Moving house, so it has to go.'],
  ['surfboard', 'Surfboard, 7 ft', 110, TOM, 'pending', 1, 'Seven foot mini-mal, good beginner board. A couple of pressure dings on the deck, no open damage. Fins included.'],
];

const T0 = Date.UTC(2020, 4, 16, 9, 30); // the week the first listings went in
const DAY = 86_400_000;

export function buildSeed(): Database {
  const rand = prng(20200516);
  const users: Record<string, User> = {};
  PEOPLE.forEach((p, i) => {
    const key = pushId(T0 - (PEOPLE.length - i) * DAY, rand);
    users[key] = {
      fName: p.fName,
      lName: p.lName,
      UID: p.uid,
      email: emailFor(p),
      address: p.city,
      pPic: `/user-img/${key}/${p.fName.toLowerCase()}.png`,
      memberSince: p.since,
    };
  });
  const cityOf = new Map(PEOPLE.map((p) => [p.uid, p.city]));
  const products: Record<string, Product> = {};
  ROWS.forEach(([art, name, price, owner, status, stock, desc], i) => {
    const key = pushId(T0 + i * DAY * 1.3 + Math.floor(rand() * DAY), rand);
    products[key] = {
      id: 999, // the 2020 client sent 999 for every listing; nothing ever read it
      name,
      desc,
      img: `/product-img/${key}/${art}.svg`,
      location: cityOf.get(owner)!,
      stock: String(stock),
      status,
      price: String(price),
      owner,
      holder: owner,
    };
  });
  return { users, products };
}

/** Keys present in the seed, so the page can tell a visitor's listings apart. */
export const SEED_PRODUCT_KEYS: ReadonlySet<string> = new Set(Object.keys(buildSeed().products));
