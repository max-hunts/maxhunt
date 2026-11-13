---
title: PolyPaint
tagline: A million-pixel canvas where every pixel is an NFT, rebuilt as a demo that runs the original 2022 contract inside your browser.
category: software
type: WEB3
year: "2022"
role: Solo. Contract, server and client in 2022, the demo rebuild in 2026
discipline: Smart contracts and web engineering
skills:
  - Solidity
  - ERC-721
  - OpenZeppelin
  - Truffle
  - Node.js
  - Firebase
  - React
  - TypeScript
  - viem
  - Canvas 2D
  - In-browser EVM
  - Web Workers
  - { name: Product design, kind: biz }
  - { name: Interaction design, kind: biz }
  - { name: Pricing, kind: biz }
tools: Solidity, Truffle, web3.js, Express, Firebase, React, viem, ethereumjs EVM, Vite
status: Built on Polygon in 2022. Rebuilt in 2026 as a client-side concept demo
hero: "/images/polypaint-hero.png"
heroContain: true
gallery:
  - src: "/images/polypaint-overview.png"
    caption: "The whole canvas. About 76,000 seeded pixels, every one minted through the real contract at build time (simulated chain, art seeded by me)"
  - src: "/images/polypaint-hover.png"
    caption: "Past 8x the pixel grid fades in, and the hover card shows each pixel's owner, color and link"
  - src: "/images/polypaint-stamp.png"
    caption: "Image stamp: drop a picture, it is resized and quantized, then dragged into place as a ghost before it joins the draft"
  - src: "/images/polypaint-confirm.png"
    caption: "The Demo Wallet decodes the call, simulates it against the contract and shows value and gas before you confirm"
  - src: "/images/polypaint-revert.png"
    caption: "Sending pixels someone already owns: the transaction is mined and reverts with the contract's own message"
  - src: "/images/polypaint-mine.png"
    caption: "My pixels lists every block you own, with jump, recolor and link actions"
featured: true
isNew: true
order: 13
---

PolyPaint was my 2022 take on the million-pixel homepage, moved on chain: a
1,000 by 1,000 canvas on Polygon where **every pixel is its own ERC-721
token**. Buy a pixel, give it a color and a link, recolor it whenever you
like.

The contract worked. The interface never did it justice: you bought pixels by
typing comma-separated ids and hex colors into a form. In 2026 I rebuilt the
front end as a concept demo you can use right now, with nothing to install and
nothing at stake.

<a class="landing-cta" href="/polypaint-demo/" target="_blank" rel="noopener noreferrer">Try the PolyPaint demo <span class="cta-arrow">↗</span></a>

## Why

In early 2022 Polygon made it plausible to mint something as small as a single
pixel, because fees were a small fraction of what Ethereum mainnet charged. I
wanted to learn the whole stack by shipping one small, complete product: a
contract that takes payment, a server that follows the chain, and a client
that talks to a wallet.

## What it was in 2022

- **Pixels.sol.** An OpenZeppelin ERC-721 where the token id is
  `y * 1000 + x`. Minting cost 0.4 MATIC (about a dollar at the time) and
  stored a color and an optional link. Owners could recolor one pixel or a
  batch.
- **A mirror server.** A Node service subscribed to the contract's
  `PixelColourChanged` events, copied them into Firebase, rebuilt a PNG of
  the whole canvas every five seconds and served NFT metadata for
  marketplaces.
- **Converters.** Small JavaScript and Python tools that turned an image into
  the lists of pixel ids and colors the buy form wanted.
- **The client.** A React page that talked to a browser wallet through
  web3.js: a flat image of the canvas and two modals.

I deployed it to Polygon and its Mumbai testnet. It was a learning project and
it stayed one.

## What the rebuild shows

- **The real contract, in your browser.** The demo deploys the original 2022
  bytecode, byte for byte, into an EVM running in a Web Worker. Every buy and
  recolor executes that code. When a pixel is taken, the message you see,
  `Pixel is already owned`, comes from the contract's own `require`.
- **A wallet-agnostic dapp.** The page talks to an EIP-1193 provider through
  viem and to nothing else. Here the provider is a Demo Wallet I wrote: it
  generates throwaway keys, asks for approval, simulates the call and signs
  real EIP-1559 transactions. Point the same code at an injected wallet and a
  live RPC and it would not need to change.
- **A canvas you can paint on.** Zoom and pan a million pixels, paint with a
  brush, rectangle, fill or an image stamp, and see the cost before you buy.
  Large selections are split into transactions that fit a block.
- **A chain with other people on it.** The canvas opens with about 76,000
  pixels of art, all minted through the contract at build time, and simulated
  buyers keep minting small sprites while you watch.

## How it's built

**The chain.** `@ethereumjs/evm` runs the contract inside a worker that loads
after first paint. Around it sits a deliberately small chain: a block every
two seconds, a mempool, nonces, a flat fee market, receipts, logs and the
standard JSON-RPC methods. Transactions arrive signed, the sender is recovered
from the signature, and gas is whatever the EVM says it was: about 79,000
gas per pixel, which is why one transaction holds 250 pixels.

**The seed.** A build script runs the same engine in Node and mints the art
with 477 real `mintMultiple` transactions from ten wallets. The result ships
as flat tables (owner, color and link per pixel) in a 76 KB file. In the
browser the contract's storage for those pixels is answered lazily from the
tables, so about 230,000 storage slots cost one hash index instead of 230,000
map entries. Before the file is written, the script boots a second chain from
it and compares every seeded pixel against the first through the contract's
own getters.

**The canvas.** One `<canvas>`, a 1,000 by 1,000 `ImageData` patched by dirty
rectangle, and a render loop that only runs when something changed. Like the
2022 server, the page learns about new pixels from the contract's events.

**Persistence.** After each block with activity the worker emits a compact
delta of the chain state, which the page keeps in `localStorage`. Reload and
your pixels, balance and block height are still there. Reset clears it.

## What the old contract taught me

Putting a 2022 contract under a test harness in 2026 was humbling.
`changePixelColour` refuses to update a pixel's link when the current link is
`/#`, and the 2022 client sent `/#` whenever the link field was left empty. So
a pixel bought without a link could never get one. The event still fired with
the new link, which means the mirror server would have shown a link the chain
never stored. The demo keeps the bug, because it is the real contract, and its
mirror follows storage instead of the event.

## What is real and what is not

Real: the contract bytecode, the EVM that executes it, the signatures, the gas
numbers and the revert messages. Simulated: the chain around it, the other
buyers and the POL, which is play money. The seeded art is mine. Nothing in
the demo connects to Polygon or any other network.
