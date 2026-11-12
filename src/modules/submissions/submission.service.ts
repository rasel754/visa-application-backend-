import { OtpStatus, Prisma } from "@prisma/client";
import {
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
import { ValidatedSubmissionInput } from "./submission.validation";

function parseNextSequence(references: string[], prefix: string): number {
  let maxSeq = 0;
  for (const ref of references) {
    if (!ref.startsWith(prefix)) continue;
    const suffix = ref.slice(prefix.length);
    const num = Number.parseInt(suffix, 10);
    if (Number.isFinite(num) && num > maxSeq) {
      maxSeq = num;
    }
  }
  return maxSeq + 1;
}

function isRetryableTxError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === "P2002" || err.code === "P2034")
  );
}

export async function createSubmission(
  input: ValidatedSubmissionInput,
): Promise<{ reference: string; downloadToken: string }> {
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
  const prismaProfession = toPrismaProfession(input.profession);

  if (input.intakeToken) {
    const link = await prisma.intakeLink.findUnique({
      where: { token: input.intakeToken },
    });

    if (
      !link ||
      link.usedAt !== null ||
      (link.expiresAt && link.expiresAt.getTime() < Date.now())
    ) {
      throw new AppError(404, ERROR_MESSAGES.formNotFound);
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
  }

  const downloadToken = generateSecureToken(24);
  const downloadTokenHash = hashToken(downloadToken);
  const year = new Date().getFullYear();
  const prefix = `IGL-${year}-`;

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

          const existingRefs = await tx.submission.findMany({
            where: { reference: { startsWith: prefix } },
            select: { reference: true },
          });
          const nextSeq = parseNextSequence(
            existingRefs.map((r) => r.reference),
            prefix,
          );
          const reference = `${prefix}${String(nextSeq).padStart(4, "0")}`;
          createdReference = reference;

          const movedDocs = moveFilesToSubmissionFolder(reference, input.filesToMove);

          await tx.submission.create({
            data: {
              reference,
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

          return { reference, downloadToken };
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
    include: { documents: true },
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
    },
    { includeEmptyOptional: false },
  );

  return { reference: submission.reference, pdfBuffer };
}

export async function generateAdminSubmissionPdf(
  submissionId: string,
): Promise<{
  reference: string;
  pdfBuffer: Buffer;
  documents: Array<{ label: string; originalName: string; storedName: string }>;
}> {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    include: { documents: true },
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
