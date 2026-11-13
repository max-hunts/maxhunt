---
title: Polymarket Lab
tagline: A self-hosted strategy lab for prediction markets — live order books, 1.64M labelled markets and a fleet of trading experiments run like science.
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
  - WireGuard
  - { name: Experiment design, kind: biz }
  - { name: Quant research, kind: biz }
  - { name: Risk management, kind: biz }
tools: Python, FastAPI, Postgres, Redis, React, Docker Compose, Polymarket CLOB
status: Research concluded Aug 2026 — archived with full write-up
hero: "/images/pm-ui-hero.png"
heroContain: true
gallery:
  - src: "/images/pm-dash-books.png"
    caption: "The dashboard mid-run: one card per active paper book, ranked by score (real UI, illustrative data)"
  - src: "/images/pm-dash-book.png"
    caption: "A single book's page: equity curve, return projections and trade stats (real UI, illustrative data)"
  - src: "/images/pm-dash-trades.png"
    caption: "Open positions and the trade log, with execution style and fees on every fill (real UI, illustrative data)"
  - src: "/images/pm-dash-experiments.png"
    caption: "The experiments table: every book the lab ran, from launch to retirement (real UI, illustrative data)"
  - src: "/images/pm-ui-architecture.png"
    caption: "The full system on one home server — orders exit through a separate VPN stack, everything else stays local"
  - src: "/images/pm-ui-thesis.png"
    caption: "The thesis: skip the latency race, hold the minutes-to-hours risk that market makers refuse"
  - src: "/images/pm-ui-loop.png"
    caption: "The research loop — every idea is backtested, run on paper against a pre-registered kill bar, then graduated or retired"
  - src: "/images/pm-ui-pilot.png"
    caption: "The $25 live pilot — real orders mirrored into a paper twin to price execution exactly"
  - src: "/images/pm-fill-models.png"
    caption: "Same signals through three fill models — the experiment that showed how much paper P&L hides"
featured: true
isNew: true
order: 12
---

Prediction markets are thin, fast and full of retail flow — the kind of venue
where a careful operator *should* be able to find an edge. I built a
self-hosted lab to hunt for one on **Polymarket**, and ran it like a research
programme: every idea a hypothesis, every hypothesis with a written kill bar.

<a class="landing-cta" href="/polymarket-lab/" target="_blank" rel="noopener noreferrer">Explore the lab's own page <span class="cta-arrow">↗</span></a>

## The platform

A Python pipeline polled the top 500 markets every five minutes and streamed
live order books from Polymarket's CLOB over WebSocket, tracked large-wallet
fills, and stored it all in Postgres — **6.4M market snapshots** and a
ground-truth set of **1.64M resolved markets** for honest backtests. Redis
Streams carried events between workers.

On top ran a fleet of **26 paper-trading books**, many side by side as A/B arms — mean-reversion
fades, favourite carry, whale-copy, news and LLM signals — all from one
container image configured per book. A FastAPI + React dashboard tracked each book's equity, positions and trades
(the dashboard shots here run the real UI on sample data, since the lab's
database is archived offline);
a Telegram bot sent digests, fills and kill-line alerts.

The whole thing ran in Docker Compose on a 4-core LattePanda in a closet, with
nightly encrypted backups. Real orders went out through a separate WireGuard
stack with a kill-switch, so the live path was isolated from everything else.

## The method

Every strategy went through the same loop: a **research spike** backtested on
true-label outcomes; a **paper book** with one variable per A/B arm and a kill
bar written down *before* launch; a **scheduled review** where books were judged
by their own criteria; then **graduate or retire**, with the lesson logged as a
permanent finding. Over eleven weeks that loop launched 26 books, retired them
on evidence, and produced **twelve settled findings**.

The live step was a **$25 pilot**: real orders, each one mirrored into a paper
twin, so the gap between the two books measured the exact cost of touching the
real market.

## What it found

The most valuable result was about measurement itself. Running the same signals
through three fill models at once showed that filling at the snapshot price —
the way most paper-trading setups do — made a losing strategy look like a
winner: **+$54 on paper versus −$58** once each fill walked the real order book.
The live pilot agreed with the honest model. Building that simulator is what
made the difference visible.

The programme's conclusion was that, at retail latency, directional trading on
this venue doesn't clear its costs — but it identified the one opportunity that
does: **market-making for Polymarket's liquidity-rewards pools**, measured at
$6–400 a day on deep, slow markets. The whole answer cost about $40 all-in.

## Why it's here

It's the project that best shows how I work: build the instrumentation first,
decide in advance what would prove me wrong, measure reality rather than the
model, and stop when the evidence says so.
