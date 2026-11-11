import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";
import { AppError, ERROR_MESSAGES, FieldErrors } from "../lib/errors";
import { safeDeleteTempFiles } from "../lib/storage";

function cleanupRequestTempFiles(req: Request): void {
  if (Array.isArray(req.files)) {
    const paths = req.files.map((f) => f.path).filter((p): p is string => Boolean(p));
    safeDeleteTempFiles(paths);
  }
}

function extractDocumentKeyFromFieldname(fieldname?: string): string | null {
  if (!fieldname) return null;
  const match = /^documents\[([^\]]+)\]$/.exec(fieldname);
  return match?.[1] ?? null;
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(404, ERROR_MESSAGES.formNotFound));
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  cleanupRequestTempFiles(req);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      fieldErrors: err.fieldErrors,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const docKey = extractDocumentKeyFromFieldname(err.field);
    if (err.code === "LIMIT_FILE_SIZE") {
      const fieldErrors: FieldErrors = docKey ? { [docKey]: ERROR_MESSAGES.fileTooBig } : {};
      res.status(400).json({
        success: false,
        message: ERROR_MESSAGES.fileTooBig,
        fieldErrors,
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: ERROR_MESSAGES.uploadFailed,
      fieldErrors: docKey ? { [docKey]: ERROR_MESSAGES.uploadFailed } : {},
    });
    return;
  }

  if (err instanceof ZodError) {
    const fieldErrors: FieldErrors = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "form";
      if (!fieldErrors[key]) {
        fieldErrors[key] = ERROR_MESSAGES.genericValidation;
      }
    }
    res.status(400).json({
      success: false,
      message: ERROR_MESSAGES.genericValidation,
      fieldErrors,
    });
    return;
  }

  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      message: ERROR_MESSAGES.genericValidation,
      fieldErrors: {},
    });
    return;
  }

  if (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError")
  ) {
    res.status(401).json({
      success: false,
      message: ERROR_MESSAGES.sessionExpired,
      fieldErrors: {},
    });
    return;
  }

  console.error("Unhandled backend error:", err);
  res.status(500).json({
    success: false,
    message: ERROR_MESSAGES.serverError,
    fieldErrors: {},
  });
}

