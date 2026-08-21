import { Router } from "express";
import { Prisma, OrderStatus, PaymentStatus } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

export const ordersRouter = Router();

ordersRouter.use(authenticate);

const ORDER_INCLUDE = {
  items: { include: { product: true } },
  customer: {
    select: { id: true, name: true, mobile: true, houseNo: true, floorNo: true, area: true },
  },
} as const;

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
        include: ORDER_INCLUDE,
      });
    });

    res.status(201).json(order);
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

// GET /orders - Customer sees their own orders; Staff/Owner see every order
// for the shop (optionally filtered by ?status= and/or ?paymentStatus=).
// Newest first either way.
ordersRouter.get("/", async (req, res) => {
  const { status, paymentStatus } = req.query;
  const statusFilter =
    typeof status === "string" && status in OrderStatus ? (status as OrderStatus) : undefined;
  const paymentStatusFilter =
    typeof paymentStatus === "string" && paymentStatus in PaymentStatus
      ? (paymentStatus as PaymentStatus)
      : undefined;

  const filters = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(paymentStatusFilter ? { paymentStatus: paymentStatusFilter } : {}),
  };

  const where =
    req.user!.role === "CUSTOMER"
      ? { customerId: req.user!.id, ...filters }
      : { shopId: req.user!.shopId, ...filters };

  const orders = await prisma.order.findMany({
    where,
    include: ORDER_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  res.json(orders);
});

// GET /orders/:id - a Customer can view their own order; Staff/Owner can
// view any order in their shop.
ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: ORDER_INCLUDE,
  });

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  const isOwnCustomerOrder = req.user!.role === "CUSTOMER" && order.customerId === req.user!.id;
  const isShopStaff =
    (req.user!.role === "STAFF" || req.user!.role === "OWNER") && order.shopId === req.user!.shopId;
  if (!isOwnCustomerOrder && !isShopStaff) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(order);
});

// Valid forward transitions. CANCELLED is reachable from any status up to
// (not including) OUT_FOR_DELIVERY, per PROJECT_PROMPT.md's status flow.
// DELIVERED is a plain Staff/Owner action here — there's no separate
// delivery role/login in this app, so whoever brings the order back marks
// it delivered (and records payment, see PATCH /:id/payment) from the
// dashboard themselves.
const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  PENDING: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  CONFIRMED: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED],
  OUT_FOR_DELIVERY: [OrderStatus.DELIVERED],
};

const STATUS_TIMESTAMP_FIELD: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: "confirmedAt",
  OUT_FOR_DELIVERY: "outForDeliveryAt",
  DELIVERED: "deliveredAt",
  CANCELLED: "cancelledAt",
};

// PATCH /orders/:id/status - advance an order's status (Staff/Owner only).
ordersRouter.patch("/:id/status", requireRole("STAFF", "OWNER"), async (req, res) => {
  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.shopId !== req.user!.shopId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const { status } = req.body ?? {};
  if (typeof status !== "string" || !(status in OrderStatus)) {
    res.status(400).json({ error: "Invalid status" });
    return;
  }

  const allowed = NEXT_STATUS[existing.status] ?? [];
  if (!allowed.includes(status as OrderStatus)) {
    res.status(409).json({ error: `Cannot move an order from ${existing.status} to ${status}` });
    return;
  }

  const timestampField = STATUS_TIMESTAMP_FIELD[status as OrderStatus];

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      status: status as OrderStatus,
      ...(timestampField ? { [timestampField]: new Date() } : {}),
    },
    include: ORDER_INCLUDE,
  });

  res.json(order);
});

function computePaymentStatus(amountPaid: number, totalAmount: number): PaymentStatus {
  if (amountPaid <= 0) return PaymentStatus.PENDING;
  if (amountPaid >= totalAmount) return PaymentStatus.COLLECTED;
  return PaymentStatus.PARTIAL;
}

// PATCH /orders/:id/payment - record cash physically brought back to the
// shop (Staff/Owner only). There's no delivery-side action for this — see
// PROJECT_PROMPT.md's "no separate delivery role" note. `amount` is added to
// the running `amountPaid` total, so a part-paid order can be topped up
// across multiple visits; paymentStatus is derived, never set directly.
ordersRouter.patch("/:id/payment", requireRole("STAFF", "OWNER"), async (req, res) => {
  const existing = await prisma.order.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.shopId !== req.user!.shopId) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const { amount } = req.body ?? {};
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: "amount must be a positive number" });
    return;
  }

  const newAmountPaid = Number(existing.amountPaid) + amount;
  const totalAmount = Number(existing.totalAmount);

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      amountPaid: newAmountPaid,
      paymentStatus: computePaymentStatus(newAmountPaid, totalAmount),
    },
    include: ORDER_INCLUDE,
  });

  res.json(order);
});
