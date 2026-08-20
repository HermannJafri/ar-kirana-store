import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { identify, requireRole } from "../middleware/auth";

export const ordersRouter = Router();

// Customers place orders via X-Customer-Id, not a Firebase token — `identify`
// supports both that and Staff/Owner/Delivery's Firebase Bearer token.
ordersRouter.use(identify);

interface OrderItemInput {
  productId: string;
  quantity: number;
}

// POST /orders - place an order (Customer only). This is the one operation
// that must go through the backend rather than a direct client read/write —
// it needs an atomic stock-check-and-decrement to avoid two customers
// ordering the last unit at once (see PROJECT_PROMPT.md).
ordersRouter.post("/", requireRole("CUSTOMER"), async (req, res) => {
  const { items, deliveryAddress, notes } = req.body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items must be a non-empty array" });
    return;
  }
  for (const item of items as OrderItemInput[]) {
    if (
      typeof item.productId !== "string" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      res.status(400).json({ error: "each item needs productId and a positive integer quantity" });
      return;
    }
  }

  try {
    const order = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const orderItemsData: Prisma.OrderItemUncheckedCreateWithoutOrderInput[] = [];

      for (const item of items as OrderItemInput[]) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || product.shopId !== req.user!.shopId || !product.isAvailable) {
          throw new Error(`Product ${item.productId} is not available`);
        }
        if (product.quantityAvailable < item.quantity) {
          throw new Error(`Insufficient stock for ${product.name}`);
        }

        await tx.product.update({
          where: { id: product.id },
          data: { quantityAvailable: { decrement: item.quantity } },
        });

        totalAmount += Number(product.price) * item.quantity;
        orderItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          priceAtOrder: product.price,
        });
      }

      return tx.order.create({
        data: {
          shopId: req.user!.shopId,
          customerId: req.user!.id,
          totalAmount,
          deliveryAddress: typeof deliveryAddress === "string" ? deliveryAddress : null,
          notes: typeof notes === "string" ? notes : null,
          items: { create: orderItemsData },
        },
        include: { items: { include: { product: true } } },
      });
    });

    res.status(201).json(order);
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});
