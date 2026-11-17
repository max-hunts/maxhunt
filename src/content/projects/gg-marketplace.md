---
title: GG Marketplace
tagline: A 2020 peer-to-peer marketplace prototype, rebuilt as a demo where you play the buyer, the seller and the admin.
category: software
type: WEB
year: "2020"
role: Solo. The prototype in 2020, the demo rebuild in 2026
discipline: Web engineering and product design
skills:
  - Node.js
  - Express
  - EJS
  - Firebase Auth
  - Realtime Database
  - Cloud Functions
  - React
  - TypeScript
  - Vite
  - SVG illustration
  - { name: Product design, kind: biz }
  - { name: Interaction design, kind: biz }
  - { name: Trust and moderation, kind: biz }
tools: Express, EJS, Firebase (Auth, Realtime Database, Storage, Functions), nodemailer, React, TypeScript, Vite
status: Prototype built in 2020. Rebuilt in 2026 as a client-side concept demo
hero: "/images/gg-home.png"
heroContain: true
gallery:
  - src: "/images/gg-before-home.png"
    caption: "2020: the original home page. Untouched templates and CSS, with the logo and banner still placeholders (rendered here with the demo's seed listings)"
  - src: "/images/gg-request.png"
    caption: "2026: a listing. Request to buy opens a message box, prefilled with the same line the 2020 app used"
  - src: "/images/gg-before-my-product.png"
    caption: "2020: managing your own listing. Edit, Take Off Sale and Mark Sold, one color each"
  - src: "/images/gg-manage.png"
    caption: "2026: the same three actions, with the listing's status explained in a sentence"
  - src: "/images/gg-before-add-item.png"
    caption: "2020: the add-product form and its drop zone"
  - src: "/images/gg-sell.png"
    caption: "2026: the sell form. Same fields, same drop zone rules, plus sample photos for visitors with nothing to upload"
  - src: "/images/gg-admin.png"
    caption: "The review queue. Nothing reaches the home page or search until the admin approves it"
  - src: "/images/gg-inbox.png"
    caption: "The seller's inbox. In 2020 this was a real email through Gmail; the demo delivers the same text to an in-page inbox"
  - src: "/images/gg-listings.png"
    caption: "Your listings, filtered by status: on sale, in review, off sale, sold"
featured: true
isNew: true
order: 16
---

GG was a peer-to-peer marketplace I prototyped in 2020: sign in, list
something you want to sell, and wait for a buyer to ask for it. It had one
firm opinion: **every listing is reviewed by a person before anyone else can
see it.**

The backend covered the whole flow. The front end never got past placeholders:
the logo was a grey box that said "Co. LOGO". In 2026 I rebuilt it as a demo
that runs entirely in your browser, with the 2020 server ported so you can
play every role yourself.

<div class="cta-row">
<a class="landing-cta" href="/gg-demo/" target="_blank" rel="noopener noreferrer">Try the GG Marketplace demo <span class="cta-arrow">↗</span></a>
<a class="landing-cta secondary" href="https://github.com/max-hunts/gg-marketplace" target="_blank" rel="noopener noreferrer">Original 2020 source <span class="cta-arrow">↗</span></a>
</div>

## What it was in 2020

- **A server-rendered app.** Express and EJS templates: ten pages and
  eleven JSON endpoints in one file, deployed as a Firebase Cloud Function
  behind Firebase Hosting, with a Dockerfile for running it standalone.
- **Firebase for everything stateful.** Auth for sign-in (Google, Facebook or
  a password), Realtime Database for users and listings, Storage for photos.
- **A listing lifecycle.** New listings start as `pending`. One admin account
  approves or rejects them. After that the seller can take a listing off
  sale, put it back, or mark it sold.
- **No checkout, on purpose.** "Request!" sent the seller an email with the
  buyer's message and address, through nodemailer and a Gmail account. The
  two of them arranged the rest.

Search downloaded every listing on sale and matched your words against names
and descriptions in Node. The cart and notification counters in the header
were hard-coded to zero. It was a prototype and it looks like one.

## What the rebuild shows

- **The whole loop, played by one person.** Sign in as Tom and list an item.
  Switch to the admin and approve it. Switch to Maya, find it in search and
  request it. Switch back to Tom and read the email. A bar along the bottom
  of the demo walks you through the four steps and knows which one you are
  on.
- **The 2020 server, running in the page.** The eleven endpoints and the page
  routes are ported to TypeScript with the same request shapes, response
  envelopes and error strings. Firebase is replaced by a small local store
  that mints Firebase-style push ids, and the email goes to an inbox you can
  open instead of to Gmail.
- **An interface it never had.** A real brand, a home page, status you can
  read at a glance, filters and sorting, a seller dashboard, an admin queue,
  and a layout that works on a phone.
- **A before and after you can trust.** The 2020 screenshots on this page are
  not mockups. They are the original templates, CSS and client scripts,
  untouched, rendered from the ported server's output with Firebase stubbed
  out. The data shapes line up, which is the point of the port.

## How it's built

**The backend.** One class holds the routes. Reads are the old page routes
(`home`, `search`, `product`, `my-products`, `admin-review` and so on) and
return exactly what the EJS templates were given. Writes are the old POST
endpoints and answer `{ success, error }` the way they always did. It has no
dependency on the browser, so the same code runs under 19 tests in Node.

**Accounts.** There is no login to fake. The demo offers four accounts (a
buyer, a seller, the admin and one that has not registered yet) and a token
that names which one you are. The unregistered account is sent to sign-up
before it can do anything, the same rule the 2020 client enforced.

**Listings and pictures.** The original listings and photos lived in Firebase
and are gone, so the demo opens on 25 made-up listings from five made-up
sellers, in every state of the lifecycle. Each has an illustration written as
SVG: no stock photos, no licenses, and 24 KB of markup for all 28 pictures.
Photos you upload are shrunk in a canvas and kept in your browser.

**Persistence.** The store, the outbox and your uploads are saved to
`localStorage`. Reload and your listings are still there. Reset puts
everything back.

The whole demo is about 140 KB over the wire, font included.

## What the old server taught me

Porting six-year-old code means reading all of it, and two endpoints did not
survive the reading.

`new-product-api` took the listing's `owner` from the request body. The
browser said who the seller was and the server believed it.

`update-product-api` wrote whatever fields the browser sent. The edit form
only sent five, but nothing stopped a seller from adding
`status: "on-sale"` and approving their own listing, which was the one thing
the product existed to prevent.

The port takes the owner from the token and writes only the five editable
fields, and there is a test for each. Everything else is kept as it was,
including behavior I would not choose today: requesting an item never reduces
its stock, and the admin is a single hard-coded account.

## What is real and what is not

Real: the 2020 API contract, the listing lifecycle, the email templates word
for word, and the 2020 interface in the before shots. Made up: every person,
listing and picture. Nothing in the demo talks to a server, sends an email or
leaves your browser.
