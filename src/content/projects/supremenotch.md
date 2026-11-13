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
hero: "/images/supremenotch-hero.png"
heroContain: true
gallery:
  - src: "/images/supremenotch-closed.png"
    caption: "Closed — usage bars on the left, status ring on the right, muted mic beside the camera"
  - src: "/images/supremenotch-alerts.png"
    caption: "Agent alerts — approve a tool call, answer a question or jump back into a finished session"
  - src: "/images/supremenotch-ring.png"
    caption: "One glyph, three readings: battery arc, network centre, volume dots"
  - src: "/images/supremenotch-tabs.png"
    caption: "Opened tabs — Usage, System, Ports and the file Shelf"
  - src: "/images/supremenotch-ask.png"
    caption: "Ask — streaming answers on the ChatGPT subscription, through Codex, with dictation"
  - src: "/images/supremenotch-usage.png"
    caption: "Usage bar styles — pace tick or time rail, colour hangs or grey rises"
featured: true
isNew: true
order: 5
---

The MacBook notch is a black rectangle in the most valuable spot on the screen.
SupremeNotch puts it to work: a glanceable status bar when it's closed, and a
small control surface when you hover over it — built around working with
several AI coding agents at once.

## Why

Running Claude Code and Codex sessions in parallel creates a new kind of
background noise. Which agent is waiting on me? Which one finished? How much of
my usage limit is left before it resets? That lived across terminals, apps and
dashboards. I wanted it somewhere I'd see without looking.

## What it does

- **Agent console** — approve or deny tool requests, answer questions and reopen
  finished sessions, straight from the notch. Works with Claude Code, Codex and
  Cursor.
- **Usage bars** — one bar per Claude and Codex limit beside the camera, warming
  in colour as you use it, with a pace tick showing whether you're ahead of an
  even spend until reset.
- **Status ring** — battery, network and volume in a single glyph.
- **Tabs** — Agents, Usage, Ask, Ports, System, Shelf, Note and audio Output.
- **Glances** — meeting reminders with a Join button, network changes, AirPods
  battery, downloads, Focus, brightness and volume.

## How it's built

Native Swift and SwiftUI, with AppKit underneath for the overlay windows, Now
Playing access and system monitoring. Usage data comes from a small **Rust**
helper I first wrote as a standalone terminal app, now bundled inside the app,
with credentials in the Keychain.

Much of the work is pixel-level. Glyphs sit exactly as far from the camera as
from the notch's edge, the island resizes symmetrically between tabs, and
alerts grow from the wing they belong to. A **layout check** renders sample
alerts in the real island and fails if the spacing drifts — and the
screenshots here are drawn by the app's own views, so they never go stale.

Everything runs locally, with no telemetry. Releases are built, signed with a
Developer ID and notarized by a single script.

## Credit where it's due

SupremeNotch began as a fork of the open-source
[Notchly](https://github.com/Notchly/Notchly) (MIT). Nearly every original file
has since been reworked, and the agent console, usage bars, status ring, Ask
tab, layout checks and release tooling are new — well over 13,000 lines of
Swift on top of the original.

<a class="landing-cta" href="https://github.com/max-hunts/supreme-notch" target="_blank" rel="noopener noreferrer">View SupremeNotch on GitHub <span class="cta-arrow">↗</span></a>
