import { RequestHandler } from "express";
import { UserRole } from "@prisma/client";
import { firebaseAuth } from "../lib/firebaseAdmin";
import { prisma } from "../lib/prisma";

export interface AuthenticatedUser {
  id: string;
  shopId: string;
  role: UserRole;
}

// Verifies the Firebase ID token on every request, resolves it to a User
// row, and attaches { id, shopId, role } to req.user. This is the primary
// access-control gate — see backend/sql/rls_policies.sql for why RLS is
// secondary for backend-routed traffic.
export const authenticate: RequestHandler = async (req, res, next) => {
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

  const user = await prisma.user.findUnique({
    where: { firebaseUid: decoded.uid },
    select: { id: true, shopId: true, role: true, isActive: true },
  });

  if (!user || !user.isActive) {
    res.status(403).json({ error: "No active account for this token" });
    return;
  }

  req.user = { id: user.id, shopId: user.shopId, role: user.role };
  next();
};

// Chain after `authenticate` to restrict a route to specific roles, e.g.
// router.post("/staff", authenticate, requireRole("OWNER"), handler)
export const requireRole = (...roles: UserRole[]): RequestHandler => {
  return (req, res, next) => {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }
    next();
  };
};
