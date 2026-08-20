import { Router } from "express";
import { firebaseAuth } from "../lib/firebaseAdmin";
import { prisma } from "../lib/prisma";

export const authRouter = Router();

// POST /auth/register - customer signup. The client creates the Firebase
// Auth account first (createUserWithEmailAndPassword against a synthetic
// `username@internal.local` email — see PROJECT_PROMPT.md "Customer
// identity trade-off"), then calls this with the resulting ID token plus a
// display name and username to create the matching CUSTOMER User row.
// Can't use the `authenticate` middleware here — there's no User row yet
// for it to find.
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

  const { name, username, mobile } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof username !== "string" || username.trim().length < 3) {
    res.status(400).json({ error: "username must be at least 3 characters" });
    return;
  }

  const usernameTaken = await prisma.user.findUnique({ where: { username: username.trim() } });
  if (usernameTaken) {
    res.status(409).json({ error: "That username is already taken" });
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
      username: username.trim(),
      mobile: typeof mobile === "string" && mobile.trim() ? mobile.trim() : null,
      role: "CUSTOMER",
    },
  });

  res.status(201).json({
    id: user.id,
    name: user.name,
    username: user.username,
    mobile: user.mobile,
    shopId: user.shopId,
    role: user.role,
    houseNo: user.houseNo,
    floorNo: user.floorNo,
    area: user.area,
    latitude: user.latitude,
    longitude: user.longitude,
  });
});
