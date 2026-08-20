-- Customers no longer authenticate via Firebase — firebaseUid becomes optional.
ALTER TABLE "User" ALTER COLUMN "firebaseUid" DROP NOT NULL;

-- Rename phone -> mobile (this is now the customer's sole identifier, not
-- just a contact field) and make it unique.
ALTER TABLE "User" RENAME COLUMN "phone" TO "mobile";
ALTER TABLE "User" ADD CONSTRAINT "User_mobile_key" UNIQUE ("mobile");

-- Delivery address fields for customer self-registration.
ALTER TABLE "User" ADD COLUMN "houseNo" TEXT;
ALTER TABLE "User" ADD COLUMN "floorNo" TEXT;
