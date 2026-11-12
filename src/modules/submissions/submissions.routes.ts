import fs from "node:fs";
import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { Prisma, SubmissionStatus } from "@prisma/client";
import { z } from "zod";
import {
  formatProfessionLabel,
  fromPrismaProfession,
  groupFieldsBySection,
  resolveProfessionKey,
  resolveVisitFormForProfession,
  toPrismaProfession,
} from "../../config/form-data";
import { getDhakaTodayStartUtc, parseDateBoundary } from "../../lib/dates";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { prisma } from "../../lib/prisma";
import {
  deleteSubmissionStorage,
  getStoredFilePath,
  safeDeleteTempFiles,
} from "../../lib/storage";
import { streamSubmissionArchiveZip } from "../../lib/zip";
import { requireAdmin } from "../../middleware/auth";
import { uploadSubmissionDocuments } from "../../middleware/upload";
import { validateBody } from "../../middleware/validate";
import {
  createSubmission,
  generateAdminSubmissionPdf,
  generateSubmissionPdfByDownloadToken,
} from "./submission.service";
import { validateSubmissionRequest } from "./submission.validation";

const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many applications sent from this connection. Please wait an hour and try again.",
      fieldErrors: {},
    });
  },
});

const updateStatusSchema = z.object({
  status: z.enum(["NEW", "CHECKED", "PROCESSING", "COMPLETED", "REJECTED"]),
});

export const publicSubmissionsRouter = Router();
export const adminSubmissionsRouter = Router();

publicSubmissionsRouter.post(
  "/",
  submitLimiter,
  uploadSubmissionDocuments,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const uploadedFiles = Array.isArray(req.files) ? req.files : [];
    try {
      const rawData: unknown = (req.body as Record<string, unknown>)?.data;
      const headerOtpToken = req.get("x-otp-token") ?? undefined;
      const validated = validateSubmissionRequest(rawData, uploadedFiles, headerOtpToken);
      const created = await createSubmission(validated);
      res.status(201).json(created);
    } catch (err) {
      const tempPaths = uploadedFiles.map((f) => f.path).filter(Boolean);
      safeDeleteTempFiles(tempPaths);
      next(err);
    }
  },
);

