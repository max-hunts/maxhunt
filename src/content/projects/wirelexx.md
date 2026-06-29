---
title: WIRELEXX
tagline: Building a Bluetooth AUX adaptor with remote support.
category: engineering
type: HW
year: "2016"
role: Solo build
discipline: Embedded hardware
skills: ["Embedded", "Arduino", "Bluetooth audio", "Soldering"]
tools: Arduino, Bluetooth module
hero: /images/wx-1.jpg
heroLight: true
gallery:
  - { src: /images/wx-2.jpg }
  - { src: /images/wx-3.jpg }
  - { src: /images/mk-1.jpg }
  - { src: /images/mk-2.jpg }
  - { src: /images/mk-3.jpg }
order: 80
---

## Overview

In summer 2016, following rumours of an iPhone without an audio jack, I built a
prototype dongle. Simple audio transmission wouldn't suffice — it also had to
integrate in-line remote control and microphone functionality, as those features
now ship with most headphones.

I implemented remote detection with an Arduino controller that monitored button
presses and microphone activation. To keep it simple to use, the AUX port doubled
as the power switch: it turned on once headphones were inserted.
