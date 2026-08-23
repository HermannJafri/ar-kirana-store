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

## Feature branch: `feature/simplified-customer-flow`

Branched off `main` at commit `41fc054` (Phases 1-3 baseline). `main` is untouched.
Working through Phases A-F below, stopping after each for review before continuing —
same workflow as Phases 1-3 above.

### Phase A — Customer auth removal & profile-first flow

**Revised 2026-08-21** (superseding the first version of Phase A below the line): the
device-ID/mobile-only approach was replaced with username + password over Firebase —
same `username@internal.local` synthetic-email pattern the dashboard uses for
Staff/Owner — specifically to close the "anyone can order under someone else's name
with just a phone number" gap. Added a mandatory address-capture step (on-device GPS,
Haversine distance against the shop's configured location, no geocoding API) gating
first access to the product catalog. The `identify` middleware / `X-Customer-Id`
mechanism from the first version was fully removed — every role now goes through the
same Firebase `authenticate` middleware, which is a net simplification.

Backend: `POST /auth/register` verifies a Firebase ID token directly (no `User` row
exists yet) and creates one with a unique `username`; `mobile` is now optional/contact-
only, no longer unique. New `POST /me/address` (Customer only): accepts
`houseNo`/`floorNo`/`area`/`latitude`/`longitude`, computes Haversine distance
(`backend/src/lib/geo.ts`) against `Shop.latitude`/`longitude`, rejects with a plain
"Delivery isn't available at this address yet" (never raw coordinates/distance) if
outside `Shop.deliveryRadiusKm`; if the shop hasn't set a location yet, every address
is accepted (documented fallback, not a silent bug). `PATCH /shop` extended to accept
`latitude`/`longitude`/`deliveryRadiusKm` (Owner only). Schema: `User.username`
(unique) + `User.area`/`latitude`/`longitude` added, `mobile` uniqueness dropped;
`Shop.latitude`/`longitude`/`deliveryRadiusKm` (default 2) added. Migration
`20260821000000_username_address_geo` applied to the live DB; the two orphaned
device-ID-only customer rows from the first version (no Firebase account, unreachable
under the new scheme) were deleted first.

Dashboard: Settings page gained a "Delivery service area" section — "Use current
location" (browser Geolocation API) plus manual lat/lng/radius fields, saved via the
extended `PATCH /shop`.

Flutter: `firebase_core`/`firebase_auth` reinstated, `flutter_secure_storage` removed
(Firebase persists its own session — no longer needed). `login_screen.dart` /
`signup_screen.dart` recreated with username instead of email. New
`AddressFormScreen` (house/floor/area + "Use my current location" via the
`geolocator` package). `AuthGate`: loading → not logged in → login/signup → logged in
without a saved address (`latitude`/`longitude` null) → address form → product
browse. Android manifest updated with `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`.

