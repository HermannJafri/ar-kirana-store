import "dotenv/config";
import express from "express";
import cors from "cors";
import { prisma } from "./lib/prisma";
import { productsRouter } from "./routes/products";
import { meRouter } from "./routes/me";
import { shopRouter } from "./routes/shop";
import { uploadsRouter } from "./routes/uploads";
import { authRouter } from "./routes/auth";
import { ordersRouter } from "./routes/orders";
import { categoriesRouter } from "./routes/categories";

const app = express();
app.use(cors());
app.use(express.json());

app.use("/products", productsRouter);
app.use("/me", meRouter);
app.use("/shop", shopRouter);
app.use("/uploads", uploadsRouter);
app.use("/auth", authRouter);
app.use("/orders", ordersRouter);
app.use("/categories", categoriesRouter);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
