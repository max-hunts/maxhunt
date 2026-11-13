---
title: Ororo Player
tagline: Taking an abandoned, broken open-source streaming client and rebuilding it into a polished Apple TV app.
category: software
type: tvOS
year: "2026"
role: Maintainer — revival, redesign and engineering
discipline: Native Apple TV / iOS app
skills:
  - Swift
  - UIKit
  - tvOS
  - AVFoundation
  - HLS
  - Core Data
  - Xcode toolchains
  - { name: UI design, kind: biz }
tools: Swift, UIKit, AVKit, Core Data, Xcode
status: Personal build — runs on Apple TV and iPhone
hero: "/images/ororo-hero.jpg"
heroContain: true
featured: false
isNew: true
order: 15
---

[Ororo.tv](https://ororo.tv) streams films and series with subtitles. An
unofficial open-source iOS and tvOS client for it had been written in 2018 and
abandoned in 2019. When I picked it up, it didn't work: it wouldn't build, it
couldn't sign anyone in, and the parts that did run fell over on real hardware.
I took it from there to an app that feels at home on the living-room TV.

## Where it started

- **It didn't build.** Targets were stuck half-way through a Swift 4.2 → 5
  migration, and the navigation library everything depended on no longer
  compiled for tvOS with a current toolchain. I rebuilt it as a modern
  multi-platform `xcframework` and got the workspace building cleanly.
- **It couldn't log in.** The "account" was a placeholder email and password
  hard-coded in the app delegate.
- **Its lists were unstable.** Movie and show IDs came from Swift's `hashValue`,
  which is randomised every launch — so lists could collide and diff into the
  wrong rows.
- **Its cache never stuck.** On Apple TV hardware, the first catalogue save
  never finished: it ran a database fetch for every inserted row, making it
  quadratic. Every relaunch started from an almost-empty cache.
- **Playback was rough.** Titles needed two clicks to play, audio sometimes
  didn't start until you re-selected the track by hand, and subtitles showed raw
  HTML markup.

## What I built

- **A real account flow.** Sign-in that validates against the API, a credential
  store, a Settings screen showing who's signed in, and sign-out that wipes the
  local catalogue.
- **A poster-first tvOS redesign.** Near-black background, a five-column grid
  of 2:3 posters, rounded artwork with a focus lift and shadow, watch-progress
  bars under each poster, full-screen search, and new app icon and top-shelf
  artwork.
- **A playback quality picker.** Streams are a single HLS master playlist, so
  the picker caps AVPlayer's adaptive ladder and lists only the resolutions the
  title actually carries; the choice persists. A resolution badge (gold for 4K)
  appears with the transport bar — detected without stealing remote input,
  because AVKit has no API for it.
- **Browsing that scales.** Sorting by rating, name, year and recently added,
  plus a genre filter, on both Movies and Shows — with a Core Data model
  migration to store the new fields.

## Making it feel native

Big catalogues on a set-top box punish sloppy code. Posters now decode and
downsample off the main thread, remote images are cached with stale responses
dropped, unchanged catalogue rows are skipped on save, the initial list loads
in one pass instead of a diff, and the catalogue saves through a single
pre-fetched lookup. Playback starts on the first click with its audio track
explicitly selected, and subtitles are stripped of markup and entities.

## Credit

Built on [Max Ovtsin's original client](https://github.com/dissimiral/ororo-tv-player)
and his Transitions navigation library (MIT). Unofficial and not affiliated with
Ororo.tv.