- [x] Username + password via Firebase (`username@internal.local` mapping) — verified on-device: signed up a real account (with the Sign Up screen initially, then via direct Firebase REST + backend register to control fixture state precisely), logged out, logged back in through the actual UI login form, landed correctly post-auth. This directly closes the impersonation gap the mobile-only approach had.
- [x] Address form (house/floor/area + GPS) shown on first login, skipped on return visits — verified on-device both ways: a customer with `latitude`/`longitude` already set went straight to the product catalog on login (no form shown); a customer without one was correctly routed to the address form.
- [x] `Shop.latitude`/`longitude`/`deliveryRadiusKm` added, dashboard "Use current location" control — built and typechecked (`tsc --noEmit` clean); not exercised in a browser this session (no time left after the mobile-side debugging below) — worth a quick manual check before Phase B.
- [x] Backend Haversine distance check, generic rejection message, no coordinates/distance ever exposed — **fully verified against the live DB**, both directions: set the shop's location via `PATCH /shop`, then via direct `curl` (matching the app's exact request shape) submitted an out-of-radius address → `422 {"error":"Delivery isn't available at this address yet"}`, confirmed via `GET /me` that nothing was persisted; submitted an in-radius address for a different customer → `200`, confirmed the row was saved correctly.
- [x] Out-of-radius rejection demonstrated live, on-device, with real GPS — driven through the actual UI early in this session: tapped "Use my current location" (captured the emulator's real default mock location, nowhere near the shop), submitted, got the exact "Delivery isn't available at this address yet" message on-screen, confirmed via direct DB query that no address was saved. Screenshotted.
- [~] In-radius acceptance demonstrated live, on-device — **not re-confirmed after an emulator crash cascade** (see below). The backend logic behind it is the same one just proven for rejection, and is separately confirmed correct via direct `curl` with the app's exact request shape (see above) — but I did not get a second on-device screenshot of "Location captured" → "Continue" → success screen after the environment degraded. Recommend a quick manual retry on your end, or ask me to redo it in a fresh session.

**What went wrong on the tooling side, for the record:** partway through on-device
testing, a Gradle build daemon OOM-crashed (this machine has ~7.7GB RAM total; the
Flutter template's default `-Xmx8G` for Gradle was the direct cause — turned down to
`-Xmx2G` in `android/gradle.properties`, worth keeping). Recovering from that
(emulator restart, backend restart after a dropped DB connection, app reinstall)
left the emulator in a state where one specific button (`OutlinedButton.icon` /
"Use my current location") stopped responding to taps — confirmed this wasn't a
coordinate-targeting mistake (the *same* pixel-verified coordinates that failed on
this button worked fine on the Login/Continue buttons moments apart, and the
button's own loading spinner never appeared even once across ~8 attempts, which
only happens if `onPressed` never fires at all). This exact button had already
worked correctly earlier in the same session, before the crash cascade, so this
reads as environment/rendering flakiness under memory pressure, not a code defect
— but I'm flagging it plainly rather than papering over an unresolved loose end.

**Also fixed during this phase:** found a real `.env` vs `.env.example` situation before
committing — `backend/creds/ar-kirana-store-firebase-adminsdk-fbsvc-*.json` (a full
Firebase service-account key, presumably downloaded at some point outside this
session) was sitting un-gitignored and got caught by `git add -A` right before the
first commit. Unstaged it, added `creds/` to `backend/.gitignore`, and added a
root-level `.gitignore` as a defense-in-depth backstop for credential-shaped files
anywhere in the repo. Nothing sensitive was ever committed — this was caught before
the first commit existed.

**Test fixtures now in the live DB (cumulative):** all Phase 1-3 fixtures, plus
customers `phaseA2`/`phaseA3`/`phaseaccept` (various address states) under the new
username scheme. The original mobile-only Phase A fixtures were deleted (unreachable
under the new auth). Clear all of this before Phase 7's real catalog entry.

---

<details>
<summary>First version of Phase A (device-ID/mobile-only auth) — superseded above, kept for history</summary>

Backend: `POST /auth/register` — no Firebase token, find-or-create by `mobile`
(unique), returns the `User.id` the client uses as its credential from then on. New
`identify` middleware accepted either a Firebase Bearer token or an `X-Customer-Id`
header on shared routes. Flutter: removed Firebase entirely, added
`flutter_secure_storage` for the device-issued id, `ProfileFormScreen` in place of
login. Fully verified at the time (registration, persistence across a real app
restart, middleware role-gating, no regression on the Firebase path) — see git log
on this branch for the original commit if needed. Replaced because it allowed
ordering under anyone's phone number with no verification at all.

</details>

### Phase B — Dashboard: username-based login

Already implemented as part of the Phase A revision above (`dashboard/src/lib/auth.ts`'s
`usernameToEmail`, `login/page.tsx` using a `username` field). Re-verified this session
with a fresh Playwright login against the live owner account.

- [x] Dashboard login by username instead of email — verified: logged in as `owner` via the actual UI form, landed on `/products`.

### Phase C — Dashboard: inventory, search, categories & Customer app: catalog by category

Backend: new `Category` model (`name`, `shopId`, unique per shop) with full CRUD at
`backend/src/routes/categories.ts` (`authenticate` on all routes, `requireRole("STAFF",
"OWNER")` on mutations). `Product.categoryId` (nullable, `onDelete: SetNull`) added;
`GET/POST/PATCH /products` now include and accept `category`. Migration
`20260821010000_categories` applied to the live DB.

- [x] Category management (add/edit/delete) — verified via Playwright: added "Snacks", renamed, all reflected correctly in the dashboard's category modal.
- [x] Assign category on product add/edit — verified: the product edit form's category `Select` renders and saves correctly.
- [x] Products page search bar + category filter tabs — verified: search-by-name and tab filtering both work against real data.
- [x] Inventory screen (all products, quantityAvailable, low-stock indicator, inline quantity edit) — verified: inline stock edit (5 → 20) persisted correctly, confirmed via reload.
- [x] Customer app (Flutter) catalog grouped/filtered by category — verified on-device (`Medium_Phone_API_36.1` emulator): "All"/"Grains"/"Snacks" chips render from `GET /categories`, filtering by category works correctly (Grains shows the fixture product, Snacks correctly shows "No products in this category").

### Phase D — Dashboard: order visibility & notifications

Backend: `backend/src/routes/orders.ts` rewritten with role-scoped `GET /orders`
(Customer sees own, Staff/Owner see shop-wide, both support `?status=` filter, newest
first), `GET /orders/:id` (ownership-checked), and `PATCH /orders/:id/status`
(Staff/Owner only, validated against a `NEXT_STATUS` transition map, sets the matching
timestamp field). All verified via `curl` against the live DB: role scoping, valid/invalid
transitions, role restriction on status updates.

Dashboard: new "Orders" tab (`orders/page.tsx`) — table of all orders (status, customer,
address, items, total, placed-at), filterable by status, detail modal with status-update
action buttons (Confirm/Start picking/Mark packed/Out for delivery/Cancel — `DELIVERED`
intentionally excluded, reserved for the Phase 5 Delivery role's "payment collected"
action *(superseded — see "Refinements" below: the Delivery role was removed entirely and
DELIVERED is now a plain Owner/Staff action, same as every other status)*). Sidebar
(`layout.tsx`) converted to `Layout.Sider` with a live PENDING-count badge, polling
`GET /orders?status=PENDING` every 20s.

- [x] Orders list + detail + status transitions — **fully verified against the live DB**, including a real diagnostic detour: an early test appeared to show the table not refreshing after a status update, but a follow-up run with a network log and a freshly-created fixture order confirmed the table *does* refresh correctly (`load(true)` firing and applying) — the earlier miss was insufficient wait time in that specific test script, not a code defect. No fix was needed.
- [x] Sidebar PENDING badge, ~20s polling, no manual refresh needed — verified: badge count matched the live PENDING order count and updated after confirming an order.

### Phase E — Customer app: order history & bill

Flutter: `ApiService.getOrders()` / `getOrder(id)` added. New `MyOrdersScreen` (list,
newest first, status chip + total per row) and `OrderDetailScreen` (status, placed-at,
payment, itemized list with quantity × price, total — doubles as the receipt). Reachable
from a new app-bar icon on the product browse screen.

- [x] My Orders list — verified on-device: shows both a CONFIRMED and a PENDING fixture order with correct status colors, newest-first ordering.
- [x] Order detail/receipt screen — verified on-device: status, placed-at timestamp, payment method, itemized quantity × price line, and total all render correctly from `GET /orders/:id`.

**One real bug found and fixed this phase:** the My Orders list's status chip + total in
the trailing column overflowed by 4px (`Card`/`ListTile` intrinsic-height mismatch with a
default-size `Chip`). Fixed with `mainAxisSize: MainAxisSize.min` on the trailing `Column`
and `materialTapTargetSize: MaterialTapTargetSize.shrinkWrap` on the `Chip`; re-verified
on-device that the overflow banner is gone.

**Also fixed (environment, not app code):** the mobile app's `.env` `API_BASE_URL` pointed
at a stale LAN IP (the host machine's address had changed since it was last set), which
made the app hang on its loading spinner indefinitely with no visible error. Updated to
the current IP; worth checking this first if the app seems stuck on launch in a future
session.

**Test fixtures added this phase (cumulative, live DB):** two extra test orders for
`phaseA2` (one PENDING, one CONFIRMED) to exercise the My Orders screens; one extra
PENDING order used for the Phase D refresh-bug investigation (now CONFIRMED). `phaseA2`'s
Firebase password was reset to a known test value to enable on-device login. Clear all of
this before Phase 7's real catalog entry.

### Phase F — Dashboard: sales analytics sidebar

Backend: new `GET /analytics/sales?from=&to=` (`backend/src/routes/analytics.ts`, Owner
only via `requireRole("OWNER")`) — defaults to the last 7 days if no range is given,
returns `{ summary: { totalRevenue, orderCount, avgOrderValue }, byProduct: [...] }`.
**Business decision:** counts every order except `CANCELLED` (not just `DELIVERED`) —
reasoning documented in the route's own comment: a small kirana owner wants a demand
signal ("what's moving, what should I restock") the moment an order is placed, not a
strict revenue-recognition number that waits for delivery days later. A stricter
accounting view would count only `DELIVERED`, but nothing reaches that status yet this
early in the build, which would make the analytics page permanently empty — the demand
framing is both the more useful default for this app and the one that's actually
testable against real data right now.

Dashboard: new "Analytics" sidebar item (Owner only, same route-guard pattern as "Shop
Settings" — Staff gets redirected to `/products`), `analytics/page.tsx` — antd
`RangePicker` (default last 7 days), three summary `Statistic` cards, and a D3.js bar
chart (`SalesByItemChart.tsx`) of sales by item with a Revenue/Quantity toggle
(`Segmented`). Added `d3`, `@types/d3`, `dayjs` as direct dependencies.

- [x] Analytics tab, Owner-only — verified via Playwright: visible and functional for the `owner` account; backend independently confirmed to 403 (`{"error":"Insufficient role"}`) for a non-owner (customer) token, same `requireRole`/route-guard pattern already proven for Shop Settings.
- [x] Date-range picker, default last 7 days — verified: loaded pre-filled with `2026-08-15 → 2026-08-21` against the live DB.
- [x] D3 bar chart, sales by item (quantity and revenue) — **fully verified against the live DB**: screenshotted both metrics, matching the backend's real aggregation (`Test Atta 5kg`: ₹2,200 revenue / 8 units across the fixture orders).
- [x] Summary numbers (total revenue, order count, average order value) — verified: ₹1,925.00 / 6 orders / ₹320.83, matching a direct `curl` against the same endpoint.
- [x] Only non-cancelled orders counted — verified: created a throwaway `CANCELLED` order with a deliberately huge total (₹999,999) as a canary; confirmed it did **not** appear in the summary or chart, then deleted it.

**Test fixture note:** the ₹1,925 total revenue vs. the chart's ₹2,200 item-revenue sum
is not a bug — it's the pre-existing Phase D test-fixture data-entry mistake noted
earlier (one manually-inserted test order's `totalAmount` wasn't recalculated for its
quantity). Real orders placed through `POST /orders` always compute `totalAmount`
correctly server-side; this only affects hand-inserted test rows.

**Exit criteria: met, directly verified 2026-08-21.** This was the last item from the
original Phase B–F batch.

### Refinements — simplified status flow, no delivery role, partial payments, search

Requested as a set of cleanups before considering the branch merge-ready. All five
verified against the live DB and on real UI (dashboard via Playwright, mobile app
on the `Medium_Phone_API_36.1` emulator).

1. **Simplified order status flow.** `OrderStatus` enum shrunk from
   PENDING/CONFIRMED/PICKING/PACKED/OUT_FOR_DELIVERY/DELIVERED/CANCELLED to just
   PENDING/CONFIRMED/OUT_FOR_DELIVERY/DELIVERED/CANCELLED. Migration
   `20260821020000_simplify_status_remove_delivery_role` first folds any existing
   PICKING/PACKED rows into CONFIRMED (one live fixture order was in PACKED — verified
   it migrated to CONFIRMED correctly), then recreates the Postgres enum type
   (dropping an enum value isn't directly supported). `Order.packedAt` dropped along
   with it.
   - [x] Verified via direct API calls: `PENDING → PICKING` now rejected (`400 Invalid
     status`, since PICKING no longer exists); the full `PENDING → CONFIRMED →
     OUT_FOR_DELIVERY → DELIVERED` chain works; `CANCELLED` correctly rejected once an
     order reaches `DELIVERED` (`409`).
   - [x] Dashboard Orders page updated to match — verified via Playwright: detail modal
     shows only the buttons valid for the current status (no more "Start picking"/"Mark
     packed"), `DELIVERED` reachable as a plain action once `OUT_FOR_DELIVERY`.

2. **Removed the DELIVERY role entirely.** No rows used it in the live DB (verified
   before writing the migration), so this was a clean removal: `UserRole` enum
   shrunk to CUSTOMER/STAFF/OWNER, `Order.deliveryBoyId` (and its FK/index) dropped,
   `User.ordersAsDelivery` relation removed. No delivery-specific routes or screens
   existed yet to clean up. `PROJECT_PROMPT.md` updated with a new "No separate
   delivery role" decision section (mirroring the "Customer identity trade-off"
   section's style) explaining the reasoning and when to revisit it.
   - [x] Verified: backend `tsc --noEmit` clean, dashboard `tsc --noEmit` clean,
     `flutter analyze` clean — no dangling `DELIVERY` role references anywhere in
     active code (confirmed via a repo-wide grep, remaining hits are all
     `OUT_FOR_DELIVERY` status text or historical migration/TRACKING.md notes).

3. **Partial payment tracking.** `Order.amountPaid` (Decimal, default 0) added;
   `PaymentStatus` gained `PARTIAL` (PENDING → PARTIAL → COLLECTED, all
   auto-computed from `amountPaid` vs `totalAmount`, never set directly). New
   `PATCH /orders/:id/payment` (Staff/Owner only) accepts `{ amount }` and *adds* it
   to the running `amountPaid` total, so a cash payment can be recorded in more than
   one visit. Dashboard order detail gained a "Payment" section: current
   `paymentStatus` tag, "Received: ₹X · Remaining: ₹Y", and an amount input + "Record
   payment" button (hidden once fully paid). Customer app's order detail screen shows
   the same received/remaining breakdown when `paymentStatus` is `PARTIAL`.
   - [x] Backend verified directly: PENDING (₹0) → recorded ₹100 of ₹300 → `PARTIAL` →
     recorded the remaining ₹200 → `COLLECTED`, all computed correctly.
   - [x] Dashboard verified via Playwright, including recording payment across *two
     separate calls* on the same order (₹200 + ₹200 on a ₹500 order → correctly
     showed `PARTIAL`, Received ₹400.00, Remaining ₹100.00) — confirms the
     "incremental if paid in parts" requirement actually works, not just in theory.
   - **Process note:** the first attempt to drive this in Playwright looked like a
     bug (payment not reflected after a 1.2s wait), but a longer wait plus a network
     log showed the `PATCH .../payment` request simply took longer than that to
     resolve (Firebase `getIdToken()` round trip) — not a defect. Worth remembering
     for future dashboard Playwright scripts: 1-1.5s is sometimes too short for a
     real network+auth round trip, not just for React state settling.

4. **Dashboard Orders search.** Client-side filter (same pattern as the Products
   page's search) matching customer name, mobile number, or order ID substring,
   case-insensitive.
   - [x] Verified via Playwright: searching by customer name and by an order-ID
     prefix both correctly narrowed the table to the matching row(s).

5. **Customer app catalog search.** Search bar above the category chips on the
   product browse screen, filtering by product name (combines with the active
   category filter — Phase C — and shows a `No products match "<query>".` empty
   state).
   - [x] Verified on-device: added a second real product ("Test Rice 1kg") so the
     filter had something to actually exclude; searching "atta" correctly narrowed
     the list to just "Test Atta 5kg", and a no-match query showed the correct empty
     state.

6. **Dashboard Orders payment-status filter.** Added shortly after the above, on
   request. `GET /orders` now also accepts `?paymentStatus=`, combinable with the
   existing `?status=` filter (both are plain `where` clauses, ANDed together as
   before). Dashboard gained a second `Select` ("Filter by payment") next to the
   existing status filter; both filters and the search box compose together.
   - [x] Verified against the live DB with realistic mixed data (9 orders spanning
     PENDING/PARTIAL/COLLECTED payment states): filtering to `PARTIAL` alone
     correctly returned 2 orders, `COLLECTED` alone returned 2, and combining
     `status=DELIVERED` + `paymentStatus=COLLECTED` correctly narrowed to exactly
     the 2 orders matching both — confirming the two filters actually AND together
     rather than one silently overriding the other.

**Test fixtures added/removed this round:** several throwaway test orders created and
deleted directly via Prisma to exercise each status/payment transition (all cleaned up
afterward); one real product fixture added and *kept* — "Test Rice 1kg" (₹90/pack,
stock 15) — useful for future search/category testing, not test-only noise.

**Exit criteria: met, directly verified 2026-08-21.** Ready to plan merging
`feature/simplified-customer-flow` into `main`.

### Customers page (dashboard) + customer login switched to mobile + password

Requested after the above. Two related pieces:

**1. Dashboard "Customers" section (Staff/Owner).** New `GET /customers` (list) and
`PATCH /customers/:id/reset-password` (`backend/src/routes/customers.ts`). Important
clarification given to the user up front: no auth system, Firebase included, ever
stores or exposes a password in readable form — a literal "see the customer's
password" feature isn't something anyone can build. What was actually wanted (and
built) is the standard staff-assisted recovery flow: Owner/Staff open the customer's
row and set a **brand-new** password via the Firebase Admin SDK. The eye-icon toggle
applies to that new password as it's being typed (antd's `Input.Password`), not to
any stored secret.
- [x] Customers list + search (name/mobile/username) — verified via Playwright against live data.
- [x] Reset-password modal, eye-icon show/hide on the new-password field — verified via Playwright (typed a password, confirmed masked by default, confirmed the icon reveals plaintext).
- [x] The reset actually works, end-to-end, not just UI — **the strongest verification in this round**: clicked "Set new password" in the real dashboard UI, then independently confirmed via the Firebase Auth REST API that the customer's *old* password now fails (`INVALID_LOGIN_CREDENTIALS`) and the *new* one succeeds. Then logged into the actual Flutter app on-device with that same new password and reached the app's home screen.

**2. Customer app login switched from username to mobile number.** `mobileToEmail()`
replaces `usernameToEmail()` (`mobile-app/lib/services/auth_service.dart`) — same
synthetic-email pattern, now keyed on the mobile number's digits instead of a
username. `POST /auth/register` swapped which field is mandatory: `mobile` is now
required (min 10 digits), `username` is optional; `name` was already mandatory and
still is. No DB migration needed — both `mobile` and `username` were already
nullable columns; only the application-layer validation in `auth.ts` changed. Mobile
is *not* a DB-unique constraint (a few pre-existing customer rows predate this and
happen to share a number as contact info — see below), but `POST /auth/register` now
rejects a new signup that reuses an already-registered mobile number, and Firebase
itself independently refuses to create two accounts with the same derived email — so
the data stays clean going forward without a migration that could conflict with that
historical data.
- [x] Login screen now asks for "Mobile number" instead of "Username" — verified on-device.
- [x] Signup screen reordered to Name → Mobile number → Username (optional) → Password, with mobile validated as mandatory (≥10 digits) and username genuinely optional — verified on-device: signed up a real account with **no** username, confirmed via a direct DB query that `username: null`, `mobile` set correctly, and the customer was auto-logged-in and routed to the address form exactly like an existing customer would be.
- [x] Backend validation — verified via `curl`: registering with no mobile → `400`; registering with a mobile that's already on another customer's row → `409`.

**Known data-migration caveat, called out rather than silently papered over:** three
existing customer rows (`Phase3TestCustomer`, `Phase A3 Customer`, `Phase Accept
Test`) have no mobile number on file and therefore cannot log in under the new
mobile-based scheme until Staff/Owner adds one for them (there's no in-app "add
mobile to an existing account" flow yet — would need to go through the Customers
page or a direct DB update). Separately, two real customer rows (`sam malik` /
`abis sam`) already share the mobile number `7779816137` as contact info predating
this change — this doesn't block either of their logins (their Firebase accounts are
username-based, created before this revision) but is worth a manual cleanup pass
since mobile is now the primary identifier going forward.

**Test fixtures added/removed this round:** one throwaway customer created via a
direct Firebase+`curl` registration to test the reset-password flow (`Mobile Test
User`, mobile `9876500011`) and one created via the actual on-device Sign Up screen
(`Emulator`, mobile `9123456780`) — both cleaned up (Firebase Auth account + `User`
row deleted) after verification.

### Delete customer (dashboard Customers page)

Requested as a follow-up. `DELETE /customers/:id` (Owner only — more destructive than
the rest of the Customers router's Staff+Owner actions, so held to the same bar as
other irreversible operations). Deletes the Firebase Auth account and the `User` row.
**Blocked if the customer has any orders on record** (`409` with the order count in
the message): hard-deleting them would either fail on the `Order.customerId` FK
constraint or, if cascaded, destroy real order/revenue history — neither is what
"delete this customer" should silently do. Dashboard: a delete (trash icon) button
next to "Reset password", Owner-only, wrapped in an antd `Popconfirm` that spells out
"This cannot be undone" before the actual delete request fires.

- [x] Confirmation dialog shown before deleting, wording verified via Playwright screenshot ("Delete this customer permanently? This cannot be undone... Blocked if they have any past orders, to protect order history.").
- [x] Successful delete (customer with zero orders) — verified via `curl` (`204`, row gone from a direct DB query afterward) and again via the actual dashboard UI (clicked through the real Popconfirm, saw the success toast, row disappeared from the table).
- [x] Blocked delete (customer with orders) — verified via `curl` (`409`, exact order count in the message, row still present in the DB afterward) and via the dashboard UI (clicked through the real Popconfirm on `Phase A2 Customer`, who has 2 real orders; got the error toast, row remained in the table — order history was never at risk).

**Test fixtures added/removed:** two throwaway customers created directly via Prisma
(`Delete Test NoOrders`, `Delete Test WithOrders` — the latter with one throwaway
order attached) to prove the `curl`-level block/allow behavior, plus one more
(`Delete UI Test`) to drive the actual Popconfirm-to-deletion flow through the
dashboard. All cleaned up after verification (the with-orders one required deleting
its `OrderItem`/`Order` rows first, same as the customer-side cascade would need).

### Two real bugs found via live user testing, fixed same day

The user tested the mobile-login migration on their own real phone/number and hit two
genuine, reproducible bugs — not test-fixture artifacts. Both are fixed and verified.

**Bug 1 — resetting a legacy customer's password didn't actually restore their
login.** Any customer created before the username→mobile login switch has a Firebase
account under `username@internal.local` (or, for a couple of very early rows, no
recognizable pattern at all). The dashboard's "Reset password" was only updating the
password on that old account — but the login screen now looks up
`mobile@internal.local`, a *different* Firebase account entirely, so the customer
stayed locked out even immediately after a "successful" reset.
- **Fix:** `PATCH /customers/:id/reset-password` now also updates the Firebase
  account's *email* to the mobile-derived one (`backend/src/routes/customers.ts`),
  so a reset doubles as a one-time migration to mobile-based login for that
  customer. Blocks with a clear `400` if the customer has no mobile on file (nothing
  to migrate to), and a clear `409` if another account already owns that derived
  email (a duplicate-mobile conflict — see Bug 2's fixture note below).
- [x] Verified against the real affected account (`abis sam`, mobile `7779816137`,
  originally `abis@internal.local`): reset via the endpoint, then confirmed via the
  Firebase Auth REST API that (a) login with `7779816137` + the new password now
  **succeeds**, and (b) the old `abis@internal.local` login path is gone — no
  leftover duplicate account.

**Bug 2 — a failed signup left an orphaned Firebase account that permanently blocked
retrying.** `AuthService.signUp()` created the Firebase Auth account *before* calling
the backend's `POST /auth/register`. If registration failed for any reason (most
commonly: the mobile number was already on file, e.g. from Bug 1's duplicate-mobile
history), the Firebase account was never cleaned up — so every subsequent signup
attempt with that same mobile number failed immediately with
`email-already-in-use`, even though no real customer record existed for it. This is
exactly what the user hit: signing up with `7779816137` after Bug 1 had already
occurred.
- **Fix:** `signUp()` (`mobile-app/lib/services/auth_service.dart`) now wraps the
  backend registration call — if it throws, the just-created Firebase user is
  deleted before rethrowing, so a failed signup leaves nothing behind.
- [x] Verified on-device, live: cleared app data, signed up with a mobile number
  already registered to another real customer (`9112233445`), got the expected
  "already registered" error, then independently confirmed via the Firebase Admin
  SDK that **no orphaned account exists** for that email (`auth/user-not-found`) —
  the rollback fired correctly.

**Real-data cleanup performed as part of this fix (not a test fixture — explaining
for the record):** the orphaned `7779816137@internal.local` Firebase account created
by the user's own repeated signup attempts (before the fix existed) was deleted, and
their `abis sam` account was migrated via the fixed reset-password endpoint so
`7779816137` + a new password now works. Also noted: the user's own `sam malik`
account (which shared the same mobile as `abis sam`, both apparently the same
person's earlier test accounts) had already been removed via the new Delete
Customer feature before this bug was reported — deleting it also correctly removed
its Firebase account, per Delete Customer's existing behavior, which is part of why
the duplicate-mobile conflict resolved cleanly once the orphan was cleared.

### Bug 3 — dashboard reset-password field autofilled with the Owner's own login password

Found by the user via a screenshot right after Bugs 1/2 were fixed: opening the
"Reset password" modal for a customer showed the field pre-filled and highlighted
with the *Owner's own dashboard login password* — the browser's saved-credential
autofill matched a plain `<input type="password">` with no hint that it wasn't a
login field, and silently offered (and in at least one case, per the user's report,
apparently submitted) the wrong value. This is a real, dangerous bug distinct from
Bugs 1/2: it could set a customer's password to the *staff member's own* password
without anyone noticing, and it's the actual explanation for "I reset it and the
password is still the same" — the field wasn't empty when they thought it was.

- **Fix:** `Input.Password` (`dashboard/src/app/(dashboard)/customers/page.tsx`) now
  sets `autoComplete="new-password"` plus `data-lpignore`/`data-1p-ignore`, the
  standard signals browsers and password managers respect to *not* offer a saved
  login credential. Also added a second "Confirm new password" field — the submit
  button stays disabled until both match — which both catches an accidental
  autofill-then-submit (two different saved values won't match) and is generally the
  right UX for a password-setting form regardless of the autofill issue.
- [x] Verified via Playwright (persistent browser context, not just an isolated
  page): field is empty on open, mismatched passwords correctly disable the submit
  button, matching passwords enable it, and the real submit — clicked through the
  actual UI, not a direct API call — correctly changed the account's password
  (confirmed via a Firebase Auth REST login immediately after).

The "customer table went blank" part of the same report turned out not to be a bug:
the search box still had "owner" typed in it from testing the Reset flow, and no
customer is named "Owner" — zero matching rows is the correct behavior for that
query, not broken data. Worth a note for future UI polish (an empty state that says
*why* — "no matches for 'owner'" vs. a bare empty table — would have made this
obvious in the moment), but not fixed as a code change this round since it wasn't a
defect.

**Also cleaned up:** two Firebase accounts left over from *my own* backend-only test
scripts earlier in this session (`no-mobile-test@internal.local`,
`dupe-test-2@internal.local`) — harmless (no matching `User` row, not reachable by
any real customer) but no reason to leave them sitting in the Firebase console.

### Delete order (dashboard Orders page)

Requested as a follow-up, mirroring Delete Customer. `DELETE /orders/:id` (Owner
only). Unlike a customer, an order has nothing else pointing at it (no FK to
protect), so this always succeeds for a valid order in the caller's shop — no
"blocked if..." case needed. Deletes the order's `OrderItem` rows first, then the
`Order`. Explicitly does **not** restore `Product.quantityAvailable` — matches the
existing behavior of the CANCELLED status, which also never gives stock back, so
"delete" and "cancel" stay consistent with each other rather than delete quietly
doing more than cancel does. Dashboard: a delete button in both the table's Actions
column and the order detail modal's footer, Owner-only, behind the same
"cannot be undone" `Popconfirm` pattern as Delete Customer.

- [x] Verified via `curl` (`204`, then confirmed via a direct DB query that both the
  `Order` and its `OrderItem` rows are gone — no orphaned items left behind).
- [x] Verified via the actual dashboard UI (Playwright): searched for the order,
  opened the real Popconfirm (confirmed the exact warning text, including the "does
  not restore stock quantity" note), clicked through the real "Delete permanently"
  button, saw the success toast, and the row disappeared from the table.

**Test fixtures added/removed:** two throwaway orders created directly via Prisma to
drive the `curl` and dashboard-UI verifications respectively; both consumed by their
own delete tests (nothing left to clean up afterward).

**Exit criteria: met, directly verified 2026-08-21.**

### Pre-demo cleanup + admin credential rotation (2026-08-22)

Executed via the real API endpoints (not raw DB surgery, except where no endpoint
exists), per an explicit go-ahead after a full status-report audit.

- **Deleted all 7 test orders** via `DELETE /orders/:id`.
- **Deleted 4 test customers** (`Phase3TestCustomer`, `Phase A2 Customer`,
  `Phase A3 Customer`, `Phase Accept Test`) via `DELETE /customers/:id` — Firebase
  Auth accounts and `User` rows both gone. Kept `abis sam` (mobile `7779816137`) as
  the one demo customer account, unchanged.
- **Hard-deleted both test products** (`Test Atta 5kg`, `Test Rice 1kg`) directly via
  Prisma — no `DELETE /products/:id` endpoint exists (the app's normal pattern is
  soft-deactivate), but with their `OrderItem` rows already gone from the order
  cleanup above there was nothing left for a hard delete to orphan, and "gone from
  the list, not lingering as deactivated" is what a pre-demo reset actually needs.
  Categories (`Grains`, `Snacks`) kept as-is.
- **Admin account rotated**: username `owner` → `admin`, a fresh cryptographically
  random 20-character password generated and set, Firebase email migrated
  `owner@internal.local` → `admin@internal.local` (same email-sync mechanism as the
  customer reset-password fix), display name `"Phase 2 Test Owner"` →
  `"Store Owner"`, stale unused `email` column cleared. Verified three ways: old
  credentials now fail (`INVALID_LOGIN_CREDENTIALS`), new credentials succeed via a
  direct Firebase Auth REST call, and via the actual dashboard login UI (Playwright)
  — header correctly reads "Store Owner (OWNER)" post-login.
- [~] **Shop coordinates** — still the placeholder lat/lng from earlier Phase A
  testing (17.397, 78.445). **Blocked on the real shop location from the user** —
  not updated yet.
- [~] **In-radius address acceptance re-verification** — blocked on the above; not
  re-run this round.

**Verified after cleanup:** Firebase Auth user count 6 → 2 (`admin@internal.local`,
`7779816137@internal.local`), `User` table 6 → 2, `Product` table 2 → 0, `Order`
table 7 → 0, `Category` table unchanged (2).

### Deployment prep (2026-08-22)

Not deployed — prep only, per explicit instruction. No GitHub remote exists on this
repo yet (`git remote -v` empty); nothing has been pushed anywhere.

- **Backend (Render)**: `backend/package.json`'s `build` script now runs
  `prisma generate` before `tsc` (previously relied on Prisma's implicit
  postinstall hook, which is fragile to rely on for a deploy pipeline). New
  `render.yaml` at the repo root (`rootDir: backend`, so Render's Blueprint
  monorepo support picks the right subfolder) — `buildCommand` runs
  `npm install && npx prisma migrate deploy && npm run build`, `startCommand`
  `npm start`, `healthCheckPath: /health`. All secret env vars declared with
  `sync: false` (names only, committed; values entered manually in Render's
  dashboard, never in this repo or chat) — `DATABASE_URL`, `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
  `FIREBASE_PRIVATE_KEY`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`. `NODE_ENV=production` is the one non-secret value
  committed directly.
  - [x] Verified: killed the locally-running dev server (it was holding the Prisma
    query-engine DLL, a known Windows-only lock issue that doesn't occur in Render's
    fresh Linux containers), ran the exact updated `npm run build` locally — Prisma
    Client regenerated, `tsc` compiled clean, `dist/index.js` produced.
- **Dashboard (Vercel)**: no `vercel.json` needed — Vercel auto-detects Next.js; the
  monorepo just needs "Root Directory" set to `dashboard` in the Vercel project
  settings (same idea as Render's `rootDir`). Env vars to set in Vercel's dashboard:
  `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` (all already
  public/non-secret, currently in `dashboard/.env.local`), and
  `NEXT_PUBLIC_API_BASE_URL` — **set this only after the Render backend has a live
  URL**, pointing at it (e.g. `https://kirana-store-backend.onrender.com`).
  - [x] Verified: `npm run build` (`next build`) succeeds cleanly — all 9 routes
    compiled and statically optimized, zero errors.

**Exit criteria: cleanup and deployment prep done and verified; actual deployment,
shop-coordinate update, and in-radius re-verification are pending user action /
input.**

### Dashboard: full mobile responsiveness (2026-08-23)

Requested to make the Next.js dashboard usable as a real mobile-web app, not a
squeezed desktop layout, while the Render backend deploy ran in parallel (no backend
changes here). Used antd's own breakpoint tooling throughout rather than custom media
queries, per the request: a shared `useIsMobile()` hook
(`dashboard/src/lib/responsive.ts`) wraps antd's `Grid.useBreakpoint()`, keyed off
antd's own `md` (768px) cutoff, so every page agrees on exactly where "mobile"
starts.

- **Navigation** (`layout.tsx`): the `Sider` is replaced with a top `Header`
  (hamburger + title + Log out) and an antd `Drawer` holding the same `Menu` on
  mobile; desktop keeps the original `Sider` untouched. Drawer closes on menu click
  and on route change (covers the browser back button too).
- **Tables → card lists**: Products, Inventory, Orders, and Customers each render an
  antd `Table` on desktop and a card-based `List` (built from the same data and
  action handlers, not a duplicate data layer) on mobile — name/status stacked at
  the top, key numbers (price/stock/total) below, and full-width, labeled action
  buttons at the bottom (no icon-only buttons on mobile — e.g. "Delete" always has
  the word next to the icon).
- **Forms & modals**: Product add/edit, category management, order detail/payment,
  and customer reset-password modals all get `width="92%"` on mobile instead of a
  fixed desktop pixel width, `size="large"` form controls, and `block` (full-width)
  buttons. Settings' latitude/longitude fields switched from a fixed 50/50
  `Space.Compact` to `Row`/`Col` with `xs={24} sm={12}` — explicit antd breakpoint
  props, stacks on mobile, side-by-side from `sm` up.
- **Analytics**: the 3 summary `Statistic` cards go from `Col span={8}` to
  `Col xs={24} sm={8}` (stack on mobile); the date-range header wraps and the
  `RangePicker` goes full-width below the title instead of overflowing beside it;
  the chart card's `Segmented` metric toggle shortens its labels ("Revenue"/
  "Quantity" instead of "By Revenue"/"By Quantity") on mobile so it fits next to the
  card title without wrapping oddly.
- **D3 chart** (`SalesByItemChart.tsx`): margins, font size, and x-axis label
  rotation are now computed per-render from the container's actual measured width
  (already tracked via the existing `ResizeObserver`) — narrower than 480px switches
  to tighter margins, smaller (10px) labels, and a steeper -45° rotation instead of
  -25°, so labels stay legible instead of overlapping at phone widths.
- **Login page**: fixed `width: 360` swapped for `width: "100%", maxWidth: 360` plus
  page padding, so the card no longer touches the viewport edges on narrow phones.

- [x] Verified with real Playwright device-emulated viewports (not just code
  review) at all three requested widths — **360px, 390px, 414px** — for every
  screen: Login, Products, Inventory, Orders, Customers, Settings, Analytics, plus
  the Drawer nav, the product add/edit modal, and the order detail modal.
  Screenshotted each one. Populated the DB with real sample products/orders first
  (an empty-state screenshot proves nothing about card-list rendering) — 3 products
  across both categories (including one out-of-stock and one low-stock, to check the
  status-tag colors render correctly in card form) and 2 orders (one PENDING, one
  DELIVERED/COLLECTED) — then deleted all of it after verification, confirmed via a
  DB query.
- [x] `tsc --noEmit` clean, `eslint` clean on every touched file.

**Exit criteria: met, directly verified 2026-08-23.**

---

## Deferred / Phase 2+ (not in current scope)

- [ ] Razorpay online payment integration
- [ ] Barcode-based product entry/scanning
- [ ] OTP/SMS-based login (Fast2SMS or similar)
- [ ] Multi-shop / hub switching in UI
- [ ] Play Store listing
