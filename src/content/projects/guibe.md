---
title: GUIBE
tagline: Helping visually impaired users be self-reliant when navigating cities.
category: engineering
type: WEARABLE
year: "2019"
role: CTO (group project)
discipline: Wearable hardware + iOS
skills: ["PCB design", "Bluetooth LE", "Swift / iOS", "Wearables", "CAD", "Haptics"]
tools: Custom PCB, Bluetooth, Swift/iOS
collaborators: ["Angela Ibanez", "Mia Taicher", "Elvire Coudray"]
hero: /images/subtext.jpg
sequence:
  dir: /guibe-sq
  count: 200
  pad: 4
  ext: jpg
gallery:
  - { src: /images/ren-casing.jpg }
  - { src: /images/AppSC.jpg }
  - { src: /images/Circuit.jpg }
  - { src: /images/pcb.jpg }
  - { src: /images/ren-comp.jpg }
  - { src: /images/xcode.jpg }
  - { src: /images/sketch.jpg }
featured: true
order: 35
---

## Overview

As my main second-year project I developed a wearable device that uses haptics
to guide a visually impaired user through a city environment. It was a group
project — I took the CTO role, responsible for the electronics back-end, circuit
design, and the iOS app that interfaced with the bracelet.

## Research

For three months we researched and conducted interviews. We discovered that the
most dangerous part of a user's day was the journey itself — particularly when
navigating alone. To address this we eliminated voice instructions entirely and
used discreet haptics to send turn-by-turn directions to the user's wrist.

## The build

The bracelet interfaced with an iPhone app — we chose Apple because it offers far
more accessibility features than any other platform, and the visually impaired
market predominantly uses Apple products. To bypass the need for MFi
certification, I designed a custom circuit that amplifies analogue sound signals,
then connected a small Bluetooth receiver to the phone just like a pair of
headphones.
