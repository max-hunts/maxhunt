---
title: Polymarket Lab
tagline: An 11-week trading-research lab that set out to find an edge on Polymarket — and proved, honestly, that there isn't one.
category: software
type: DATA
year: "2026"
role: Solo — research, engineering, operations
discipline: Data engineering & quantitative research
skills:
  - Python
  - FastAPI
  - PostgreSQL
  - Redis Streams
  - WebSockets
  - React
  - Docker
  - { name: Experiment design, kind: biz }
  - { name: Quant research, kind: biz }
  - { name: Risk management, kind: biz }
tools: Python, FastAPI, Postgres, Redis, React, Docker Compose, Polymarket CLOB
status: Concluded Aug 2026 — archived with full post-mortem
hero: "/images/pm-hero.png"
heroContain: true
gallery:
  - src: "/images/pm-system.png"
    caption: "The system — ingest, ground-truth store, a fleet of paper books and a small live path, all on one 4-core board"
  - src: "/images/pm-findings.png"
    caption: "Twelve settled findings, each closing a strategy family — and the one positive result"
featured: true
isNew: true
order: 12
---

Prediction markets look like they should be beatable: thin books, retail flow,
news that moves prices faster than people update. I built a self-hosted lab to
find out whether a small, careful operator could take money out of
**Polymarket** — and ran it like an experiment rather than a bet.

## The setup

A pipeline polled the top 500 markets every five minutes and streamed live order
books over WebSocket, building **6.4M market snapshots** and a ground-truth set
of **1.64M resolved markets** for backtesting. On top of that ran a fleet of
roughly **20 parallel paper-trading books** — mean-reversion, favourites, whale
copying, news signals, LLM calls — each with **kill criteria written down before
it started**, and reviewed on a schedule. Books that crossed their line were
retired and the lesson logged. Two small **real-money pilots** ($25 in a
disposable wallet) measured how paper fills compared with reality.

Everything ran in Docker Compose on a 4-core LattePanda in a closet, with a
React dashboard and a Telegram bot for alerts and kill-line pages.

## The finding that ended it

The decisive experiment ran the *same signals* on the *same 15 markets* through
three fill models at once. The legacy model — fill at the snapshot price — made
**+$54 with an 89.6% win rate**. The honest model, which walks the real order
book to price each fill, lost **−$58 at 7.7%**. Real money agreed with the
honest model: one resting bid filled at 0.77 and the market printed 0.34 sixteen
seconds later.

The legacy model triggered and filled at the same stale price, so every
take-profit "won" by construction. A book that once showed **+$6,000** of paper
profit had been measuring its own fiction. Building the honest simulator is what
made that visible.

## What it settled

Twelve findings, each closing a family of ideas: news and social signals lost
~40% in three weeks; LLM directional calls were *anti*-predictive; copying
"smart" wallets was negative at every quality gate; backtests that used price
proxies instead of true outcomes were inflated by survivorship; sub-day crypto
markets were efficient in both directions. The terminal conclusion: **at retail
latency and small capital, there is no harvestable directional edge on this
venue.**

The one positive result — Polymarket's liquidity-rewards pool, which pays
market-makers on deep, slow markets — was measured, written up, and deliberately
left unbuilt as a separate decision.

## Why it's here

Total cost of the answer: about **$14.50** in trading losses, **$25** of API
spend and eleven weeks. The negative result is the product. It's the project I'm
proudest of for its discipline: pre-registered kill lines, honest measurement,
and the willingness to shut it down when the evidence said so — including
finding and documenting the live-execution bugs (cancel-race fills, a one-way
reconcile) along the way.
