import { z } from "zod";
import {
  ProfessionKey,
  ResolvedProfessionForm,
  resolveProfessionKey,
  resolveVisitFormForProfession,
} from "../../config/form-data";
import { validateFieldWithRules } from "../../lib/bd-validation";
import { AppError, ERROR_MESSAGES, FieldErrors } from "../../lib/errors";
import { TempFileToMove, validateUploadedFile } from "../../lib/storage";
import { verifyOtpToken } from "../../lib/tokens";

const submissionPayloadSchema = z.object({
  countryCode: z.string().trim().min(1),
  profession: z.string().trim().min(1),
  answers: z.record(z.string(), z.unknown()),
  intakeToken: z.string().trim().optional(),
  otpToken: z.string().trim().optional(),
});

function sanitizeTableRows(raw: unknown): Array<Record<string, string>> {
  if (!Array.isArray(raw)) return [];
  const rows: Array<Record<string, string>> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const cleanRow: Record<string, string> = {};
    let hasValue = false;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      const str =
        typeof v === "string" || typeof v === "number"
          ? String(v).trim().toUpperCase().slice(0, 500)
          : "";
      cleanRow[k] = str;
      if (str.length > 0) hasValue = true;
    }
    if (hasValue) {
      rows.push(cleanRow);
    }
  }
  return rows;
}

function extractDocumentKey(fieldname: string): string | null {
  const match = /^documents\[([a-zA-Z0-9_-]+)\]$/.exec(fieldname);
  return match?.[1] ?? null;
}

export interface ValidatedSubmissionInput {
  form: ResolvedProfessionForm;
  profession: ProfessionKey;
  sanitizedAnswers: Record<string, unknown>;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string | null;
  intakeToken?: string;
  otpId: string;
  otpPhone: string;
  filesToMove: TempFileToMove[];
}

export function validateSubmissionRequest(
  rawDataField: unknown,
  uploadedFiles: Express.Multer.File[],
  headerOtpToken?: string,
): ValidatedSubmissionInput {
  if (typeof rawDataField !== "string" || !rawDataField.trim()) {
    throw new AppError(400, ERROR_MESSAGES.genericValidation);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawDataField) as unknown;
  } catch {
    throw new AppError(400, ERROR_MESSAGES.genericValidation);
  }

  const envelope = submissionPayloadSchema.safeParse(parsedJson);
  if (!envelope.success) {
    throw new AppError(400, ERROR_MESSAGES.genericValidation);
  }

  const { countryCode, profession: rawProfession, answers, intakeToken, otpToken: bodyOtpToken } =
    envelope.data;

  const rawOtpToken = (headerOtpToken?.trim() || bodyOtpToken?.trim() || "").trim();
  if (!rawOtpToken) {
    throw new AppError(401, ERROR_MESSAGES.otpRequired);
  }

  const otpPayload = verifyOtpToken(rawOtpToken);
  if (!otpPayload) {
    throw new AppError(401, ERROR_MESSAGES.otpRequired);
  }

  const profession = resolveProfessionKey(rawProfession);
  const form = profession ? resolveVisitFormForProfession(countryCode, profession) : null;

  if (!form || !profession) {
    throw new AppError(404, ERROR_MESSAGES.formNotFound);
  }

  const fieldErrors: FieldErrors = {};
  const sanitizedAnswers: Record<string, unknown> = {};

  for (const field of form.allFields) {
    const rawVal = answers[field.key];

    if (field.type === "table") {
      const rows = sanitizeTableRows(rawVal);
      if (field.required && rows.length === 0) {
        fieldErrors[field.key] = ERROR_MESSAGES.requiredField(field.label);
      }
      sanitizedAnswers[field.key] = rows;
      continue;
    }

    const result = validateFieldWithRules(field, rawVal, answers);
    if (result.error) {
      fieldErrors[field.key] = result.error;
    }
    sanitizedAnswers[field.key] = result.normalized;
  }

  // Validate documents
  const docByKey = new Map(form.allDocuments.map((doc) => [doc.key, doc]));
  const filesByDocKey = new Map<string, TempFileToMove>();

  for (const file of uploadedFiles) {
    const docKey = extractDocumentKey(file.fieldname);
    if (!docKey || !docByKey.has(docKey)) {
      fieldErrors[docKey ?? "documents"] = ERROR_MESSAGES.uploadFailed;
      continue;
    }
    const docMeta = docByKey.get(docKey)!;
    const validation = validateUploadedFile(
      file.path,
      file.originalname,
      file.mimetype,
      file.size,
    );

    if (validation === "too_big") {
      fieldErrors[docKey] = ERROR_MESSAGES.fileTooBig;
      continue;
    }
    if (validation === "wrong_type") {
      fieldErrors[docKey] = ERROR_MESSAGES.wrongFileType;
      continue;
    }

    filesByDocKey.set(docKey, {
      tempPath: file.path,
      documentKey: docKey,
      group: docMeta.group,
      label: docMeta.label,
      originalName: file.originalname,
      mimeType: validation.canonicalMimeType,
      ext: validation.canonicalExt,
      sizeBytes: file.size,
    });
  }

  for (const doc of form.allDocuments) {
    if (doc.required && !filesByDocKey.has(doc.key) && !fieldErrors[doc.key]) {
      fieldErrors[doc.key] = ERROR_MESSAGES.requiredFile(doc.label);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError(400, ERROR_MESSAGES.genericValidation, fieldErrors);
  }

  const givenNames =
    typeof sanitizedAnswers["given_names"] === "string"
      ? sanitizedAnswers["given_names"]
      : "";
  const surname =
    typeof sanitizedAnswers["surname"] === "string" ? sanitizedAnswers["surname"] : "";
  const fullNameFallback =
    typeof sanitizedAnswers["full_name"] === "string"
      ? sanitizedAnswers["full_name"]
      : "";
  const applicantName =
    ([givenNames, surname].filter(Boolean).join(" ").trim() ||
      fullNameFallback ||
      "Applicant"
    ).slice(0, 255);

  const rawPhone =
    typeof sanitizedAnswers["phone_primary"] === "string"
      ? sanitizedAnswers["phone_primary"]
      : typeof sanitizedAnswers["phone"] === "string"
        ? sanitizedAnswers["phone"]
        : "";
  const applicantPhone = rawPhone.slice(0, 64);

  if (otpPayload.phone !== applicantPhone) {
    throw new AppError(400, ERROR_MESSAGES.otpPhoneMismatch, {
      phone_primary: ERROR_MESSAGES.otpPhoneMismatch,
    });
  }

  const rawEmail =
    typeof sanitizedAnswers["email"] === "string" ? sanitizedAnswers["email"].trim() : "";
  const applicantEmail = rawEmail ? rawEmail.slice(0, 255) : null;

  return {
    form,
    profession,
    sanitizedAnswers,
    applicantName,
    applicantPhone,
    applicantEmail,
    intakeToken: intakeToken || undefined,
    otpId: otpPayload.otpId,
    otpPhone: otpPayload.phone,
    filesToMove: Array.from(filesByDocKey.values()),
  };
}
