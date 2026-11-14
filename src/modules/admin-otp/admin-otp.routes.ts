import { OtpStatus, Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { BD_MOBILE_FULL_REGEX, normalizeBdMobileInput } from "../../lib/bd-validation";
import {
  getDhakaThisMonthStartUtc,
  getDhakaThisWeekStartUtc,
  getDhakaTodayStartUtc,
  parseDateBoundary,
  parseDhakaMonthBoundary,
} from "../../lib/dates";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";
import { syncExpiredOtps } from "../otp/otp.routes";

export type OtpStatsPeriod = "today" | "week" | "month" | "all";

export interface OtpStatsResponse {
  period: OtpStatsPeriod;
  month: string | null;
  label: string;
  sent: number;
  verified: number;
  expired: number;
  failed: number;
  successRate: number;
  sentToday: number;
  verifiedToday: number;
  expiredToday: number;
  failedToday: number;
}

function normalizePeriod(raw: unknown): OtpStatsPeriod {
  if (typeof raw !== "string") return "today";
  const lower = raw.trim().toLowerCase();
  if (lower === "all" || lower === "all-time" || lower === "alltime") return "all";
  if (lower === "month" || lower === "monthly" || lower === "this-month") return "month";
  if (lower === "week" || lower === "weekly" || lower === "this-week") return "week";
  return "today";
}

const blockPhoneSchema = z.object({
  phone: z.string().trim().min(1, ERROR_MESSAGES.invalidBdPhone),
  reason: z.string().trim().max(500).nullable().optional(),
});

export const adminOtpRouter = Router();

adminOtpRouter.use(requireAdmin);

adminOtpRouter.get(
  "/otp-stats",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await syncExpiredOtps();
      const todayStart = getDhakaTodayStartUtc();

      // 1. Calculate today's stats for backward compatibility
      const todayGrouped = await prisma.otpVerification.groupBy({
        by: ["status"],
        where: { createdAt: { gte: todayStart } },
        _count: { status: true },
      });

      const todayCounts: Record<OtpStatus, number> = {
        SENT: 0,
        VERIFIED: 0,
        EXPIRED: 0,
        FAILED: 0,
        USED: 0,
      };

      for (const row of todayGrouped) {
        todayCounts[row.status] = row._count.status;
      }

      const sentToday =
        todayCounts.SENT +
        todayCounts.VERIFIED +
        todayCounts.USED +
        todayCounts.EXPIRED +
        todayCounts.FAILED;
      const verifiedToday = todayCounts.VERIFIED + todayCounts.USED;
      const expiredToday = todayCounts.EXPIRED;
      const failedToday = todayCounts.FAILED;

      // 2. Check if a specific month was requested (?month=YYYY-MM)
      const rawMonth = typeof req.query.month === "string" ? req.query.month.trim() : "";
      const monthBoundary = rawMonth ? parseDhakaMonthBoundary(rawMonth) : null;

      let period: OtpStatsPeriod = normalizePeriod(req.query.period);
      let where: Prisma.OtpVerificationWhereInput = {};
      let label = "Today";
      let selectedMonth: string | null = null;

      if (monthBoundary) {
        period = "month";
        selectedMonth = rawMonth;
        label = monthBoundary.label; // e.g. "October 2026"
        where = { createdAt: { gte: monthBoundary.startUtc, lt: monthBoundary.endUtc } };
      } else if (period === "today") {
        label = "Today";
        where = { createdAt: { gte: todayStart } };
      } else if (period === "week") {
        label = "This Week";
        const thisWeekStart = getDhakaThisWeekStartUtc();
        where = { createdAt: { gte: thisWeekStart } };
      } else if (period === "month") {
        label = "This Month";
        const thisMonthStart = getDhakaThisMonthStartUtc();
        where = { createdAt: { gte: thisMonthStart } };
      } else {
        period = "all";
        label = "All Time";
        where = {};
      }

      let sent = sentToday;
      let verified = verifiedToday;
      let expired = expiredToday;
      let failed = failedToday;

      if (monthBoundary || period !== "today") {
        const periodGrouped = await prisma.otpVerification.groupBy({
          by: ["status"],
          where,
          _count: { status: true },
        });

        const periodCounts: Record<OtpStatus, number> = {
          SENT: 0,
          VERIFIED: 0,
          EXPIRED: 0,
          FAILED: 0,
          USED: 0,
        };

        for (const row of periodGrouped) {
          periodCounts[row.status] = row._count.status;
        }

        sent =
          periodCounts.SENT +
          periodCounts.VERIFIED +
          periodCounts.USED +
          periodCounts.EXPIRED +
          periodCounts.FAILED;
        verified = periodCounts.VERIFIED + periodCounts.USED;
        expired = periodCounts.EXPIRED;
        failed = periodCounts.FAILED;
      }

      const successRate = sent > 0 ? Math.round((verified / sent) * 100) : 0;

      res.json({
        period,
        month: selectedMonth,
        label,
        sent,
        verified,
        expired,
        failed,
        successRate,
        sentToday,
        verifiedToday,
        expiredToday,
        failedToday,
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

