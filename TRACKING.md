# Kirana Store App — Build Tracking

Project: Hyperlocal kirana ordering app (Flutter + Next.js + Supabase)
Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Accounts & Credentials (you do this manually, once)

- [ ] Supabase project created, `DATABASE_URL` + `SUPABASE_URL` + `SUPABASE_ANON_KEY` saved
- [ ] Firebase project created, Auth enabled (email/password provider), config keys saved — **BLOCKED: confirmed not done yet.** Attempting to create a test user via Admin SDK on 2026-08-20 failed with `auth/configuration-not-found`, which means Authentication hasn't been enabled in the Firebase console at all (not just email/password specifically). Enable it at Firebase Console → Authentication → Get started → Email/Password, then this can be re-run.
- [ ] Cloudinary account created, API key + upload preset saved
- [ ] Render account created (for later backend hosting)
- [ ] All keys stored in local `.env` files (never committed to git)

---

## Phase 1 — Foundation

- [x] Prisma schema finalized (`backend/prisma/schema.prisma`) and migration applied to the real Supabase DB — ran `npx prisma migrate deploy` against your live `DATABASE_URL` on 2026-08-20; `20260820000000_init` applied successfully, all 5 tables created. Verified via the migration CLI's own success output (not yet independently queried table-by-table — worth a quick spot check next session).
- [x] Access-control architecture finalized: all Flutter/Next.js data access goes through the Express backend — no direct-to-Supabase client reads, no Firebase→Supabase JWT bridge. Backend enforces shop/role scoping in Express middleware + Prisma queries. Documented in PROJECT_PROMPT.md ("Why every data access goes through the backend" + "Access control" sections).
- [x] Supabase RLS deny-by-default backstop applied to the real DB — ran `backend/sql/rls_policies.sql` via `prisma db execute` on 2026-08-20, succeeded. RLS enabled on all 5 tables, no policies (backend's Prisma role bypasses RLS by design).
- [x] Firebase Admin SDK auth middleware (`backend/src/lib/firebaseAdmin.ts`, `backend/src/middleware/auth.ts`) — already had the required `.replace(/\\n/g, "\n")` on `FIREBASE_PRIVATE_KEY`, no fix needed. Smoke-tested locally: server boots with the real service account, `/products` correctly returns 401 for missing/invalid tokens.
- [x] `GET /products` / `POST /products` — directly verified with a valid token: the Phase 2 Playwright walkthrough's "add product" step is a real `POST /products` call, confirmed both in the UI and by an independent `curl` against the live DB afterward.
- [x] Firebase Auth wired to Supabase `User.firebaseUid` — **unblocked 2026-08-20.** You enabled Authentication (Get started + Email/Password) in the Firebase Console; `admin.auth().createUser` then succeeded and the resulting `firebaseUid` was written to a `User` row, confirmed by a successful login + `/me` lookup.
- [x] Cloudinary upload tested (single image upload + URL retrieval) — verified via the real signed-upload route: `POST /uploads/product-image` returned a genuine `res.cloudinary.com/igdustwi/...` URL, independently confirmed via `curl GET /products`.
- [x] Test Shop + test Product/User created and verified — `phase2-test-shop` / `phase2-test-owner@example.com` (OWNER) exist in the live DB, with a real product created/edited/deactivated through them. Left in place as a reusable fixture for later phases (Phase 3+ order-flow testing needs a product and a shop to test against) — flagged here so it isn't mistaken for real shopkeeper data; clear it out before Phase 7's real catalog entry.
- [x] Node/Express backend skeleton — `/health` returns `{"status":"ok","db":"connected"}` against the real Supabase DB, re-confirmed multiple times this session. Render deployment still not done (separate, later step, not blocking dev).

**Exit criteria: met, directly verified 2026-08-20** (not just claimed — see the Phase 2
walkthrough below for the actual evidence: real login, real product created with a real
Cloudinary image, read back and cross-checked against the live DB via `curl`).

---

## Phase 2 — Dashboard Core (Next.js)

Backend additions this phase (`backend/src/routes/`): `GET /me` (profile for
frontend role routing), `GET /shop` + `PATCH /shop` (Owner only), `PATCH
/products/:id` + `DELETE /products/:id` (soft-deactivate, Staff/Owner), `POST
/uploads/product-image` (signed Cloudinary upload — decided with user:
backend holds the API secret, no unsigned preset, consistent with "everything
through the backend"). All auth-gated via the existing `authenticate` /
`requireRole` middleware, all scoped by `req.user.shopId`, no new patterns.

- [x] Owner/Staff login (Firebase Auth) — verified with a real account (`phase2-test-owner@example.com`, OWNER) driven through the actual UI in headless Chromium: filled the form, submitted, landed on `/products`. Screenshots taken at each step.
- [x] Role-based route protection — verified: the OWNER test account correctly sees and can navigate to "Shop Settings" in the nav (STAFF/CUSTOMER/DELIVERY behavior not separately tested — no STAFF/CUSTOMER/DELIVERY test account exists yet, only OWNER. The redirect *logic* for those cases is in place and typechecked but not yet exercised with a real non-OWNER session).
- [x] Product list view — verified: loads real data from `GET /products`, empty state confirmed first, then the created product appeared correctly.
- [x] Add/edit product (name, description, image via Cloudinary, price, unit, quantityAvailable, isAvailable) — fully verified end-to-end: created "Test Atta 5kg" with a real uploaded image (genuine `res.cloudinary.com` URL), then edited its price ₹250 → ₹275, both confirmed in the UI and independently via `curl` against the live DB.
- [x] Delete/deactivate product — verified: deactivated the test product, confirmed `isAvailable: false` both in the UI (row shows "No", Deactivate button disappears) and via direct DB check.
- [x] Basic shop settings page (owner only) — verified: updated shop name, confirmed the change persisted via direct DB check.

**Two real bugs found and fixed during this walkthrough** (not test artifacts — confirmed
by comparing UI state against direct `curl`/DB checks each time something looked wrong):

1. **Login race condition** (`dashboard/src/context/AuthContext.tsx`): right after a
   successful sign-in, the auth context briefly still reported "no user" while the
   `/me` profile fetch was in flight, so the dashboard layout's route guard bounced
   straight back to `/login` before the fetch could complete — login appeared to
   silently fail every time. Fixed by marking `loading: true` synchronously the
   moment a Firebase user is known, before awaiting the `/me` call.
2. **Stale-response race conditions** in both `settings/page.tsx` and
   `products/page.tsx`: React Strict Mode (on by default in Next.js dev) double-invokes
   effects on mount, firing two concurrent `GET` requests; when the second one resolved
   *after* the user had already started editing or after a mutation had already
   completed, it silently overwrote fresher state with stale data — e.g. a shop-name
   edit would appear to save (200 response, success toast) but the input would revert,
   and a product's own list could momentarily un-deactivate itself on screen. Fixed
   with an ignore-flag on the settings effect and a request-sequence guard
   (`requestIdRef`) on the products page's `load()`, so a superseded response is
   discarded instead of applied. Both were caught specifically because I cross-checked
   UI state against direct backend calls rather than trusting a screenshot alone —
   worth keeping that habit for Phases 3–7.

**Test fixture left in the live DB:** shop `phase2-test-shop` ("Phase 2 Test Shop
(Updated)"), user `phase2-test-owner@example.com` (OWNER), one deactivated product
("Test Atta 5kg"). Kept intentionally as a reusable fixture for Phase 3+ (order-flow
testing needs a shop/product to order against) — clear it before Phase 7's real
catalog entry.

**Exit criteria: met, directly verified 2026-08-20.** Proceeding to Phase 3.

---

## Phase 3 — Customer App Core (Flutter)

Backend additions this phase: `POST /auth/register` (`backend/src/routes/auth.ts`) —
customer self-signup, verifies the Firebase ID token directly rather than via the
`authenticate` middleware (no `User` row exists yet at that point), attaches every
new customer to the single existing shop (single-shop MVP, see file comment for the
multi-shop caveat). `POST /orders` (`backend/src/routes/orders.ts`) — the one
operation this whole "everything through the backend" architecture exists for: an
atomic `prisma.$transaction` that checks stock, decrements it, and creates the
Order/OrderItems together, so two customers can't both buy the last unit.

Mobile app note: **product browse reads from the backend (`GET /products`), not
directly from Supabase** — the TRACKING.md line below is stale from before the
"everything through the backend" architecture decision (see PROJECT_PROMPT.md);
updated to reflect what was actually built.

- [x] Customer login/signup (Firebase Auth, email/password) — verified end-to-end on the Android emulator: signed up a real test customer through the app's own Signup screen (`phase3-test-customer@example.com`), which created a real Firebase Auth user and a real `User` row (via `POST /auth/register`) with role CUSTOMER, then auto-logged into the app. Also fixed a real bug along the way: `AuthService` had the identical race condition found in the dashboard's `AuthContext` in Phase 2 (state briefly read "logged out" while `/me` was in flight) — same fix applied (mark loading before the async call).
- [x] Product browse screen (via backend `GET /products`, filtered client-side to available items with stock) — verified: shows the real "Test Atta 5kg" fixture with correct price/stock, confirmed by both the UI and a direct DB check.
- [x] Product detail view — verified: correct price, stock, and quantity stepper render for the real product.
- [x] Cart (local state, add/remove/adjust quantity) — verified: add-to-cart confirmed via snackbar + badge count, and cart state correctly persisted across a sign-out/sign-in cycle (in-memory Provider state, unaffected by auth).
- [x] Place order → Express backend endpoint (atomic stock check + decrement + Order/OrderItem creation) — **fully verified against the live DB**: placed a real order through the UI, then independently confirmed via Prisma query that the `Order` + `OrderItem` rows were created correctly (customer, items, total ₹275) *and* that `Product.quantityAvailable` was atomically decremented (20 → 19).
- [x] Order confirmation screen — verified: shows real order ID, PENDING/PENDING status, item list, and total, matching the DB record exactly.

**Verified this phase:** `flutter analyze` clean (0 errors), `flutter test` passes, backend `tsc --noEmit` clean. Full flow driven for real on the `Medium_Phone_API_36.1` Android emulator (not just code review) — signup → browse → add to cart → place order → confirmation — with every claim cross-checked against direct `curl`/Prisma queries against the live DB, not just screen appearance.

**One process note for future sessions:** driving the emulator by eyeballing screenshot pixel coordinates for `adb shell input tap` was unreliable and cost significant time — coordinates were off by 500+ px in a couple of cases (once tapping "Log out" instead of the cart icon, and repeatedly missing the "Place order" button) because a keyboard opening reflows a centered layout, and visual pixel estimation from a scaled-down screenshot is error-prone generally. What actually worked: decoding the PNG and scanning for the button's known color to get exact pixel bounds. Worth doing that (or using `uiautomator dump` if the app's semantics/accessibility tree is enabled) from the start next time rather than eyeballing.

**Test fixtures now in the live DB (cumulative):** `phase2-test-shop`, owner
`phase2-test-owner@example.com`, product "Test Atta 5kg" (stock 19), customer
`phase3-test-customer@example.com`, and one real order (`5354a241...`, PENDING/PENDING,
₹275). Deliberately kept for Phase 4 (order-lifecycle testing needs an existing order
to transition through statuses) — clear all of this before Phase 7's real catalog entry.

**Exit criteria: met, directly verified 2026-08-20.**

---

## Phase 4 — Order Lifecycle

- [ ] Dashboard: order list view (filter by status)
- [ ] Dashboard: status update actions — Confirm, Start Picking, Mark Packed, Assign Delivery Boy → Out for Delivery
- [ ] Dashboard: order detail view (items, quantities, customer info, address)
- [ ] Customer app: order history list
- [ ] Customer app: order detail/status tracking screen

---

## Phase 5 — Delivery Flow

- [ ] Delivery role login (same Flutter app, routes to delivery screens)
- [ ] Assigned orders list (only orders where `deliveryBoyId` = self)
- [ ] Order detail view for delivery — items + quantities to match against physical handover
- [ ] "Payment Collected" action → sets `paymentStatus = COLLECTED`, `status = DELIVERED`, `deliveredAt` timestamp

---

## Phase 6 — Staff Management (Owner only)

- [ ] Owner dashboard screen: list staff + delivery accounts
- [ ] Owner can create new Staff/Delivery account (sets initial email/password via Firebase Admin, links to `User` with correct role)
- [ ] Owner can deactivate a staff/delivery account (`isActive = false`, not hard delete)

---

## Phase 7 — Polish & Real-World Test

- [ ] Empty states (no products, no orders, empty cart)
- [ ] Error handling (network failure, out-of-stock at order time, auth errors)
- [ ] Real product catalog entered by shopkeeper (not test data)
- [ ] End-to-end test with real delivery boy on real device
- [ ] APK built and shared directly (Play Store deferred — not needed for 30-40 known customers)

---

## Deferred / Phase 2+ (not in current scope)

- [ ] Razorpay online payment integration
- [ ] Barcode-based product entry/scanning
- [ ] OTP/SMS-based login (Fast2SMS or similar)
- [ ] Multi-shop / hub switching in UI
- [ ] Play Store listing
