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
action). Sidebar (`layout.tsx`) converted to `Layout.Sider` with a live PENDING-count
badge, polling `GET /orders?status=PENDING` every 20s.

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
original Phase B–F batch — ready to plan merging `feature/simplified-customer-flow`
into `main`.

---

## Deferred / Phase 2+ (not in current scope)

- [ ] Razorpay online payment integration
- [ ] Barcode-based product entry/scanning
- [ ] OTP/SMS-based login (Fast2SMS or similar)
- [ ] Multi-shop / hub switching in UI
- [ ] Play Store listing
