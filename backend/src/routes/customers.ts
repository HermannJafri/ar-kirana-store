import { Router } from "express";
import { prisma } from "../lib/prisma";
import { firebaseAuth } from "../lib/firebaseAdmin";
import { authenticate, requireRole } from "../middleware/auth";

// Mirrors mobile-app/lib/services/auth_service.dart's mobileToEmail() — must
// stay byte-for-byte identical or a reset here won't line up with what the
// app actually signs in against.
function mobileToEmail(mobile: string): string {
  return `${mobile.replace(/[^0-9]/g, "")}@internal.local`;
}

export const customersRouter = Router();

customersRouter.use(authenticate);
customersRouter.use(requireRole("STAFF", "OWNER"));

const CUSTOMER_SELECT = {
  id: true,
  name: true,
  username: true,
  mobile: true,
  houseNo: true,
  floorNo: true,
  area: true,
  isActive: true,
  createdAt: true,
} as const;

// GET / - list every customer for the shop (Staff/Owner only).
customersRouter.get("/", async (req, res) => {
  const customers = await prisma.user.findMany({
    where: { shopId: req.user!.shopId, role: "CUSTOMER" },
    select: CUSTOMER_SELECT,
    orderBy: { createdAt: "desc" },
  });
  res.json(customers);
});

// PATCH /:id/reset-password - emergency password reset. There's no
// self-service "forgot password" flow (no real email, see
// PROJECT_PROMPT.md's "Customer identity trade-off"), so when a customer
// forgets their password, Staff/Owner set a brand-new one for them here via
// the Firebase Admin SDK. Nobody — including staff — can ever see a
// customer's *existing* password; Firebase never stores or exposes it.
//
// Also re-syncs the Firebase account's email to the mobile-derived one
// customers actually log in with. Accounts created before the
// username -> mobile login switch (2026-08-21) still have a
// `username@internal.local` Firebase email; resetting only the password on
// those left the customer unable to log in at all (the app looks up
// `mobile@internal.local`, a different account entirely — a real bug found
// and fixed the same day the Customers page shipped). This makes a reset
// double as the one-time migration to mobile-based login for that customer.
customersRouter.patch("/:id/reset-password", async (req, res) => {
  const customer = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.shopId !== req.user!.shopId || customer.role !== "CUSTOMER") {
    res.status(404).json({ error: "Customer not found" });
    return;
  }
  if (!customer.firebaseUid) {
    res.status(409).json({ error: "This customer has no linked login account" });
    return;
  }
  if (!customer.mobile) {
    res.status(400).json({
      error: "This customer has no mobile number on file — add one before resetting their password, since mobile number is what customers log in with.",
    });
    return;
  }

  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  try {
    await firebaseAuth.updateUser(customer.firebaseUid, {
      email: mobileToEmail(customer.mobile),
      password,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "auth/email-already-exists") {
      res.status(409).json({
        error:
          "Another login account already uses this mobile number (likely a duplicate customer row or an orphaned signup attempt). Resolve that first, then reset again.",
      });
      return;
    }
    throw e;
  }
  res.json({ success: true });
});

// DELETE /:id - permanently remove a customer (Owner only — more
// destructive than the rest of this router's Staff+Owner actions, so held
// to the same bar as other irreversible account operations). Blocked if the
// customer has any orders on record: hard-deleting them would either fail
// on the FK constraint or (if cascaded) destroy real order/revenue history,
// neither of which is what "delete this customer" should silently do.
customersRouter.delete("/:id", requireRole("OWNER"), async (req, res) => {
  const customer = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!customer || customer.shopId !== req.user!.shopId || customer.role !== "CUSTOMER") {
    res.status(404).json({ error: "Customer not found" });
    return;
  }

  const orderCount = await prisma.order.count({ where: { customerId: customer.id } });
  if (orderCount > 0) {
    res.status(409).json({
      error: `Cannot delete — this customer has ${orderCount} order${orderCount === 1 ? "" : "s"} on record. Deleting them would destroy real order history.`,
    });
    return;
  }

  if (customer.firebaseUid) {
    try {
      await firebaseAuth.deleteUser(customer.firebaseUid);
    } catch {
      // Firebase account may already be gone/inconsistent — don't let that
      // block cleaning up the database row.
    }
  }

  await prisma.user.delete({ where: { id: customer.id } });
  res.status(204).send();
});
