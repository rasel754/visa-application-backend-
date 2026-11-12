import { OtpStatus, Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { BD_MOBILE_FULL_REGEX, normalizeBdMobileInput } from "../../lib/bd-validation";
import { getDhakaTodayStartUtc, parseDateBoundary } from "../../lib/dates";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { syncExpiredOtps } from "../otp/otp.routes";

const blockPhoneSchema = z.object({
  phone: z.string().trim().min(1, ERROR_MESSAGES.invalidBdPhone),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const adminOtpRouter = Router();

adminOtpRouter.use(requireAdmin);

adminOtpRouter.get(
  "/otp-stats",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await syncExpiredOtps();
      const todayStart = getDhakaTodayStartUtc();

      const grouped = await prisma.otpVerification.groupBy({
        by: ["status"],
        where: { createdAt: { gte: todayStart } },
        _count: { status: true },
      });

      const counts: Record<OtpStatus, number> = {
        SENT: 0,
        VERIFIED: 0,
        EXPIRED: 0,
        FAILED: 0,
        USED: 0,
      };

      for (const row of grouped) {
        counts[row.status] = row._count.status;
      }

      const sentToday =
        counts.SENT + counts.VERIFIED + counts.USED + counts.EXPIRED + counts.FAILED;
      const verifiedToday = counts.VERIFIED + counts.USED;
      const expiredToday = counts.EXPIRED;
      const failedToday = counts.FAILED;
      const successRate =
        sentToday > 0 ? Math.round((verifiedToday / sentToday) * 100) : 0;

      res.json({
        sentToday,
        verifiedToday,
        expiredToday,
        failedToday,
        successRate,
      });
    } catch (err) {
      next(err);
    }
  },
);

adminOtpRouter.get(
  "/otp-logs",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await syncExpiredOtps();

      const phone = typeof req.query.phone === "string" ? req.query.phone.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const date = typeof req.query.date === "string" ? req.query.date.trim() : "";

      const parsedPage = Number.parseInt(String(req.query.page ?? "1"), 10);
      const parsedLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 100)
          : 20;

      const where: Prisma.OtpVerificationWhereInput = {};

      if (phone) {
        where.phone = { contains: phone };
      }

      if (
        status &&
        (["SENT", "VERIFIED", "EXPIRED", "FAILED", "USED"] as string[]).includes(status)
      ) {
        where.status = status as OtpStatus;
      }

      if (date) {
        const start = parseDateBoundary(date, false);
        const end = parseDateBoundary(date, true);
        if (start && end) {
          where.createdAt = { gte: start, lte: end };
        }
      }

      const [total, rows, blockedRows] = await Promise.all([
        prisma.otpVerification.count({ where }),
        prisma.otpVerification.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            phone: true,
            status: true,
            gatewayRef: true,
            attempts: true,
            expiresAt: true,
            verifiedAt: true,
            usedAt: true,
            createdAt: true,
            submission: {
              select: {
                id: true,
                reference: true,
              },
            },
          },
        }),
        prisma.blockedPhone.findMany({
          select: { phone: true },
        }),
      ]);

      const blockedSet = new Set(blockedRows.map((b) => b.phone));

      const items = rows.map((row) => ({
        id: row.id,
        phone: row.phone,
        status: row.status,
        gatewayRef: row.gatewayRef ?? null,
        attempts: row.attempts,
        expiresAt: row.expiresAt,
        verifiedAt: row.verifiedAt,
        usedAt: row.usedAt,
        createdAt: row.createdAt,
        submissionId: row.submission?.id ?? null,
        submissionReference: row.submission?.reference ?? null,
        isBlocked: blockedSet.has(row.phone),
      }));

      res.json({
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      next(err);
    }
  },
);

adminOtpRouter.get(
  "/blocked-phones",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const items = await prisma.blockedPhone.findMany({
        orderBy: { createdAt: "desc" },
      });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
);

adminOtpRouter.post(
  "/blocked-phones",
  validateBody(blockPhoneSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone: rawPhone, reason } = req.body as z.infer<typeof blockPhoneSchema>;
      const normalizedPhone = normalizeBdMobileInput(rawPhone);

      if (!BD_MOBILE_FULL_REGEX.test(normalizedPhone)) {
        next(
          new AppError(400, ERROR_MESSAGES.invalidBdPhone, {
            phone: ERROR_MESSAGES.invalidBdPhone,
          }),
        );
        return;
      }

      const existing = await prisma.blockedPhone.findUnique({
        where: { phone: normalizedPhone },
        select: { id: true },
      });
      if (existing) {
        next(
          new AppError(400, ERROR_MESSAGES.phoneAlreadyBlocked, {
            phone: ERROR_MESSAGES.phoneAlreadyBlocked,
          }),
        );
        return;
      }

      const cleanReason = reason?.trim() || null;
      const created = await prisma.blockedPhone.create({
        data: {
          phone: normalizedPhone,
          reason: cleanReason,
        },
      });

      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  },
);

adminOtpRouter.delete(
  "/blocked-phones/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const existing = await prisma.blockedPhone.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      await prisma.blockedPhone.delete({ where: { id } });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

