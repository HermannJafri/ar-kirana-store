import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

export const shopRouter = Router();

shopRouter.use(authenticate);

// GET /shop - the caller's own shop
shopRouter.get("/", async (req, res) => {
  const shop = await prisma.shop.findUnique({ where: { id: req.user!.shopId } });

  if (!shop) {
    res.status(404).json({ error: "Shop not found" });
    return;
  }

  res.json(shop);
});

// PATCH /shop - update the caller's own shop (Owner only)
shopRouter.patch("/", requireRole("OWNER"), async (req, res) => {
  const { name, address, isActive, latitude, longitude, deliveryRadiusKm } = req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (address !== undefined && address !== null && typeof address !== "string") {
    res.status(400).json({ error: "address must be a string or null" });
    return;
  }
  if (isActive !== undefined && typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive must be a boolean" });
    return;
  }
  if (latitude !== undefined && latitude !== null && typeof latitude !== "number") {
    res.status(400).json({ error: "latitude must be a number or null" });
    return;
  }
  if (longitude !== undefined && longitude !== null && typeof longitude !== "number") {
    res.status(400).json({ error: "longitude must be a number or null" });
    return;
  }
  if (
    deliveryRadiusKm !== undefined &&
    (typeof deliveryRadiusKm !== "number" || deliveryRadiusKm <= 0)
  ) {
    res.status(400).json({ error: "deliveryRadiusKm must be a positive number" });
    return;
  }

  const shop = await prisma.shop.update({
    where: { id: req.user!.shopId },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(address !== undefined ? { address } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(latitude !== undefined ? { latitude } : {}),
      ...(longitude !== undefined ? { longitude } : {}),
      ...(deliveryRadiusKm !== undefined ? { deliveryRadiusKm } : {}),
    },
  });

  res.json(shop);
});
