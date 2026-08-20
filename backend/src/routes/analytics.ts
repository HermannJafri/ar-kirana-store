import { Router } from "express";
import { OrderStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

export const analyticsRouter = Router();

analyticsRouter.use(authenticate);

const DAY_MS = 24 * 60 * 60 * 1000;

// "Sales" here means demand, not recognized revenue: every order the shop
// actually has to fulfil counts, from the moment it's placed, since a small
// kirana owner wants to see what's moving *now* rather than wait for
// delivery to close the loop days later. Only CANCELLED is excluded — that
// order never happened. (A stricter accounting view would count only
// DELIVERED orders once payment is actually collected; we're optimizing for
// "what should I restock" over "what did I definitely get paid for".)
analyticsRouter.get("/sales", requireRole("OWNER"), async (req, res) => {
  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * DAY_MS);

  const from = typeof req.query.from === "string" ? new Date(req.query.from) : defaultFrom;
  const to = typeof req.query.to === "string" ? new Date(req.query.to) : now;

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    res.status(400).json({ error: "Invalid from/to date" });
    return;
  }

  // Treat `to` as inclusive of the whole day when it's a bare date (e.g. a
  // date picker sending "2026-08-21").
  const toInclusive = new Date(to.getTime() + DAY_MS - 1);

  const orders = await prisma.order.findMany({
    where: {
      shopId: req.user!.shopId,
      status: { not: OrderStatus.CANCELLED },
      createdAt: { gte: from, lte: toInclusive },
    },
    include: { items: { include: { product: true } } },
  });

  const totalRevenue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
  const orderCount = orders.length;
  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;

  const byProduct = new Map<string, { productId: string; productName: string; quantity: number; revenue: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const existing = byProduct.get(item.productId);
      const lineRevenue = Number(item.priceAtOrder) * item.quantity;
      if (existing) {
        existing.quantity += item.quantity;
        existing.revenue += lineRevenue;
      } else {
        byProduct.set(item.productId, {
          productId: item.productId,
          productName: item.product.name,
          quantity: item.quantity,
          revenue: lineRevenue,
        });
      }
    }
  }

  res.json({
    from: from.toISOString(),
    to: toInclusive.toISOString(),
    summary: { totalRevenue, orderCount, avgOrderValue },
    byProduct: Array.from(byProduct.values()).sort((a, b) => b.revenue - a.revenue),
  });
});
