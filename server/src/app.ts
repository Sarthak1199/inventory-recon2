import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import dotenv from "dotenv";
import { pool } from "../db/pool.js";
import { authRouter } from "./routes/auth.js";
import { branchesRouter } from "./routes/branches.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { vendorsRouter } from "./routes/vendors.js";
import { itemsRouter } from "./routes/items.js";
import { purchaseOrdersRouter } from "./routes/purchaseOrders.js";
import { grnsRouter } from "./routes/grns.js";
import { dashboardRouter } from "./routes/dashboard.js";

dotenv.config();

const PgSession = connectPgSimple(session);

const isProduction = process.env.NODE_ENV === "production";

export const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET ?? "dev_secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      secure: isProduction,
    },
  })
);
app.use("/uploads", express.static(process.env.UPLOADS_DIR ?? "./uploads"));

app.use("/api/auth", authRouter);
app.use("/api/branches", branchesRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/vendors", vendorsRouter);
app.use("/api/items", itemsRouter);
app.use("/api/purchase-orders", purchaseOrdersRouter);
app.use("/api/grns", grnsRouter);
app.use("/api/dashboard", dashboardRouter);

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
