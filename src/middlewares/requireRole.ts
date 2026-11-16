import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { AppError } from "../lib/errors";

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, "Authentication required."));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(
        new AppError(
          403,
          "Access denied. You do not have permission to perform this action.",
        ),
      );
      return;
    }

    next();
  };
}
