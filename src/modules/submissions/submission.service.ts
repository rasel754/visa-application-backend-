import { Company, OtpStatus, Prisma } from "@prisma/client";
import {
  FormField,
  formatProfessionLabel,
  fromPrismaProfession,
  resolveVisitFormForProfession,
  toPrismaProfession,
} from "../../config/form-data";
import { AppError, ERROR_MESSAGES } from "../../lib/errors";
import { buildSubmissionPdfBuffer } from "../../lib/pdf";
import { prisma } from "../../lib/prisma";
import {
  deleteSubmissionStorage,
  moveFilesToSubmissionFolder,
} from "../../lib/storage";
import { generateSecureToken, hashToken } from "../../lib/tokens";
import { generateNextReference } from "../../utils/referenceGenerator";
import { ValidatedSubmissionInput } from "./submission.validation";

function isRetryableTxError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2002" || err.code === "P2034")
  );
}

export async function createSubmission(
  input: ValidatedSubmissionInput,
): Promise<{
  reference: string;
  downloadToken: string;
  company: { name: string; slug: string; prefix: string };
}> {
  const otpRecord = await prisma.otpVerification.findUnique({
    where: { id: input.otpId },
  });

  if (
    !otpRecord ||
    otpRecord.phone !== input.otpPhone ||
    otpRecord.verifiedAt === null ||
    otpRecord.usedAt !== null ||
    otpRecord.status !== OtpStatus.VERIFIED
  ) {
    throw new AppError(401, ERROR_MESSAGES.otpRequired);
  }

  let intakeLinkId: string | null = null;
  let resolvedCompany: Company | null = null;
  const prismaProfession = toPrismaProfession(input.profession);

  if (input.intakeToken) {
    const link = await prisma.intakeLink.findUnique({
      where: { token: input.intakeToken },
      include: { company: true },
    });

    if (
      !link ||
      link.usedAt !== null ||
      (link.expiresAt && link.expiresAt.getTime() < Date.now())
    ) {
      throw new AppError(404, ERROR_MESSAGES.formNotFound);
    }

    if (!link.company.isActive) {
      throw new AppError(
        403,
        "The visa agency associated with this application link is currently inactive or suspended.",
      );
    }

    if (
      link.countryCode &&
      link.countryCode.toUpperCase() !== input.form.country_code.toUpperCase()
    ) {
      throw new AppError(404, ERROR_MESSAGES.formNotFound);
    }

    if (link.profession && link.profession !== prismaProfession) {
      throw new AppError(404, ERROR_MESSAGES.formNotFound);
    }

    intakeLinkId = link.id;
    resolvedCompany = link.company;
  } else if (input.companySlug) {
    const company = await prisma.company.findUnique({
      where: { slug: input.companySlug.trim().toLowerCase() },
    });

    if (!company) {
      throw new AppError(404, "Visa agency not found.");
    }

    if (!company.isActive) {
      throw new AppError(
        403,
        "This visa agency is currently inactive or suspended.",
      );
    }

    resolvedCompany = company;
  } else {
    // Default fallback to IGL Visa Help
    const company = await prisma.company.findUnique({
      where: { slug: "igl-visa-help" },
    });

    if (!company || !company.isActive) {
      throw new AppError(404, "Default visa agency not found or inactive.");
    }

    resolvedCompany = company;
  }

  const downloadToken = generateSecureToken(24);
  const downloadTokenHash = hashToken(downloadToken);
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt++) {
    let createdReference: string | null = null;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const otpMarked = await tx.otpVerification.updateMany({
            where: {
              id: input.otpId,
              phone: input.otpPhone,
              verifiedAt: { not: null },
              usedAt: null,
              status: OtpStatus.VERIFIED,
            },
            data: {
              status: OtpStatus.USED,
              usedAt: new Date(),
            },
          });
          if (otpMarked.count === 0) {
            throw new AppError(400, ERROR_MESSAGES.otpAlreadyUsed);
          }

          if (intakeLinkId) {
            const updated = await tx.intakeLink.updateMany({
              where: { id: intakeLinkId, usedAt: null },
              data: { usedAt: new Date() },
            });
            if (updated.count === 0) {
              throw new AppError(404, ERROR_MESSAGES.formNotFound);
            }
          }

          // Generate sequential reference atomically for this company prefix
          const reference = await generateNextReference(
            tx,
            resolvedCompany!.prefix,
            year,
          );
          createdReference = reference;

          const movedDocs = moveFilesToSubmissionFolder(reference, input.filesToMove);

          await tx.submission.create({
            data: {
              reference,
              companyId: resolvedCompany!.id,
              countryCode: input.form.country_code,
              countryName: input.form.country,
              visaType: "visit",
              profession: prismaProfession,
              officialVisaName: input.form.official_visa_name,
              applicantName: input.applicantName,
              applicantPhone: input.applicantPhone,
              applicantEmail: input.applicantEmail,
              answers: input.sanitizedAnswers as Prisma.InputJsonValue,
              status: "NEW",
              otpVerified: true,
              otpVerifiedPhone: input.otpPhone,
              otpVerificationId: input.otpId,
              downloadTokenHash,
              intakeLinkId,
              documents: {
                create: movedDocs.map((doc) => ({
                  documentKey: doc.documentKey,
                  group: doc.group,
                  label: doc.label,
                  originalName: doc.originalName,
                  storedName: doc.storedName,
                  mimeType: doc.mimeType,
                  sizeBytes: doc.sizeBytes,
                })),
              },
            },
          });

          return {
            reference,
            downloadToken,
            company: {
              name: resolvedCompany!.name,
              slug: resolvedCompany!.slug,
              prefix: resolvedCompany!.prefix,
            },
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return result;
    } catch (err: unknown) {
      if (createdReference) {
        deleteSubmissionStorage(createdReference);
      }
      if (attempt < 4 && isRetryableTxError(err)) {
        continue;
      }
      throw err;
    }
  }

  throw new AppError(500, ERROR_MESSAGES.serverError);
}

