import type { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";
import { AppError, ERROR_MESSAGES, FieldErrors } from "../lib/errors";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join(".") || "form";
        if (!fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      next(new AppError(400, ERROR_MESSAGES.genericValidation, fieldErrors));
      return;
    }
    req.body = result.data;
    next();
  };
}

