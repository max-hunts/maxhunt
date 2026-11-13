---
title: Ororo Player
tagline: Reviving an abandoned open-source streaming client as a proper Apple TV app.
category: software
type: tvOS
year: "2026"
role: Maintainer — revival, redesign and new features
discipline: Native Apple TV / iOS app
skills:
  - Swift
  - UIKit
  - tvOS
  - AVFoundation
  - HLS
  - Core Data
  - { name: UI design, kind: biz }
tools: Swift, UIKit, AVKit, Core Data, Xcode
status: Personal build — not on the App Store
hero: "/images/ororo-hero.jpg"
heroContain: true
featured: false
isNew: true
order: 15
---

[Ororo.tv](https://ororo.tv) is a streaming service for films and series with
subtitles. An unofficial open-source iOS and tvOS client for it existed — written
in 2018 by Max Ovtsin and untouched since 2019 — so I picked it up and turned it
into something I'd actually want to use on the big screen.

## What I changed

- **A poster-first tvOS redesign.** Near-black background, a five-column grid of
  2:3 posters, rounded artwork with a focus lift and shadow, and a watch-progress
  bar under each poster. New app icon and top-shelf artwork.
- **Real account handling.** The original had credentials hard-coded in source;
  I added a sign-in flow that validates against the API, a credential store, and
  a Settings screen to see who's signed in and sign out.
- **A playback quality picker.** Streams are a single HLS master playlist, so
  the picker caps AVPlayer's adaptive ladder and lists only the resolutions the
  title actually carries. A badge shows the playing variant (gold for 4K) while
  the transport bar is up — detected without consuming remote input, since AVKit
  exposes no API for it.
- **Browsing.** Sorting (rating, name, year, recently added) and a genre filter
  on both the Movies and Shows tabs, backed by a Core Data model migration.

## Making it feel fast

Most of the work was making it behave on real Apple TV hardware. The first
full-catalogue save was quadratic — a fetch per inserted row — so on device it
never finished before the app was quit, and every relaunch started from an
almost-empty cache. Replacing it with a single pre-fetched lookup fixed it.
Posters now decode and downsample off the main thread, remote images are
cached with stale responses dropped, unchanged catalogue rows are skipped on
save, and playback starts on the first tap with its audio track explicitly
selected (it sometimes started silent).

## Credit

Built on [Max Ovtsin's original client](https://github.com/dissimiral/ororo-tv-player)
and his Transitions navigation library (MIT). Unofficial and not affiliated with
Ororo.tv.
