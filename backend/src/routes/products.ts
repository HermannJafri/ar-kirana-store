import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, identify, requireRole } from "../middleware/auth";

export const productsRouter = Router();

// GET is shared with Customers (browsing), so it uses `identify` rather than
// the router-level Firebase-only `authenticate` the mutations below use.
productsRouter.get("/", identify, async (req, res) => {
  const products = await prisma.product.findMany({
    where: { shopId: req.user!.shopId },
    orderBy: { createdAt: "desc" },
  });
  res.json(products);
});

// POST /products - create a product in the caller's own shop (Staff/Owner only)
productsRouter.post("/", authenticate, requireRole("STAFF", "OWNER"), async (req, res) => {
  const { name, description, imageUrl, price, unit, quantityAvailable, isAvailable } =
    req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    res.status(400).json({ error: "price must be a non-negative number" });
    return;
  }

  const qty = Number.isInteger(quantityAvailable) ? quantityAvailable : 0;
  if (qty < 0) {
    res.status(400).json({ error: "quantityAvailable must be a non-negative integer" });
    return;
  }

  const product = await prisma.product.create({
    data: {
      shopId: req.user!.shopId,
      name: name.trim(),
      description: typeof description === "string" ? description : null,
      imageUrl: typeof imageUrl === "string" ? imageUrl : null,
      price: priceNum,
      unit: typeof unit === "string" ? unit : null,
      quantityAvailable: qty,
      isAvailable: typeof isAvailable === "boolean" ? isAvailable : true,
    },
  });

  res.status(201).json(product);
});

// PATCH /products/:id - update a product in the caller's own shop (Staff/Owner only)
productsRouter.patch("/:id", authenticate, requireRole("STAFF", "OWNER"), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.shopId !== req.user!.shopId) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const { name, description, imageUrl, price, unit, quantityAvailable, isAvailable } =
    req.body ?? {};

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "name must be a non-empty string" });
    return;
  }
  if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
    res.status(400).json({ error: "price must be a non-negative number" });
    return;
  }
  if (
    quantityAvailable !== undefined &&
    (!Number.isInteger(quantityAvailable) || quantityAvailable < 0)
  ) {
    res.status(400).json({ error: "quantityAvailable must be a non-negative integer" });
    return;
  }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
      ...(price !== undefined ? { price: Number(price) } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(quantityAvailable !== undefined ? { quantityAvailable } : {}),
      ...(isAvailable !== undefined ? { isAvailable } : {}),
    },
  });

  res.json(product);
});

// DELETE /products/:id - deactivate a product in the caller's own shop (Staff/Owner only).
// Soft delete only (isAvailable = false), matching the User.isActive pattern — never
// hard-deleted since historical OrderItems reference products by id.
productsRouter.delete("/:id", authenticate, requireRole("STAFF", "OWNER"), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.shopId !== req.user!.shopId) {
    res.status(404).json({ error: "Product not found" });
    return;
  }

  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { isAvailable: false },
  });

  res.json(product);
});
