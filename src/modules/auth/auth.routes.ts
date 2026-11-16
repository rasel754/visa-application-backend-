import bcrypt from "bcryptjs";
import type { CookieOptions, Request, Response, NextFunction } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Role } from "@prisma/client";
import { z } from "zod";
import { env, parseFrontendOrigins } from "../../config/env";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import { signAdminToken } from "../../lib/tokens";
import { ADMIN_COOKIE_NAME, authMiddleware } from "../../middlewares/authMiddleware";
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
  max: 20,
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

function isHttpsContext(req: Request): boolean {
  const forwardedProto = req.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  return (
    req.secure ||
    forwardedProto === "https" ||
    parseFrontendOrigins(env.FRONTEND_URL).some((origin) =>
      origin.toLowerCase().startsWith("https://"),
    )
  );
}

function getCookieOptions(req: Request): CookieOptions {
  const isHttps = isHttpsContext(req);
  return {
    httpOnly: true,
    sameSite: isHttps ? "none" : "lax",
    secure: isHttps,
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

      const user = await prisma.adminUser.findUnique({
        where: { email: normalizedEmail },
        include: {
          company: true,
        },
      });

      if (!user) {
        next(new AppError(401, ERROR_MESSAGES.loginWrong));
        return;
      }

      const validPassword = await bcrypt.compare(password, user.passwordHash);
      if (!validPassword) {
        next(new AppError(401, ERROR_MESSAGES.loginWrong));
        return;
      }

      if (user.role === Role.COMPANY) {
        if (!user.companyId || !user.company) {
          next(new AppError(403, "Company association not found for this account."));
          return;
        }
        if (!user.company.isActive) {
          next(
            new AppError(
              403,
              "Your company account has been suspended. Please contact the platform administrator.",
            ),
          );
          return;
        }
      }

      const token = signAdminToken({
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
      });

      res.cookie(ADMIN_COOKIE_NAME, token, getCookieOptions(req));

      const authData = {
        id: user.id,
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        company: user.company
          ? {
              id: user.company.id,
              name: user.company.name,
              slug: user.company.slug,
              prefix: user.company.prefix,
              logoUrl: user.company.logoUrl,
              phone: user.company.phone,
              address: user.company.address,
              isActive: user.company.isActive,
            }
          : null,
      };

      res.json({
        user: authData,
        admin: authData, // backwards compatibility
      });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post("/logout", (req: Request, res: Response) => {
  const { maxAge: _maxAge, ...clearOptions } = getCookieOptions(req);
  res.clearCookie(ADMIN_COOKIE_NAME, clearOptions);
  res.json({ ok: true });
});

authRouter.get("/me", authMiddleware, (req: Request, res: Response) => {
  res.json({
    user: req.user,
    admin: req.user, // backwards compatibility
  });
});

authRouter.post(
  "/change-password",
  authMiddleware,
  validateBody(changePasswordSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as z.infer<
        typeof changePasswordSchema
      >;
      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        next(new AppError(401, ERROR_MESSAGES.sessionExpired));
        return;
      }

      const user = await prisma.adminUser.findUnique({
        where: { id: userId },
      });
      if (!user) {
        next(new AppError(401, ERROR_MESSAGES.sessionExpired));
        return;
      }

      const matches = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!matches) {
        next(
          new AppError(
            400,
            ERROR_MESSAGES.genericValidation,
            { currentPassword: "Your current password is wrong." },
          ),
        );
        return;
      }

      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);