export async function generateSubmissionPdfByDownloadToken(
  downloadToken: string,
): Promise<{ reference: string; pdfBuffer: Buffer }> {
  const tokenHash = hashToken(downloadToken);
  const submission = await prisma.submission.findUnique({
    where: { downloadTokenHash: tokenHash },
    include: {
      documents: true,
      company: true,
    },
  });

  if (!submission) {
    throw new AppError(404, ERROR_MESSAGES.formNotFound);
  }

  const professionKey = fromPrismaProfession(submission.profession);
  const form = resolveVisitFormForProfession(submission.countryCode, professionKey);
  const answersObj =
    typeof submission.answers === "object" &&
    submission.answers !== null &&
    !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};

  const knownKeys = new Set(form?.allFields.map((f) => f.key) ?? []);
  const unmappedFields: FormField[] = [];

  for (const [key, val] of Object.entries(answersObj)) {
    if (knownKeys.has(key)) continue;
    if (val === undefined || val === null || val === "") continue;
    if (Array.isArray(val) && val.length === 0) continue;

    unmappedFields.push({
      key,
      label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      type: Array.isArray(val) ? "table" : typeof val === "number" ? "number" : "text",
      required: false,
      section: "Additional Information",
    });
  }

  const pdfBuffer = await buildSubmissionPdfBuffer(
    {
      reference: submission.reference,
      countryName: submission.countryName,
      visaType: submission.visaType,
      professionLabel: formatProfessionLabel(submission.profession),
      officialVisaName: submission.officialVisaName,
      createdAt: submission.createdAt,
      answers: answersObj,
      documents: submission.documents.map((d) => ({
        documentKey: d.documentKey,
        label: d.label,
        originalName: d.originalName,
      })),
      commonFields: form?.commonFields ?? [],
      profileFields: [...(form?.profileFields ?? []), ...unmappedFields],
      commonDocuments: form?.commonDocuments ?? [],
      additionalDocuments: form?.additionalDocuments ?? [],
      company: submission.company,
    },
    { includeEmptyOptional: false },
  );

  return { reference: submission.reference, pdfBuffer };
}

export async function generateAdminSubmissionPdf(
  submissionId: string,
  tenantWhere: Record<string, unknown> = {},
): Promise<{
  reference: string;
  pdfBuffer: Buffer;
  documents: Array<{ label: string; originalName: string; storedName: string }>;
}> {
  const submission = await prisma.submission.findFirst({
    where: {
      id: submissionId,
      ...tenantWhere,
    },
    include: {
      documents: true,
      company: true,
    },
  });

  if (!submission) {
    throw new AppError(404, ERROR_MESSAGES.formNotFound);
  }

  const professionKey = fromPrismaProfession(submission.profession);
  const form = resolveVisitFormForProfession(submission.countryCode, professionKey);
  const answersObj =
    typeof submission.answers === "object" &&
    submission.answers !== null &&
    !Array.isArray(submission.answers)
      ? (submission.answers as Record<string, unknown>)
      : {};

  const pdfBuffer = await buildSubmissionPdfBuffer(
    {
      reference: submission.reference,
      countryName: submission.countryName,
      visaType: submission.visaType,
      professionLabel: formatProfessionLabel(submission.profession),
      officialVisaName: submission.officialVisaName,
      createdAt: submission.createdAt,
      answers: answersObj,
      documents: submission.documents.map((d) => ({
        documentKey: d.documentKey,
        label: d.label,
        originalName: d.originalName,
      })),
      commonFields: form?.commonFields ?? [],
      profileFields: form?.profileFields ?? [],
      commonDocuments: form?.commonDocuments ?? [],
      additionalDocuments: form?.additionalDocuments ?? [],
      company: submission.company,
    },
    { includeEmptyOptional: true },
  );

  return {
    reference: submission.reference,
    pdfBuffer,
    documents: submission.documents.map((d) => ({
      label: d.label,
      originalName: d.originalName,
      storedName: d.storedName,
    })),
  };
}
