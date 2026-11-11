import fs from "node:fs";
import path from "node:path";
import archiver from "archiver";
import type { Response } from "express";
import { getStoredFilePath } from "./storage";

export interface ZipDocumentItem {
  label: string;
  originalName: string;
  storedName: string;
}

function sanitizeZipFilename(label: string, ext: string, usedNames: Map<string, number>): string {
  let clean = "";
  for (const ch of label) {
    const code = ch.charCodeAt(0);
    if (code < 32 || '<>:"/\\|?*'.includes(ch)) {
      clean += " ";
    } else {
      clean += ch;
    }
  }

  const safeBase = clean.replace(/\s+/g, " ").trim().slice(0, 110) || "document";

  const candidate = `${safeBase}${ext}`.toLowerCase();
  const count = usedNames.get(candidate) ?? 0;
  usedNames.set(candidate, count + 1);

  if (count === 0) {
    return `${safeBase}${ext}`;
  }
  return `${safeBase} (${count + 1})${ext}`;
}

export async function streamSubmissionArchiveZip(
  res: Response,
  reference: string,
  pdfBuffer: Buffer,
  documents: ZipDocumentItem[],
): Promise<void> {
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${reference}.zip"`);

  const archive = archiver("zip", { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    archive.on("error", (err: Error) => reject(err));
    res.on("close", () => resolve());
    res.on("error", (err: Error) => reject(err));

    archive.pipe(res);
    archive.append(pdfBuffer, { name: `${reference}.pdf` });

    const usedNames = new Map<string, number>();
    for (const doc of documents) {
      const filePath = getStoredFilePath(reference, doc.storedName);
      if (!filePath) continue;
      const ext = path.extname(doc.originalName) || path.extname(doc.storedName) || "";
      const zipName = sanitizeZipFilename(doc.label, ext, usedNames);
      archive.append(fs.createReadStream(filePath), { name: zipName });
    }

    void archive.finalize();
  });
}
