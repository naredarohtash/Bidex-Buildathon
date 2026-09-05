# Bidex

A binary options trading platform: a live charting terminal, an order and
settlement engine, wallets and payments, KYC, an affiliate system and an admin
back office.

This repository is a **review copy**, prepared for buildathon evaluation.

---

## Licence and terms of access

**This is not open source.** See [LICENSE.md](LICENSE.md) for the full text.

In short, and it is the part worth reading:

- Access is granted **for evaluation only** — to read the code in order to
  judge it, and for nothing else.
- No permission is given to use, copy, modify, redistribute, deploy, or build
  on any part of it, in original or modified form.
- No permission is given to use it as training data for, or input to, any
  machine-learning system.
- Any copy made in the course of review — a `git clone`, a downloaded archive —
  should be deleted once the review concludes.
- Opening an issue or a pull request grants the submitter no rights in the
  software.

© 2026 Rohtash Nareda. All rights reserved.

---

## What this copy is, and is not

It is a snapshot of the working tree at a point in time, committed once. It
carries no development history, no deployment or operations documentation, no
database dumps or exports, and no credentials of any kind — `.env` is not
present and never was in version control. `.env.example` lists the shape of the
configuration without any values.

It is therefore readable but not directly runnable: bringing it up requires
configuration that is deliberately not in this repository.

---

## Stack

| | |
|---|---|
| Frontend | Next.js (App Router), React, TypeScript, Tailwind CSS |
| i18n | `next-intl`, locale-routed under `app/[locale]/` |
| State | Zustand |
| Backend | TypeScript, Sequelize, MySQL, Redis |
| Realtime | WebSocket services for market data, orders and support |
| Charting | An in-house engine under `frontend/components/(ext)/chart-engine` |

## Where to look

```
frontend/app/[locale]/terminal/     the trading terminal — chart, order panel,
                                    positions, analytics, journal, support desk
frontend/app/[locale]/(dashboard)/  user account and the admin back office
frontend/components/                shared UI
backend/api/                        route handlers, one file per endpoint
backend/models/                     Sequelize models
backend/api/(ext)/                  extensions, including the payment gateway
```

Two areas are worth the time if you are reading selectively:

1. **The terminal** (`frontend/app/[locale]/terminal/`) — the chart, the order
   flow, and the panels around them. The code is commented at length, and the
   comments explain *why* a thing is the way it is rather than what it does.
2. **The payment gateway extension** (`backend/api/(ext)/gateway/`) — merchant
   registration, API key issuance and verification, payment intents, refunds,
   payouts, fee handling and signed webhooks.

## A note on the comments

The source is unusually heavily commented, and deliberately so: nearly every
non-obvious decision carries the reasoning behind it, including the approaches
that were tried and rejected. If you want to understand a choice, the answer is
almost always directly above it.
