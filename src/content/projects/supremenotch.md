---
title: SupremeNotch
tagline: A native macOS app that turns the MacBook notch into a status bar, an AI-agent console and a scratch space.
category: software
type: macOS
year: "2026"
role: Maintainer / sole developer
discipline: Native macOS app
skills:
  - Swift
  - SwiftUI
  - AppKit
  - Rust
  - macOS internals
  - Claude Code hooks
  - Codex
  - { name: Product design, kind: biz }
  - { name: Interaction design, kind: biz }
tools: Swift, SwiftUI, AppKit, Rust, Xcode, notarytool
status: Shipping — signed & notarized, open source (MIT)
hero: "/images/supremenotch-opened-notch.png"
heroContain: true
gallery:
  - src: "/images/supremenotch-closed-notch.png"
    caption: "Closed notch — AI usage bars on the left, status ring on the right, mic-muted state"
  - src: "/images/supremenotch-status-ring.png"
    caption: "One glyph, three readings: battery arc, network centre, volume dots"
  - src: "/images/supremenotch-notice-approval.png"
    caption: "Approve or deny an agent's tool request without leaving what you're doing"
  - src: "/images/supremenotch-tab-usage.png"
    caption: "Usage tab — Claude and Codex limits with reset times"
  - src: "/images/supremenotch-usage-reset-styles.png"
    caption: "Pace tick vs. time rail: two ways to show how far a limit's window has run"
  - src: "/images/supremenotch-tab-ask.png"
    caption: "Ask tab — streaming answers on the ChatGPT subscription, through Codex"
  - src: "/images/supremenotch-tab-ports.png"
    caption: "Ports tab — every local server, with the process and project that owns it"
featured: true
isNew: true
order: 5
---

The MacBook notch is a black rectangle in the most valuable spot on the screen.
**SupremeNotch** puts it to work: a glanceable status bar when it's closed, and a
small control surface when you hover over it — built around how I actually work
now, with several AI coding agents running at once.

## Why

Running Claude Code and Codex sessions in parallel creates a new kind of
background noise: which agent is waiting on me, which one finished, how much of
my usage limit is left before it resets. That information was scattered across
terminals, apps and web dashboards. I wanted it in one place I'd see without
looking for it.

## What it does

- **Agent console.** Small hooks installed into Claude Code, Codex and Cursor
  stream their events into the notch. Approve or deny a tool request from the
  notch, see questions and finished-turn summaries, and jump straight to the
  exact session in the Claude app.
- **Usage bars.** One short bar per subscription limit (Claude's 5-hour, weekly
  and per-model limits; Codex's weekly and 5-hour) sits beside the camera. The
  colour warms as you use it, and a white **pace tick** marks where you'd be if
  you spread the limit evenly until it resets — so "am I burning this too fast?"
  is answerable at a glance.
- **A status ring.** One glyph shows three things: the outer arc is battery
  (with charging, Low Power Mode and macOS's charge-hold states), the centre is
  the network, and four dots are output volume.
- **Tabs when opened.** Agents, Usage, Ask (quick questions to ChatGPT on the
  subscription, with dictation), Ports, System, a file Shelf, a Note and audio
  Output.
- **Glances.** Meeting reminders with a Join button, network changes, AirPods
  battery, finished downloads, Focus, brightness and volume.

## How it's built

A native Swift / SwiftUI app with AppKit underneath for the overlay windows,
private-framework Now Playing access and system monitoring. The usage data
comes from a small **Rust** tool I wrote first as a standalone terminal app
(`claude-usage-monitor`), now bundled inside the app and called as a helper,
with credentials stored in the Keychain.

A lot of the work is pixel-level: every glyph sits exactly as far from the
camera as from the notch's edge, the island resizes symmetrically when you
swipe between tabs, and alerts grow out of the wing they belong to. To keep
that honest I added a **layout check** that renders sample alerts in the real
island and fails if buttons drift from their 12 pt insets or the island's
edges move unevenly while resizing. The README's screenshots are drawn by the
app's own views with sample data, so they never go stale.

Everything runs locally — no analytics, no telemetry. The release pipeline
builds, bundles the Rust helper, signs with a Developer ID and notarizes with
Apple.

## Credit where it's due

SupremeNotch started as a fork of the open-source
[Notchly](https://github.com/Notchly/Notchly) (MIT). Nearly every original file
has since been reworked, and the agent console, usage bars, status ring, Ask
tab, layout checks and release tooling are new — well over 13,000 lines of Swift
on top of the original. It was called BetterNotch until 3.0.

<a class="landing-cta" href="https://github.com/max-hunts/supreme-notch" target="_blank" rel="noopener noreferrer">View SupremeNotch on GitHub <span class="cta-arrow">↗</span></a>
