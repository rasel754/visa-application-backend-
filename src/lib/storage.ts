import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const STORAGE_ROOT = path.resolve(process.cwd(), "storage");
export const TMP_STORAGE_DIR = path.join(STORAGE_ROOT, "_tmp");

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const ALLOWED_MIMES = new Set(["application/pdf", "image/jpeg", "image/jpg", "image/png"]);

export type DetectedFileKind = "pdf" | "jpeg" | "png";

export function ensureStorageDirs(): void {
  fs.mkdirSync(STORAGE_ROOT, { recursive: true });
  fs.mkdirSync(TMP_STORAGE_DIR, { recursive: true });
}

function assertInsideRoot(targetPath: string, rootPath: string): void {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(targetPath);
  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)
  ) {
    throw new Error("Invalid storage path");
  }
}

export function detectFileKindByMagicBytes(filePath: string): DetectedFileKind | null {
  const fd = fs.openSync(filePath, "r");
  try {
    const buf = Buffer.alloc(8);
    const bytesRead = fs.readSync(fd, buf, 0, 8, 0);
    if (bytesRead < 4) {
      return null;
    }

    // PDF: %PDF-
    if (
      bytesRead >= 5 &&
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46 &&
      buf[4] === 0x2d
    ) {
      return "pdf";
    }

    // JPEG: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
      return "jpeg";
    }

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (
      bytesRead >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47 &&
      buf[4] === 0x0d &&
      buf[5] === 0x0a &&
      buf[6] === 0x1a &&
      buf[7] === 0x0a
    ) {
      return "png";
    }

    return null;
  } finally {
    fs.closeSync(fd);
  }
}

export interface ValidatedUpload {
  canonicalMimeType: "application/pdf" | "image/jpeg" | "image/png";
  canonicalExt: ".pdf" | ".jpg" | ".png";
}

export function validateUploadedFile(
  filePath: string,
  originalName: string,
  reportedMimeType: string,
  sizeBytes: number,
): ValidatedUpload | "too_big" | "wrong_type" {
  if (sizeBytes > MAX_FILE_SIZE_BYTES || sizeBytes <= 0) {
    return sizeBytes > MAX_FILE_SIZE_BYTES ? "too_big" : "wrong_type";
  }

  const ext = path.extname(originalName).toLowerCase();
  const normalizedMime = reportedMimeType.toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIMES.has(normalizedMime)) {
    return "wrong_type";
  }

  const detected = detectFileKindByMagicBytes(filePath);
  if (!detected) {
    return "wrong_type";
  }

  if (detected === "pdf" && ext === ".pdf" && normalizedMime === "application/pdf") {
    return { canonicalMimeType: "application/pdf", canonicalExt: ".pdf" };
  }
  if (
    detected === "jpeg" &&
    (ext === ".jpg" || ext === ".jpeg") &&
    (normalizedMime === "image/jpeg" || normalizedMime === "image/jpg")
  ) {
    return { canonicalMimeType: "image/jpeg", canonicalExt: ".jpg" };
  }
  if (detected === "png" && ext === ".png" && normalizedMime === "image/png") {
    return { canonicalMimeType: "image/png", canonicalExt: ".png" };
  }

  return "wrong_type";
}

export interface TempFileToMove {
  tempPath: string;
  documentKey: string;
  group: string;
  label: string;
  originalName: string;
  mimeType: string;
  ext: string;
  sizeBytes: number;
}

export interface StoredFileMeta {
  documentKey: string;
  group: string;
  label: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  sizeBytes: number;
}

export function moveFilesToSubmissionFolder(
  reference: string,
  files: TempFileToMove[],
): StoredFileMeta[] {
  ensureStorageDirs();
  const submissionDir = path.join(STORAGE_ROOT, reference);
  assertInsideRoot(submissionDir, STORAGE_ROOT);
  fs.mkdirSync(submissionDir, { recursive: true });

  const moved: StoredFileMeta[] = [];
  try {
    for (const file of files) {
      const storedName = `${crypto.randomUUID()}${file.ext}`;
      const destPath = path.join(submissionDir, storedName);
      assertInsideRoot(destPath, submissionDir);

      try {
        fs.renameSync(file.tempPath, destPath);
      } catch {
        // Cross-device fallback
        fs.copyFileSync(file.tempPath, destPath);
        fs.unlinkSync(file.tempPath);
      }

      moved.push({
        documentKey: file.documentKey,
        group: file.group,
        label: file.label,
        originalName: path.basename(file.originalName).slice(0, 240),
        storedName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
      });
    }
    return moved;
  } catch (err: unknown) {
    deleteSubmissionStorage(reference);
    throw err;
  }
}

export function getStoredFilePath(reference: string, storedName: string): string | null {
  const safeRef = path.basename(reference);
  const safeStored = path.basename(storedName);
  if (safeRef !== reference || safeStored !== storedName) {
    return null;
  }
  const submissionDir = path.join(STORAGE_ROOT, safeRef);
  const filePath = path.join(submissionDir, safeStored);
  assertInsideRoot(submissionDir, STORAGE_ROOT);
  assertInsideRoot(filePath, submissionDir);

  if (!fs.existsSync(filePath)) {
    return null;
  }
  return filePath;
}

export function deleteSubmissionStorage(reference: string): void {
  const safeRef = path.basename(reference);
  if (!safeRef || safeRef === "_tmp") {
    return;
  }
  const submissionDir = path.join(STORAGE_ROOT, safeRef);
  assertInsideRoot(submissionDir, STORAGE_ROOT);
  if (fs.existsSync(submissionDir)) {
    fs.rmSync(submissionDir, { recursive: true, force: true });
  }
}

export function safeDeleteTempFiles(paths: string[]): void {
  for (const filePath of paths) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // Best-effort cleanup
    }
  }
}

