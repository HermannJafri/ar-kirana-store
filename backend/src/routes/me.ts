import { Router } from "express";
import { prisma } from "../lib/prisma";
import { identify } from "../middleware/auth";

export const meRouter = Router();

// Shared by Staff/Owner (Firebase) and Customer (X-Customer-Id) — both just
// want "who am I" for their own frontend's routing logic.
meRouter.use(identify);

// GET /me - the caller's own profile.
meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      shopId: true,
      role: true,
      name: true,
      email: true,
      mobile: true,
      houseNo: true,
      floorNo: true,
      isActive: true,
    },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});
