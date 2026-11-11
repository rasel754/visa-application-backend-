import bcrypt from "bcryptjs";
import type { CookieOptions, Request, Response, NextFunction } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../../config/env";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { signAdminToken } from "../../lib/tokens";
import { ADMIN_COOKIE_NAME, requireAdmin } from "../../middleware/auth";
import { validateBody } from "../../middleware/validate";

const loginSchema = z.object({
  email: z.string().trim().email(ERROR_MESSAGES.wrongEmail),
  password: z.string().min(1, "Please write your password."),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Please write your current password."),
  newPassword: z
    .string()
    .min(8, "Please choose a new password with at least 8 characters."),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: ERROR_MESSAGES.loginTooManyTries,
      fieldErrors: {},
    });
  },
});

function getCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

export const authRouter = Router();

authRouter.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as z.infer<typeof loginSchema>;
      const normalizedEmail = email.toLowerCase().trim();

      const admin = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
      });

      if (!admin) {
        next(new AppError(401, ERROR_MESSAGES.loginWrong));
        return;
      }

      const validPassword = await bcrypt.compare(password, admin.passwordHash);
      if (!validPassword) {
        next(new AppError(401, ERROR_MESSAGES.loginWrong));
        return;
      }

      const token = signAdminToken({
        sub: admin.id,
        email: admin.email,
        name: admin.name,
      });

      res.cookie(ADMIN_COOKIE_NAME, token, getCookieOptions());
      res.json({
        admin: {
          id: admin.id,
          email: admin.email,
          name: admin.name,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post("/logout", (_req: Request, res: Response) => {
  res.clearCookie(ADMIN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
  res.json({ ok: true });
});

authRouter.get("/me", requireAdmin, (req: Request, res: Response) => {
  res.json({ admin: req.admin });
});

authRouter.post(
  "/change-password",
  requireAdmin,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<
        typeof changePasswordSchema
      >;
      const adminId = req.admin?.id;
      if (!adminId) {
        next(new AppError(401, ERROR_MESSAGES.sessionExpired));
        return;
      }

      const admin = await prisma.adminUser.findUnique({
        where: { id: adminId },
      });
      if (!admin) {
        next(new AppError(401, ERROR_MESSAGES.sessionExpired));
        return;
      }

      const matches = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!matches) {
        next(
          new AppError(400, ERROR_MESSAGES.genericValidation, {
            currentPassword: "Your current password is wrong.",
          }),
        );
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.adminUser.update({
        where: { id: admin.id },
        data: { passwordHash },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

