import { Router } from "express";
import { prisma } from "../lib/prisma";

export const authRouter = Router();

// POST /auth/register - customer identification, no Firebase, no password.
// Trade-off documented in PROJECT_PROMPT.md ("Customer identity trade-off"):
// mobile number is the sole identifier, acceptable only for a small/trusted
// customer base.
//
// Behaves as find-or-create by mobile: a returning customer (e.g. after
// reinstalling the app, which clears the device's secure storage) who
// re-enters the same mobile number gets their existing account and id back
// rather than a uniqueness error.
authRouter.post("/register", async (req, res) => {
  const { name, mobile, houseNo, floorNo } = req.body ?? {};

  if (typeof mobile !== "string" || mobile.trim().length < 6) {
    res.status(400).json({ error: "A valid mobile number is required" });
    return;
  }
  const trimmedMobile = mobile.trim();

  const existing = await prisma.user.findUnique({ where: { mobile: trimmedMobile } });
  if (existing) {
    if (existing.role !== "CUSTOMER") {
      res.status(409).json({ error: "This mobile number is already registered to a staff account" });
      return;
    }
    res.status(200).json({
      id: existing.id,
      name: existing.name,
      mobile: existing.mobile,
      shopId: existing.shopId,
      role: existing.role,
      houseNo: existing.houseNo,
      floorNo: existing.floorNo,
    });
    return;
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  // Single-shop MVP (see PROJECT_PROMPT.md): every new customer attaches to
  // the one existing shop. Revisit once multi-shop UI exists.
  const shop = await prisma.shop.findFirst({ orderBy: { createdAt: "asc" } });
  if (!shop) {
    res.status(503).json({ error: "No shop configured yet" });
    return;
  }

  const user = await prisma.user.create({
    data: {
      shopId: shop.id,
      name: name.trim(),
      mobile: trimmedMobile,
      houseNo: typeof houseNo === "string" && houseNo.trim() ? houseNo.trim() : null,
      floorNo: typeof floorNo === "string" && floorNo.trim() ? floorNo.trim() : null,
      role: "CUSTOMER",
    },
  });

  res.status(201).json({
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    shopId: user.shopId,
    role: user.role,
    houseNo: user.houseNo,
    floorNo: user.floorNo,
  });
});
