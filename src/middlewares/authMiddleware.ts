import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { AppError, ERROR_MESSAGES } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { verifyAdminToken } from "../lib/tokens";

export const ADMIN_COOKIE_NAME = "igl_admin";

export interface AuthenticatedUser {
  userId: string;
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  company?: {
    id: string;
    name: string;
    slug: string;
    prefix: string;
    logoUrl: string | null;
    phone: string | null;
    address: string | null;
    isActive: boolean;
  } | null;
}

export interface AuthenticatedAdmin {
  id: string;
  email: string;
  name: string;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthenticatedUser;
    admin?: AuthenticatedAdmin;
    tenantWhere?: Record<string, unknown>;
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  let token: string | undefined = req.cookies?.[ADMIN_COOKIE_NAME];

  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    }
  }

  if (typeof token !== "string" || !token) {
    next(new AppError(401, ERROR_MESSAGES.sessionExpired));
    return;
  }

  try {
    const payload = verifyAdminToken(token);
    const user = await prisma.adminUser.findUnique({
      where: { id: payload.sub },
      include: {
        company: true,
      },
    });

    if (!user) {
      next(new AppError(401, ERROR_MESSAGES.sessionExpired));
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

    const authUser: AuthenticatedUser = {
      userId: user.id,
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      company: user.company,
    };

    req.user = authUser;
    req.admin = {
      id: user.id,
      email: user.email,
      name: user.name,
    };

    next();
  } catch {
    next(new AppError(401, ERROR_MESSAGES.sessionExpired));
  }
}

// Backwards compatibility alias
export const requireAdmin = authMiddleware;
