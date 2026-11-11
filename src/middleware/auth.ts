import type { NextFunction, Request, Response } from "express";
import { AppError, ERROR_MESSAGES } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { verifyAdminToken } from "../lib/tokens";

export const ADMIN_COOKIE_NAME = "igl_admin";

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    admin?: AuthenticatedAdmin;
  }
}

export async function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token: unknown = req.cookies?.[ADMIN_COOKIE_NAME];
  if (typeof token !== "string" || !token) {
    next(new AppError(401, ERROR_MESSAGES.sessionExpired));
    return;
  }

  try {
    const payload = verifyAdminToken(token);
    const admin = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, name: true },
    });

    if (!admin) {
      next(new AppError(401, ERROR_MESSAGES.sessionExpired));
      return;
    }

    req.admin = admin;
    next();
  } catch {
    next(new AppError(401, ERROR_MESSAGES.sessionExpired));
  }
}

