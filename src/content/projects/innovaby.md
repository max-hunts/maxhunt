---
title: Innovaby
tagline: A smart-crib venture — remote, hands-on baby care for working parents.
category: product
type: HW/SW
year: "2024"
role: Founder
discipline: Hardware + software product
skills:
  - Raspberry Pi
  - Python
  - AWS
  - WebRTC
  - Embedded
  - { name: Product strategy, kind: biz }
  - { name: Market research, kind: biz }
  - { name: GTM strategy, kind: biz }
  - { name: Marketing, kind: biz }
  - { name: Partnerships, kind: biz }
tools: Raspberry Pi CM4, Python, AWS, Telegram, WebRTC
collaborators: []
status: MVP / prototype
hero: "/images/innovaby-sleepsafe.png"
heroContain: true
gallery:
  - src: "/images/innovaby-sleepsafe.png"
    caption: "SleepSafe — the smart-crib feature set"
  - src: "/images/innovaby-system.png"
    caption: "System architecture — Pi-powered crib, AWS coordinator, parent + nanny clients"
featured: true
isNew: true
order: 20
---

Innovaby is a venture exploring **connected baby care**. Its flagship concept,
**SleepSafe**, is a smart crib that lets a parent watch, talk to and even soothe
their child from anywhere — turning a passive baby monitor into something that
can actually act.

## The product

A crib built around a **Raspberry Pi CM4** with camera, microphone, speaker, a
gentle rocking mechanism and a motorised shutter — all babyproofed and
battery-backed. The Pi runs an on-device control loop (`bed_os`) that bridges to
the firmware, captures audio/video, and can rock, soothe or shade on command.

## How it connects

An **AWS server** coordinates devices, stores the AV feed and handles face
recognition. Parents stay in the loop through tools they already have — a
**Telegram bot** for alerts and commands, and **Google Meet** for live two-way
video — while a **nanny station** in the nursery gets the full feed and controls.

## My role

Founder — product concept, the hardware proposal, and the software architecture
spanning the embedded bed firmware, the cloud coordinator, and the parent and
nanny clients. Built to MVP / prototype stage.
