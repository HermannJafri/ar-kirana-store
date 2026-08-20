import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";
import { haversineDistanceKm } from "../lib/geo";

export const meRouter = Router();

meRouter.use(authenticate);

const ME_SELECT = {
  id: true,
  shopId: true,
  role: true,
  name: true,
  email: true,
  username: true,
  mobile: true,
  houseNo: true,
  floorNo: true,
  area: true,
  latitude: true,
  longitude: true,
  isActive: true,
} as const;

// GET /me - the caller's own profile. Frontends use `latitude`/`longitude`
// being null to decide whether a Customer still needs the address form.
meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: ME_SELECT });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(user);
});

// POST /me/address - Customer submits their delivery address, captured via
// on-device GPS (no geocoding API — the client sends raw lat/lng). Rejected
// with a plain message, never raw coordinates/distance, if it falls outside
// the shop's delivery radius (Haversine distance, see lib/geo.ts).
//
// If the shop hasn't set its own location yet, every address is accepted —
// there's nothing to validate against, and blocking every customer because
// the owner hasn't configured the dashboard yet would be worse than the
// alternative of accepting some addresses that later turn out to be out of
// range (correctable manually).
meRouter.post("/address", requireRole("CUSTOMER"), async (req, res) => {
  const { houseNo, floorNo, area, latitude, longitude } = req.body ?? {};

  if (typeof latitude !== "number" || typeof longitude !== "number") {
    res.status(400).json({ error: "A device location is required" });
    return;
  }

  const shop = await prisma.shop.findUnique({ where: { id: req.user!.shopId } });
  if (!shop) {
    res.status(404).json({ error: "Shop not found" });
    return;
  }

  if (shop.latitude != null && shop.longitude != null) {
    const distanceKm = haversineDistanceKm(latitude, longitude, shop.latitude, shop.longitude);
    if (distanceKm > shop.deliveryRadiusKm) {
      res.status(422).json({ error: "Delivery isn't available at this address yet" });
      return;
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      houseNo: typeof houseNo === "string" && houseNo.trim() ? houseNo.trim() : null,
      floorNo: typeof floorNo === "string" && floorNo.trim() ? floorNo.trim() : null,
      area: typeof area === "string" && area.trim() ? area.trim() : null,
      latitude,
      longitude,
    },
    select: ME_SELECT,
  });

  res.json(user);
});
