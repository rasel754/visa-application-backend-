import crypto from "node:crypto";
import { OtpStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { BD_MOBILE_FULL_REGEX, normalizeBdMobileInput } from "../../lib/bd-validation";
import { getDhakaTodayStartUtc } from "../../lib/dates";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { formatOtpSmsMessage, sendSms } from "../../lib/sms";
import { signOtpToken } from "../../lib/tokens";
import { validateBody } from "../../middleware/validate";

const SEND_WINDOW_MS = 15 * 60 * 1000;
const MAX_SENDS_PER_PHONE_WINDOW = 3;

const sendOtpSchema = z.object({
  phone: z.string().trim().min(1, ERROR_MESSAGES.invalidBdPhone),
});

const verifyOtpSchema = z.object({
  phone: z.string().trim().min(1, ERROR_MESSAGES.invalidBdPhone),
  code: z.string().trim().regex(/^\d{6}$/, ERROR_MESSAGES.otpWrong),
});

const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: ERROR_MESSAGES.otpRateLimit,
      fieldErrors: {},
    });
  },
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: ERROR_MESSAGES.otpRateLimit,
      fieldErrors: {},
    });
  },
});

export async function syncExpiredOtps(): Promise<void> {
  await prisma.otpVerification.updateMany({
    where: {
      status: OtpStatus.SENT,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: OtpStatus.EXPIRED,
    },
  });
}

export const otpRouter = Router();

otpRouter.post(
  "/send",
  otpSendLimiter,
  validateBody(sendOtpSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone: rawPhone } = req.body as z.infer<typeof sendOtpSchema>;
      const normalizedPhone = normalizeBdMobileInput(rawPhone);

      if (!BD_MOBILE_FULL_REGEX.test(normalizedPhone)) {
        next(
          new AppError(400, ERROR_MESSAGES.invalidBdPhone, {
            phone: ERROR_MESSAGES.invalidBdPhone,
          }),
        );
        return;
      }

      const blocked = await prisma.blockedPhone.findUnique({
        where: { phone: normalizedPhone },
        select: { id: true },
      });
      if (blocked) {
        next(new AppError(403, ERROR_MESSAGES.otpPhoneBlocked));
        return;
      }

      // Requirement 3: One user can get OTP 3 times per day (handled in backend)
      const todayStart = getDhakaTodayStartUtc();
      const dailyCount = await prisma.otpVerification.count({
        where: {
          phone: normalizedPhone,
          createdAt: { gte: todayStart },
          status: { not: OtpStatus.FAILED },
        },
      });

      if (dailyCount >= 3) {
        next(new AppError(429, ERROR_MESSAGES.otpDailyLimit));
        return;
      }

      // Requirement 2: User can't get/resend OTP while existing OTP is not expired (handled in backend)
      const activeOtp = await prisma.otpVerification.findFirst({
        where: {
          phone: normalizedPhone,
          status: OtpStatus.SENT,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: "desc" },
      });

      if (activeOtp) {
        const remainingSeconds = Math.max(
          1,
          Math.ceil((activeOtp.expiresAt.getTime() - Date.now()) / 1000),
        );
        next(
          new AppError(400, ERROR_MESSAGES.otpStillActive, {
            remainingSeconds: String(remainingSeconds),
          }),
        );
        return;
      }

      const otpCode = crypto.randomInt(100000, 1000000).toString();
      const codeHash = await bcrypt.hash(otpCode, 10);
      const message = formatOtpSmsMessage(otpCode);

      const smsResult = await sendSms(normalizedPhone, message);

      if (!smsResult.ok) {
        await prisma.otpVerification.create({
          data: {
            phone: normalizedPhone,
            codeHash,
            status: OtpStatus.FAILED,
            gatewayRef: null,
            expiresAt: new Date(),
          },
        });
        next(new AppError(502, ERROR_MESSAGES.otpSmsFailed));
        return;
      }

      const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60 * 1000);

      await prisma.$transaction([
        prisma.otpVerification.updateMany({
          where: {
            phone: normalizedPhone,
            status: OtpStatus.SENT,
          },
          data: {
            status: OtpStatus.EXPIRED,
          },
        }),
        prisma.otpVerification.create({
          data: {
            phone: normalizedPhone,
            codeHash,
            status: OtpStatus.SENT,
            gatewayRef: smsResult.gatewayMessageId ?? null,
            expiresAt,
          },
        }),
      ]);

      const isDevFallback =
        Boolean(smsResult.devFallback) && env.NODE_ENV !== "production";

      res.json({
        sent: true,
        expiresInSeconds: env.OTP_EXPIRY_MINUTES * 60,
        dailyRemaining: Math.max(0, 3 - (dailyCount + 1)),
        ...(isDevFallback ? { devOtp: otpCode } : {}),
      });
    } catch (err) {
      next(err);
    }
  },
);

