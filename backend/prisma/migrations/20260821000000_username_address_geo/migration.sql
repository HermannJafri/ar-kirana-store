-- Customer auth reverts to Firebase (username-mapped, see PROJECT_PROMPT.md
-- "Customer identity trade-off"), so mobile is no longer an identifier —
-- drop its uniqueness, keep the column as an optional contact field.
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_mobile_key";

-- Username login (customer now, staff/owner in a later phase) — mapped to a
-- username@internal.local Firebase email, never a real email.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD CONSTRAINT "User_username_key" UNIQUE ("username");

-- Customer delivery address + geo (captured via on-device GPS, validated
-- against the shop's delivery radius using Haversine distance).
ALTER TABLE "User" ADD COLUMN "area" TEXT;
ALTER TABLE "User" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "User" ADD COLUMN "longitude" DOUBLE PRECISION;

-- Shop's own location + delivery service radius, owner-configurable from
-- the dashboard.
ALTER TABLE "Shop" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "Shop" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Shop" ADD COLUMN "deliveryRadiusKm" DOUBLE PRECISION NOT NULL DEFAULT 2;
