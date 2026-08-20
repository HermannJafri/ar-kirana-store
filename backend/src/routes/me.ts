import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate } from "../middleware/auth";

export const meRouter = Router();

meRouter.use(authenticate);

// GET /me - the caller's own profile, used by frontends for role-based routing.
meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, shopId: true, role: true, name: true, email: true, isActive: true },
  });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});