otpRouter.post(
  "/verify",
  otpVerifyLimiter,
  validateBody(verifyOtpSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { phone: rawPhone, code } = req.body as z.infer<typeof verifyOtpSchema>;
      const normalizedPhone = normalizeBdMobileInput(rawPhone);

      if (!BD_MOBILE_FULL_REGEX.test(normalizedPhone)) {
        next(
          new AppError(400, ERROR_MESSAGES.invalidBdPhone, {
            phone: ERROR_MESSAGES.invalidBdPhone,
          }),
        );
        return;
      }

      const record = await prisma.otpVerification.findFirst({
        where: {
          phone: normalizedPhone,
          status: { not: OtpStatus.USED },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!record) {
        next(new AppError(400, ERROR_MESSAGES.otpExpired));
        return;
      }

      if (record.status === OtpStatus.VERIFIED) {
        next(new AppError(400, ERROR_MESSAGES.otpAlreadyUsed));
        return;
      }

      if (record.status === OtpStatus.FAILED || record.attempts >= env.OTP_MAX_ATTEMPTS) {
        if (record.status !== OtpStatus.FAILED) {
          await prisma.otpVerification.update({
            where: { id: record.id },
            data: { status: OtpStatus.FAILED },
          });
        }
        next(
          new AppError(
            400,
            record.attempts >= env.OTP_MAX_ATTEMPTS
              ? ERROR_MESSAGES.otpTooManyAttempts
              : ERROR_MESSAGES.otpExpired,
          ),
        );
        return;
      }

      if (record.status !== OtpStatus.SENT || record.expiresAt.getTime() < Date.now()) {
        if (record.status === OtpStatus.SENT) {
          await prisma.otpVerification.update({
            where: { id: record.id },
            data: { status: OtpStatus.EXPIRED },
          });
        }
        next(new AppError(400, ERROR_MESSAGES.otpExpired));
        return;
      }

      const matches = await bcrypt.compare(code, record.codeHash);
      if (!matches) {
        const nextAttempts = record.attempts + 1;
        const exhausted = nextAttempts >= env.OTP_MAX_ATTEMPTS;

        await prisma.otpVerification.update({
          where: { id: record.id },
          data: {
            attempts: nextAttempts,
            ...(exhausted ? { status: OtpStatus.FAILED } : {}),
          },
        });

        if (exhausted) {
          next(new AppError(400, ERROR_MESSAGES.otpTooManyAttempts));
          return;
        }

        next(new AppError(400, ERROR_MESSAGES.otpWrong));
        return;
      }

      await prisma.otpVerification.update({
        where: { id: record.id },
        data: {
          status: OtpStatus.VERIFIED,
          verifiedAt: record.verifiedAt ?? new Date(),
        },
      });

      const otpToken = signOtpToken({
        otpId: record.id,
        phone: normalizedPhone,
      });

      res.json({
        verified: true,
        otpToken,
      });
    } catch (err) {
      next(err);
    }
  },
);
