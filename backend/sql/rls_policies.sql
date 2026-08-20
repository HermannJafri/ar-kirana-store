-- Row-Level Security for Supabase (Postgres)
-- Run this after the Prisma migration has been applied.
--
-- AUTH ARCHITECTURE (decided): all data access goes through the Express
-- backend. Flutter and Next.js never call Supabase directly — no client
-- SDK, no PostgREST, no anon key in either app. There is no Firebase→
-- Supabase JWT bridge and none is needed.
--
-- The backend verifies Firebase ID tokens itself (Admin SDK, see
-- backend/src/middleware/auth.ts) and enforces shop/role scoping in
-- Express middleware + Prisma `where` clauses. That is the ONLY
-- access-control mechanism the app relies on.
--
-- RLS here is a deny-by-default backstop, not an enforcement layer: enable
-- it on every table and add NO policies. That blocks all access via the
-- anon/authenticated Postgres roles outright (e.g. a leaked anon key, or a
-- future client library added without thinking), while the backend's own
-- Prisma connection (`DATABASE_URL`) uses a role with BYPASSRLS — Supabase's
-- default `postgres`/migration role has this — so it is unaffected.
--
-- If a genuine need for direct-from-client Supabase access ever comes up,
-- don't resurrect JWT-claim policies here — revisit the architecture
-- decision in PROJECT_PROMPT.md first.

ALTER TABLE "Shop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
