import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, requireRole } from "../middleware/auth";

export const categoriesRouter = Router();

categoriesRouter.use(authenticate);

// GET /categories - list all categories for the caller's own shop. Any
// authenticated role can read (Customer needs this for catalog filtering).
categoriesRouter.get("/", async (req, res) => {
  const categories = await prisma.category.findMany({
    where: { shopId: req.user!.shopId },
    orderBy: { name: "asc" },
  });
  res.json(categories);
});

// POST /categories - create a category (Staff/Owner only)
categoriesRouter.post("/", requireRole("STAFF", "OWNER"), async (req, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const existing = await prisma.category.findUnique({
    where: { shopId_name: { shopId: req.user!.shopId, name: name.trim() } },
  });
  if (existing) {
    res.status(409).json({ error: "A category with that name already exists" });
    return;
  }

  const category = await prisma.category.create({
    data: { shopId: req.user!.shopId, name: name.trim() },
  });
  res.status(201).json(category);
});

// PATCH /categories/:id - rename a category (Staff/Owner only)
categoriesRouter.patch("/:id", requireRole("STAFF", "OWNER"), async (req, res) => {
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.shopId !== req.user!.shopId) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  const { name } = req.body ?? {};
  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const category = await prisma.category.update({
    where: { id: req.params.id },
    data: { name: name.trim() },
  });
  res.json(category);
});

// DELETE /categories/:id - remove a category (Staff/Owner only). Products
// referencing it fall back to uncategorized (categoryId -> null via the
// schema's onDelete: SetNull), not deleted.
categoriesRouter.delete("/:id", requireRole("STAFF", "OWNER"), async (req, res) => {
  const existing = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!existing || existing.shopId !== req.user!.shopId) {
    res.status(404).json({ error: "Category not found" });
    return;
  }

  await prisma.category.delete({ where: { id: req.params.id } });
  res.status(204).send();
});
