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
import { analyticsRouter } from "./routes/analytics";
import { customersRouter } from "./routes/customers";

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
app.use("/analytics", analyticsRouter);
app.use("/customers", customersRouter);

// Keep-alive strategy for Render's free tier (spins down after ~15 min
// idle): point an external uptime monitor (e.g. UptimeRobot, free tier,
// ~5 min interval) at this URL rather than building a self-ping/setInterval
// inside the process — a ping from inside the same process that's spinning
// down doesn't prevent the spin-down, and only an external request actually
// counts as traffic. Deliberately GET, unauthenticated, and a single trivial
// query, so it's cheap enough to hit every few minutes indefinitely.
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
