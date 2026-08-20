# Kirana Store App — Implementation Prompt

Use this as the master prompt for Claude Code / Codex when starting implementation.
Paste relevant sections per phase — don't dump everything into context at once.

---

## Project Summary

A hyperlocal grocery ordering app for a single kirana (small neighborhood) store.
Store currently operates offline — customers walk in and buy. Owner wants an app so his
~30-40 existing customers (within 1-2km radius) can browse stock, place orders, and pay
via Cash on Delivery. Built to be **scalable to a multi-hub / multi-shop model later**,
but launched as a single-shop MVP first.

**Explicitly out of scope for now:** online payment (Razorpay), barcode scanning, OTP-based auth.
These are Phase 2+ and the schema/architecture should not block adding them later, but do not build them now.

---

## Roles

1. **Customer** — browses products, places orders, tracks order status. Mobile app only.
2. **Staff** — shop employee. Updates inventory, manages order lifecycle (confirm → picking →
   packed → out for delivery). Cannot add other staff or change shop settings. Dashboard only.
3. **Owner** — full access: everything Staff can do, plus add/remove staff & delivery boys,
   edit shop settings, view all orders/reports. Dashboard only.
4. **Delivery** — sees only orders assigned to them, views item list to match against what's
   being handed over, marks COD as collected once delivered. Mobile app (same Flutter app as
   customer, different role/screens after login).

---

## Tech Stack (final, do not deviate without discussion)

| Layer | Choice |
|---|---|
| Customer + Delivery mobile app | Flutter |
| Admin/Staff dashboard | Next.js (reuse Ant Design patterns from prior Jiffit dashboard experience) |
| Backend (sole data access layer) | Node.js + Express, hosted free on Render |
| Database | Supabase (Postgres) — DB only, never called directly by clients |
| ORM | Prisma |
| Auth | Firebase Auth — email/password only (no OTP, no Fast2SMS) |
| Image storage | Cloudinary (free tier) |
| Payment | None yet — Cash on Delivery only |

### Why every data access goes through the backend
**Decision:** Flutter and Next.js never talk to Supabase directly — no client SDK, no
PostgREST, no anon key in either app. All reads and writes go through the Node/Express
backend, which is the sole holder of `DATABASE_URL` and connects via Prisma using a
Postgres role that bypasses Row-Level Security.

This was chosen over the earlier "thin backend, direct reads via Supabase client SDK +
RLS" design because that design requires a Firebase→Supabase JWT bridge (issuing a
Supabase-compatible JWT carrying the Firebase UID as a custom claim) to make RLS
enforceable per-user — real complexity for a single-shop MVP. Routing everything through
the backend instead means:
- Auth is verified once, via the Firebase Admin SDK, in Express middleware
  (`backend/src/middleware/auth.ts`) — no JWT bridge needed.
- Access control (shop scoping, role checks) lives in one place: Express middleware +
  scoped Prisma queries — not duplicated between RLS policy SQL and app code.
- The atomic stock-check-and-decrement on order creation was already required to be
  server-side to avoid race conditions (two customers ordering the last unit at once);
  this just extends the same reasoning to every other read/write.

Supabase RLS is still enabled on all tables as a deny-by-default safety net (see
`backend/sql/rls_policies.sql`) — it protects against a leaked anon key or a
misconfigured client, but it is not the access-control mechanism the app relies on.

---

## Data Model

Use the Prisma schema already drafted (`schema.prisma`) as the source of truth:

- `Shop` — has `id`, supports multi-shop from day one even though only one shop exists now
- `User` — `role` enum: CUSTOMER, STAFF, OWNER, DELIVERY. Linked to Firebase via `firebaseUid`
- `Product` — belongs to a shop, has price, quantityAvailable, isAvailable, nullable `barcode`
  field reserved for Phase 2
- `Order` — status flow: PENDING → CONFIRMED → PICKING → PACKED → OUT_FOR_DELIVERY → DELIVERED
  (or CANCELLED at any point before OUT_FOR_DELIVERY). Has `paymentStatus` tracked separately
  (PENDING → COLLECTED) since delivery and cash collection can be two separate moments.
- `OrderItem` — snapshots `priceAtOrder` so historical orders aren't affected by later price changes

Every table that will eventually need to differ per shop/hub already carries `shopId`.
Do not remove this even though there's only one shop right now.

---

## Access control

Enforced in the Express backend, not in the database:
- `authenticate` middleware verifies the Firebase ID token and resolves it to a `User`
  row (`shopId`, `role`) via Prisma — every route requires this.
- `requireRole(...)` middleware restricts a route to specific roles.
- Route handlers scope every query by `req.user.shopId` (and by `customerId` /
  `deliveryBoyId` where relevant) — the same rules that were originally drafted as RLS
  policies now live here instead:
  - Customers can only read/create their own rows in `Order` (matched via `customerId`)
  - Staff/Owner can read/update all rows where `shopId` matches their own `shopId`
  - Delivery role can only read/update orders where `deliveryBoyId` = their own user id
  - Only Owner role can create/update `User` rows with role STAFF or DELIVERY (no public
    self-signup for these roles)

Supabase RLS (`backend/sql/rls_policies.sql`) is enabled as a deny-by-default backstop,
not the primary mechanism — see that file's header comment for details.

---

## Phase Breakdown

See `TRACKING.md` for the actual checklist. Build in this order:

1. **Foundation** — Supabase project, Prisma schema migration, RLS policies, Firebase Auth setup, Cloudinary setup
2. **Dashboard core** — Next.js auth (owner/staff login), product CRUD, inventory quantity/price updates
3. **Customer app core** — Flutter auth, product browse/list (read-only from Supabase), cart, place order (via Express backend endpoint)
4. **Order lifecycle** — dashboard order status updates (PENDING→...→OUT_FOR_DELIVERY), customer order tracking screen
5. **Delivery flow** — delivery role login, assigned orders list, item-match view, COD collected confirmation
6. **Staff management** — owner-only screens to add/remove staff and delivery boy accounts
7. **Polish & test** — empty states, error handling, real device testing with the shopkeeper's actual product catalog

Do not start Phase 2 work until Phase 1 is fully verified working end-to-end (a product
created in Supabase shows up correctly with proper RLS access from both dashboard and app).

---

## Explicit Non-Goals (do not build unless asked)

- Razorpay / any online payment
- Barcode scanning
- OTP/SMS-based login
- Multi-shop switching UI (schema supports it, UI doesn't need to yet)
- Delivery boy self-signup
- Customer self-service returns/refunds flow

---

## Notes for the implementing agent

- Owner has prior experience with Prisma + Postgres + Flutter + Next.js/Ant Design (from an
  unrelated larger project) — code style should be clean and production-familiar, not
  beginner-scaffolded.
- Keep the Flutter app as a single codebase with role-based routing after login — do not
  create separate apps per role.
- All environment secrets (Supabase keys, Firebase config, Cloudinary keys) go in `.env`
  files, never hardcoded, never committed.
