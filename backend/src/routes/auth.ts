import { Router } from "express";
import { firebaseAuth } from "../lib/firebaseAdmin";
import { prisma } from "../lib/prisma";

export const authRouter = Router();

// POST /auth/register - customer self-signup. The client creates the
// Firebase Auth account first (createUserWithEmailAndPassword), then calls
// this with the resulting ID token to create the matching CUSTOMER User row.
// Unlike other routes this can't use the `authenticate` middleware, which
// requires an existing User row — there isn't one yet, that's the point.
authRouter.post("/register", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }
  const idToken = header.slice("Bearer ".length);

  let decoded;
  try {
    decoded = await firebaseAuth.verifyIdToken(idToken);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
  if (existing) {
    res.status(409).json({ error: "Account already registered" });
    return;
  }

  const { name, phone } = req.body ?? {};
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
      firebaseUid: decoded.uid,
      shopId: shop.id,
      name: name.trim(),
      email: decoded.email ?? null,
      phone: typeof phone === "string" ? phone : null,
      role: "CUSTOMER",
    },
  });

  res.status(201).json({ id: user.id, shopId: user.shopId, role: user.role, name: user.name });
});
