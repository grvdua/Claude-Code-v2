# RestaurantOS

A role-gated restaurant operations platform built with Next.js 14, TypeScript, Tailwind CSS and Zustand.

Runs entirely in the browser — state is persisted to `localStorage`, so it deploys to Vercel with zero backend configuration.

## Roles

- **Owner** — daily brief, PO approvals (above ₹10,000), low-stock alerts, document expiry tracking
- **Restaurant Manager** — daily expense log, staff attendance
- **Head Chef** — daily journal (prep / batch / marination), wastage log, raw material requests
- **Store Manager** — multi-location inventory, RFQ → quote → PO → GRN procurement flow

## Quickstart

```bash
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm start            # serve production build
npm run typecheck    # tsc --noEmit
```

## Deploy

Push to a GitHub repo, import into Vercel, accept defaults — the included `vercel.json` sets the framework to Next.js. No environment variables required.

## Architecture

- `app/` — Next.js App Router pages (one per role + cross-cutting modules)
- `components/` — shared UI (Nav, Sidebar, KpiCard, StatusBadge)
- `lib/store.ts` — Zustand store with `persist` middleware
- `lib/seed.ts` — demo data (Indian restaurant context, ₹ pricing)
- `lib/types.ts` — TypeScript domain types

## Demo data

Pre-populated on first load with ~15 inventory items across 3 locations, 4 vendors, sample requests / quotes / POs in various stages, journal entries, documents (FSSAI license, fire NOC, rent agreement, invoice) and 5 staff members. Reset by clearing the `restaurant-os-store` key from `localStorage`.
