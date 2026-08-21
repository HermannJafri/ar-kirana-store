-- Simplify order status flow (drop PICKING/PACKED), remove the DELIVERY
-- role and delivery-boy tracking entirely (payment is confirmed at the shop
-- by Owner/Staff, not by a delivery-side action), and add partial-payment
-- tracking (Order.amountPaid, PaymentStatus.PARTIAL).

-- 1. Order status: fold the two removed intermediate stages into CONFIRMED
-- before shrinking the enum, so no existing row is left pointing at a value
-- that's about to stop existing.
UPDATE "Order" SET "status" = 'CONFIRMED' WHERE "status" IN ('PICKING', 'PACKED');

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
DROP TYPE "OrderStatus";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- 2. Remove the DELIVERY role (no rows use it — verified against the live
-- DB before writing this migration).
CREATE TYPE "UserRole_new" AS ENUM ('CUSTOMER', 'STAFF', 'OWNER');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING ("role"::text::"UserRole_new");
DROP TYPE "UserRole";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";

-- 3. Drop delivery-boy tracking on Order.
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_deliveryBoyId_fkey";
DROP INDEX IF EXISTS "Order_deliveryBoyId_idx";
ALTER TABLE "Order" DROP COLUMN "deliveryBoyId";

-- 4. Drop packedAt (its status no longer exists).
ALTER TABLE "Order" DROP COLUMN "packedAt";

-- 5. Partial payment tracking.
ALTER TABLE "Order" ADD COLUMN "amountPaid" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIAL';
