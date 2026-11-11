import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { MAX_FILE_SIZE_BYTES, TMP_STORAGE_DIR, ensureStorageDirs } from "../lib/storage";

ensureStorageDirs();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureStorageDirs();
    cb(null, TMP_STORAGE_DIR);
  },
  filename: (_req, _file, cb) => {
    cb(null, `${crypto.randomUUID()}.upload`);
  },
});

const uploadInstance = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 40,
    fieldSize: 2 * 1024 * 1024,
  },
});

export function uploadSubmissionDocuments(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const middleware = uploadInstance.any();
  middleware(req, res, (err: unknown) => {
    if (err) {
      next(err);
      return;
    }
    next();
  });
}

