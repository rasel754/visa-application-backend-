import { z } from "zod";
import { CategoryFormPayload, FormField, getCategory, resolveCategoryKey } from "../../config/form-data";
import { AppError, ERROR_MESSAGES, FieldErrors } from "../../lib/errors";
import { TempFileToMove, validateUploadedFile } from "../../lib/storage";

const submissionPayloadSchema = z.object({
  countryCode: z.string().trim().min(1),
  category: z.string().trim().min(1),
  answers: z.record(z.string(), z.unknown()),
  intakeToken: z.string().trim().optional(),
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED_REGEX = /^[0-9+\-\s()]{7,25}$/;
const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const FUTURE_DATE_KEYS = new Set([
  "intended_arrival_date",
  "intended_departure_date",
  "course_start_date",
  "course_end_date",
  "passport_expiry_date",
]);

const PAST_OR_TODAY_DATE_KEYS = new Set([
  "date_of_birth",
  "passport_issue_date",
  "employment_start_date",
]);

function getTodayYmd(): string {
  // Use Asia/Dhaka (+06:00) calendar date for Bangladeshi applicants
  const now = new Date();
  const dhakaTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return dhakaTime.toISOString().slice(0, 10);
}

function isValidYmdDate(value: string): boolean {
  if (!YMD_REGEX.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function isValidPhone(value: string): boolean {
  if (!PHONE_ALLOWED_REGEX.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 16;
}

function sanitizeTableRows(raw: unknown): Array<Record<string, string>> {
  if (!Array.isArray(raw)) return [];
  const rows: Array<Record<string, string>> = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const cleanRow: Record<string, string> = {};
    let hasValue = false;
    for (const [k, v] of Object.entries(item as Record<string, unknown>)) {
      const str = typeof v === "string" || typeof v === "number" ? String(v).trim().slice(0, 500) : "";
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
  form: CategoryFormPayload;
  canonicalCategory: string;
  sanitizedAnswers: Record<string, unknown>;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string | null;
  intakeToken?: string;
  filesToMove: TempFileToMove[];
}

export function validateSubmissionRequest(
  rawDataField: unknown,
  uploadedFiles: Express.Multer.File[],
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

  const { countryCode, category, answers, intakeToken } = envelope.data;
  const canonicalCategory = resolveCategoryKey(countryCode, category);
  const form = canonicalCategory ? getCategory(countryCode, canonicalCategory) : null;

  if (!form || !canonicalCategory) {
    throw new AppError(404, ERROR_MESSAGES.formNotFound);
  }

  const fieldErrors: FieldErrors = {};
  const sanitizedAnswers: Record<string, unknown> = {};
  const todayYmd = getTodayYmd();

  const validateSingleField = (field: FormField): void => {
    const rawVal = answers[field.key];

    if (field.type === "table") {
      const rows = sanitizeTableRows(rawVal);
      if (field.required && rows.length === 0) {
        fieldErrors[field.key] = ERROR_MESSAGES.requiredField(field.label);
      }
      sanitizedAnswers[field.key] = rows;
      return;
    }

    if (field.type === "number") {
      const str =
        typeof rawVal === "number"
          ? String(rawVal)
          : typeof rawVal === "string"
            ? rawVal.trim()
            : "";

      if (!str) {
        if (field.required) {
          fieldErrors[field.key] = ERROR_MESSAGES.requiredField(field.label);
        }
        sanitizedAnswers[field.key] = "";
        return;
      }

      const num = Number(str);
      if (!Number.isFinite(num) || num < 0) {
        fieldErrors[field.key] = "Please write a valid number.";
        return;
      }
      sanitizedAnswers[field.key] = num;
      return;
    }

    const strVal = typeof rawVal === "string" ? rawVal.trim().slice(0, 5000) : "";

    if (!strVal) {
      if (field.required) {
        fieldErrors[field.key] = ERROR_MESSAGES.requiredField(field.label);
      }
      sanitizedAnswers[field.key] = "";
      return;
    }

    if (field.type === "email" && !EMAIL_REGEX.test(strVal)) {
      fieldErrors[field.key] = ERROR_MESSAGES.wrongEmail;
      return;
    }

    if (field.type === "tel" && !isValidPhone(strVal)) {
      fieldErrors[field.key] = ERROR_MESSAGES.wrongPhone;
      return;
    }

    if (field.type === "date") {
      if (!isValidYmdDate(strVal)) {
        fieldErrors[field.key] = "Please choose a valid date.";
        return;
      }
      if (FUTURE_DATE_KEYS.has(field.key) && strVal < todayYmd) {
        fieldErrors[field.key] = ERROR_MESSAGES.pastDate;
        return;
      }
      if (PAST_OR_TODAY_DATE_KEYS.has(field.key) && strVal > todayYmd) {
        fieldErrors[field.key] = "Please choose a date on or before today.";
        return;
      }
    }

    sanitizedAnswers[field.key] = strVal;
  };

  for (const field of form.fields) {
    validateSingleField(field);
  }

  // Cross-field date checks
  const passportExpiry = sanitizedAnswers["passport_expiry_date"];
  const arrivalDate = sanitizedAnswers["intended_arrival_date"];
  const departureDate = sanitizedAnswers["intended_departure_date"];
  const courseStart = sanitizedAnswers["course_start_date"];
  const courseEnd = sanitizedAnswers["course_end_date"];

  if (
    typeof passportExpiry === "string" &&
    isValidYmdDate(passportExpiry) &&
    !fieldErrors["passport_expiry_date"]
  ) {
    if (
      (typeof arrivalDate === "string" &&
        isValidYmdDate(arrivalDate) &&
        passportExpiry < arrivalDate) ||
      (typeof departureDate === "string" &&
        isValidYmdDate(departureDate) &&
        passportExpiry < departureDate)
    ) {
      fieldErrors["passport_expiry_date"] = ERROR_MESSAGES.passportBeforeTravel;
    }
  }

  if (
    typeof arrivalDate === "string" &&
    typeof departureDate === "string" &&
    isValidYmdDate(arrivalDate) &&
    isValidYmdDate(departureDate) &&
    departureDate < arrivalDate &&
    !fieldErrors["intended_departure_date"]
  ) {
    fieldErrors["intended_departure_date"] =
      "Departure date cannot be before your arrival date.";
  }

  if (
    typeof courseStart === "string" &&
    typeof courseEnd === "string" &&
    isValidYmdDate(courseStart) &&
    isValidYmdDate(courseEnd) &&
    courseEnd < courseStart &&
    !fieldErrors["course_end_date"]
  ) {
    fieldErrors["course_end_date"] = "Course end date cannot be before the start date.";
  }

  // Validate documents
  const docByKey = new Map(form.documents.map((doc) => [doc.key, doc]));
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
      label: docMeta.label,
      originalName: file.originalname,
      mimeType: validation.canonicalMimeType,
      ext: validation.canonicalExt,
      sizeBytes: file.size,
    });
  }

  for (const doc of form.documents) {
    if (doc.required && !filesByDocKey.has(doc.key) && !fieldErrors[doc.key]) {
      fieldErrors[doc.key] = ERROR_MESSAGES.requiredFile(doc.label);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new AppError(400, ERROR_MESSAGES.genericValidation, fieldErrors);
  }

  // Extract indexed applicant metadata from answers
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
    ([givenNames, surname].filter(Boolean).join(" ").trim() || fullNameFallback || "Applicant").slice(
      0,
      255,
    );

  const rawPhone =
    typeof sanitizedAnswers["phone"] === "string" ? sanitizedAnswers["phone"] : "";
  const applicantPhone = rawPhone.slice(0, 64);

  const rawEmail =
    typeof sanitizedAnswers["email"] === "string" ? sanitizedAnswers["email"].trim() : "";
  const applicantEmail = rawEmail ? rawEmail.slice(0, 255) : null;

  return {
    form,
    canonicalCategory,
    sanitizedAnswers,
    applicantName,
    applicantPhone,
    applicantEmail,
    intakeToken: intakeToken || undefined,
    filesToMove: Array.from(filesByDocKey.values()),
  };
}

