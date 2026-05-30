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

Push to a GitHub repo, import into Vercel, accept defaults — the included `vercel.json` sets the framework to Next.js. No environment variables required for the core app; set `ANTHROPIC_API_KEY` in Vercel project settings to enable AI document extraction (see below).

## AI Document Extraction

When a user uploads a document in the vault (PDF or image), the app can call Claude's vision API to pre-fill metadata fields — document name, type, license number, issuing authority, dates, registered entity — which the user can then review and edit before saving.

- Uses Claude Sonnet 4.6 via the Anthropic API, with tool-based structured output for reliable JSON.
- Set `ANTHROPIC_API_KEY` in your Vercel environment variables (or `.env.local` for local dev) to enable. See `.env.example`.
- Without the key, uploads still work — the form just falls back to manual entry.
- Files larger than 4 MB skip AI extraction (Vercel serverless body limit) but are still stored in IndexedDB; you fill the form by hand.
- The full original file is always stored locally in IndexedDB regardless of whether extraction ran.

## Architecture

- `app/` — Next.js App Router pages (one per role + cross-cutting modules)
- `components/` — shared UI (Nav, Sidebar, KpiCard, StatusBadge)
- `lib/store.ts` — Zustand store with `persist` middleware
- `lib/seed.ts` — demo data (Indian restaurant context, ₹ pricing)
- `lib/types.ts` — TypeScript domain types

## Demo data

Pre-populated on first load with ~15 inventory items across 3 locations, 4 vendors, sample requests / quotes / POs in various stages, journal entries, documents (FSSAI license, fire NOC, rent agreement, invoice) and 5 staff members. Reset by clearing the `restaurant-os-store` key from `localStorage`.
