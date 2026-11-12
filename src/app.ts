import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import morgan from "morgan";
import { env, parseFrontendOrigins } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { adminOtpRouter } from "./modules/admin-otp/admin-otp.routes";
import { authRouter } from "./modules/auth/auth.routes";
import { formsRouter } from "./modules/forms/forms.routes";
import { adminLinksRouter, publicLinksRouter } from "./modules/links/links.routes";
import { otpRouter } from "./modules/otp/otp.routes";
import {
  adminSubmissionsRouter,
  publicSubmissionsRouter,
} from "./modules/submissions/submissions.routes";

export function createApp(): express.Express {
  const app = express();
  const allowedOrigins = parseFrontendOrigins(env.FRONTEND_URL);

  app.set("trust proxy", 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
      credentials: true,
    }),
  );

  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 300,
      standardHeaders: true,
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          success: false,
          message: "Too many requests. Please wait a few minutes and try again.",
          fieldErrors: {},
        });
      },
    }),
  );

  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.json({ ok: true, service: "igl-visa-help-api" });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/forms", formsRouter);
  app.use("/api/otp", otpRouter);
  app.use("/api/links", publicLinksRouter);
  app.use("/api/submissions", publicSubmissionsRouter);
  app.use("/api/auth", authRouter);
  app.use("/api/admin/links", adminLinksRouter);
  app.use("/api/admin", adminOtpRouter);
  app.use("/api/admin", adminSubmissionsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

