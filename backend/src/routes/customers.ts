import { Router } from "express";
import { prisma } from "../lib/prisma";
import { firebaseAuth } from "../lib/firebaseAdmin";
import { authenticate, requireRole } from "../middleware/auth";

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

  const { password } = req.body ?? {};
  if (typeof password !== "string" || password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  await firebaseAuth.updateUser(customer.firebaseUid, { password });
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