publicSubmissionsRouter.get(
  "/by-token/:downloadToken/pdf",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const downloadToken = String(req.params.downloadToken ?? "").trim();
      if (!downloadToken) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      const { reference, pdfBuffer } =
        await generateSubmissionPdfByDownloadToken(downloadToken);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${reference}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.use(requireAdmin);

adminSubmissionsRouter.get(
  "/stats",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const todayStart = getDhakaTodayStartUtc();

      const [total, today, grouped] = await Promise.all([
        prisma.submission.count(),
        prisma.submission.count({
          where: { createdAt: { gte: todayStart } },
        }),
        prisma.submission.groupBy({
          by: ["status"],
          _count: { status: true },
        }),
      ]);

      const byStatus: Record<SubmissionStatus, number> = {
        NEW: 0,
        CHECKED: 0,
        PROCESSING: 0,
        COMPLETED: 0,
        REJECTED: 0,
      };

      for (const row of grouped) {
        byStatus[row.status] = row._count.status;
      }

      res.json({ total, today, byStatus });
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.get(
  "/submissions",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
      const country = typeof req.query.country === "string" ? req.query.country.trim() : "";
      const rawProfession =
        typeof req.query.profession === "string" ? req.query.profession.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

      const parsedPage = Number.parseInt(String(req.query.page ?? "1"), 10);
      const parsedLimit = Number.parseInt(String(req.query.limit ?? "20"), 10);
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 100)
          : 20;

      const where: Prisma.SubmissionWhereInput = {};

      if (search) {
        where.OR = [
          { reference: { contains: search } },
          { applicantName: { contains: search } },
          { applicantPhone: { contains: search } },
          { applicantEmail: { contains: search } },
        ];
      }

      if (country) {
        where.countryCode = country.toUpperCase();
      }

      const resolvedProfession = resolveProfessionKey(rawProfession);
      if (resolvedProfession) {
        where.profession = toPrismaProfession(resolvedProfession);
      }

      if (
        status &&
        (["NEW", "CHECKED", "PROCESSING", "COMPLETED", "REJECTED"] as string[]).includes(
          status,
        )
      ) {
        where.status = status as SubmissionStatus;
      }

      const fromDate = from ? parseDateBoundary(from, false) : null;
      const toDate = to ? parseDateBoundary(to, true) : null;
      if (fromDate || toDate) {
        where.createdAt = {
          ...(fromDate ? { gte: fromDate } : {}),
          ...(toDate ? { lte: toDate } : {}),
        };
      }

      const [total, items] = await Promise.all([
        prisma.submission.count({ where }),
        prisma.submission.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            reference: true,
            countryCode: true,
            countryName: true,
            visaType: true,
            profession: true,
            officialVisaName: true,
            applicantName: true,
            applicantPhone: true,
            applicantEmail: true,
            status: true,
            otpVerified: true,
            otpVerifiedPhone: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { documents: true },
            },
          },
        }),
      ]);

      res.json({
        items,
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.get(
  "/submissions/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const submission = await prisma.submission.findUnique({
        where: { id },
        include: {
          documents: {
            orderBy: { createdAt: "asc" },
          },
        },
      });

      if (!submission) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      const professionKey = fromPrismaProfession(submission.profession);
      const form = resolveVisitFormForProfession(submission.countryCode, professionKey);
      const commonSections = form ? groupFieldsBySection(form.commonFields) : [];
      const professionSections = form ? groupFieldsBySection(form.profileFields) : [];
      const orderedSections = form ? groupFieldsBySection(form.allFields) : [];

      res.json({
        id: submission.id,
        reference: submission.reference,
        countryCode: submission.countryCode,
        countryName: submission.countryName,
        visaType: submission.visaType,
        profession: submission.profession,
        professionLabel: formatProfessionLabel(submission.profession),
        officialVisaName: submission.officialVisaName,
        applicantName: submission.applicantName,
        applicantPhone: submission.applicantPhone,
        applicantEmail: submission.applicantEmail,
        answers: submission.answers,
        status: submission.status,
        otpVerified: submission.otpVerified,
        otpVerifiedPhone: submission.otpVerifiedPhone,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        documents: submission.documents.map((doc) => ({
          id: doc.id,
          documentKey: doc.documentKey,
          group: doc.group,
          label: doc.label,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          createdAt: doc.createdAt,
        })),
        commonSections,
        professionSections,
        sections: orderedSections,
        commonDocuments: form?.commonDocuments ?? [],
        additionalDocuments: form?.additionalDocuments ?? [],
        requiredDocuments: form?.allDocuments ?? [],
      });
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.patch(
  "/submissions/:id/status",
  validateBody(updateStatusSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const { status } = req.body as z.infer<typeof updateStatusSchema>;

      const existing = await prisma.submission.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      const updated = await prisma.submission.update({
        where: { id },
        data: { status },
        select: { id: true, status: true, updatedAt: true },
      });

      res.json(updated);
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.delete(
  "/submissions/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const existing = await prisma.submission.findUnique({
        where: { id },
        select: { id: true, reference: true },
      });

      if (!existing) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      await prisma.submission.delete({ where: { id: existing.id } });
      deleteSubmissionStorage(existing.reference);

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.get(
  "/submissions/:id/pdf",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const { reference, pdfBuffer } = await generateAdminSubmissionPdf(id);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${reference}.pdf"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(pdfBuffer);
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.get(
  "/submissions/:id/documents/:docId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const docId = String(req.params.docId ?? "").trim();
      const inline = req.query.inline === "1";

      const doc = await prisma.submissionDocument.findFirst({
        where: { id: docId, submissionId: id },
        include: {
          submission: { select: { reference: true } },
        },
      });

      if (!doc) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      const filePath = getStoredFilePath(doc.submission.reference, doc.storedName);
      if (!filePath) {
        next(new AppError(404, ERROR_MESSAGES.formNotFound));
        return;
      }

      const safeFilename = doc.originalName.replace(/["\\\r\n]/g, "_");
      res.setHeader("Content-Type", doc.mimeType);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader(
        "Content-Disposition",
        `${inline ? "inline" : "attachment"}; filename="${safeFilename}"`,
      );
      res.setHeader("Cache-Control", "no-store");

      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      next(err);
    }
  },
);

adminSubmissionsRouter.get(
  "/submissions/:id/archive.zip",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = String(req.params.id ?? "").trim();
      const { reference, pdfBuffer, documents } = await generateAdminSubmissionPdf(id);
      await streamSubmissionArchiveZip(res, reference, pdfBuffer, documents);
    } catch (err) {
      next(err);
    }
  },
);
