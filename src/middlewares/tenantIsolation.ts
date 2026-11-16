import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { AppError } from "../lib/errors";

export function tenantIsolation(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError(401, "Authentication required."));
    return;
  }

  if (req.user.role === Role.COMPANY) {
    if (!req.user.companyId) {
      next(new AppError(403, "No company assigned to this account."));
      return;
    }
    req.tenantWhere = { companyId: req.user.companyId };
  } else if (req.user.role === Role.SUPER_ADMIN) {
    if (typeof req.query.companyId === "string" && req.query.companyId.trim()) {
      req.tenantWhere = { companyId: req.query.companyId.trim() };
    } else {
      req.tenantWhere = {};
    }
  } else {
    next(new AppError(403, "Invalid user role."));
    return;
  }

  next();
}
