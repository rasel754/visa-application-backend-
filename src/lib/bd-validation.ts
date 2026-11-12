import { z } from "zod";
import { ERROR_MESSAGES } from "./errors";

export interface ValidationFieldSpec {
  key: string;
  label: string;
  type: "text" | "date" | "email" | "tel" | "number" | "select" | "textarea" | "table";
  required: boolean;
}

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_SCHEMA = z.string().trim().email(ERROR_MESSAGES.wrongEmail);
const GENERAL_PHONE_ALLOWED_REGEX = /^[0-9+\-\s()]{7,25}$/;

export const BD_MOBILE_FULL_REGEX = /^\+8801[3-9]\d{8}$/;
export const BD_MOBILE_LOCAL_REGEX = /^01[3-9]\d{8}$/;
export const PASSPORT_REGEX = /^[A-Z0-9]{9}$/;
export const TUITION_REGEX = /^\d{1,8}$/;
export const NID_REGEX = /^(?:\d{10}|\d{13}|\d{17})$/;
export const TIN_REGEX = /^\d{12}$/;

const FUTURE_DATE_KEYS = new Set([
  "intended_arrival_date",
  "intended_departure_date",
  "passport_expiry_date",
  "expected_completion_date",
  "course_start_date",
  "course_end_date",
]);

const PAST_OR_TODAY_DATE_KEYS = new Set([
  "fathers_date_of_birth",
  "mothers_date_of_birth",
  "spouse_date_of_birth",
  "business_start_date",
  "date_of_joining",
  "employment_start_date",
]);

const STRICT_PAST_DATE_KEYS = new Set(["date_of_birth", "passport_issue_date"]);

export function isBdMobileKey(key: string): boolean {
  return key === "phone_primary" || key === "phone_secondary";
}

export function isTuitionKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === "tuition_fee" || lower.includes("tuition");
}

export function isDigitsOnlyTextKey(key: string): boolean {
  return key === "national_id_number" || key === "tin_number" || isTuitionKey(key);
}

export function shouldUppercaseField(field: Pick<ValidationFieldSpec, "key" | "type">): boolean {
  if (field.type === "email") return false;
  if (field.type === "select" || field.type === "number" || field.type === "date") {
    return false;
  }
  if (isBdMobileKey(field.key) || isDigitsOnlyTextKey(field.key)) {
    return false;
  }
  return field.type === "text" || field.type === "textarea";
}

export function normalizeBdMobileInput(raw: string): string {
  const trimmed = raw.trim().replace(/[\s-]+/g, "");
  if (!trimmed || trimmed === "+88") return "";
  if (trimmed.startsWith("+88")) {
    return trimmed;
  }
  if (/^8801\d*$/.test(trimmed)) {
    return `+${trimmed}`;
  }
  if (/^01\d*$/.test(trimmed)) {
    return `+88${trimmed}`;
  }
  return trimmed;
}

export function extractBdMobileLocalPart(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+88")) {
    return trimmed.slice(3);
  }
  return trimmed;
}

export function getTodayYmd(): string {
  const now = new Date();
  const dhakaTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
  return dhakaTime.toISOString().slice(0, 10);
}

export function isValidYmdDate(value: string): boolean {
  if (!YMD_REGEX.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const targetMonthIndex = m - 1 + months;
  const targetYear = y + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const maxDayInMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const clampedDay = Math.min(d, maxDayInMonth);
  return new Date(Date.UTC(targetYear, normalizedMonth, clampedDay)).toISOString().slice(0, 10);
}

export function calculateCompletedYears(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number) as [number, number, number];
  const [ty, tm, td] = toYmd.split("-").map(Number) as [number, number, number];
  let age = ty - fy;
  if (tm < fm || (tm === fm && td < fd)) {
    age -= 1;
  }
  return age;
}

export const FIELD_KEY_ZOD_SCHEMAS: Record<string, z.ZodType<string>> = {
  passport_number: z
    .string()
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => PASSPORT_REGEX.test(v), {
      message: ERROR_MESSAGES.passportLength,
    }),
  phone_primary: z
    .string()
    .transform(normalizeBdMobileInput)
    .refine((v) => BD_MOBILE_FULL_REGEX.test(v), {
      message: ERROR_MESSAGES.invalidBdPhone,
    }),
  phone_secondary: z
    .string()
    .transform(normalizeBdMobileInput)
    .refine((v) => BD_MOBILE_FULL_REGEX.test(v), {
      message: ERROR_MESSAGES.invalidBdPhone,
    }),
  national_id_number: z
    .string()
    .trim()
    .refine((v) => NID_REGEX.test(v), {
      message: ERROR_MESSAGES.nidInvalid,
    }),
  tin_number: z
    .string()
    .trim()
    .refine((v) => TIN_REGEX.test(v), {
      message: ERROR_MESSAGES.tinInvalid,
    }),
};

export const TUITION_ZOD_SCHEMA = z
  .string()
  .trim()
  .refine((v) => TUITION_REGEX.test(v), {
    message: ERROR_MESSAGES.tuitionInvalid,
  });

export function getZodRuleForKey(fieldKey: string): z.ZodType<string> | null {
  if (isTuitionKey(fieldKey)) {
    return TUITION_ZOD_SCHEMA;
  }
  return FIELD_KEY_ZOD_SCHEMAS[fieldKey] ?? null;
}

export function normalizeFieldScalarValue(
  field: Pick<ValidationFieldSpec, "key" | "type">,
  rawValue: unknown,
): string {
  const rawStr =
    typeof rawValue === "number"
      ? String(rawValue)
      : typeof rawValue === "string"
        ? rawValue.trim()
        : "";

  if (!rawStr) return "";

  if (field.key === "passport_number") {
    return rawStr.toUpperCase();
  }
  if (isBdMobileKey(field.key)) {
    return normalizeBdMobileInput(rawStr);
  }
  if (shouldUppercaseField(field)) {
    return rawStr.toUpperCase();
  }
  return rawStr;
}

function getStringAnswer(allAnswers: Record<string, unknown>, key: string): string {
  const val = allAnswers[key];
  return typeof val === "string" ? val.trim() : "";
}

export function validateFieldWithRules(
  field: ValidationFieldSpec,
  rawValue: unknown,
  allAnswers: Record<string, unknown>,
): { error: string | null; normalized: string | number } {
  // Handle tuition even if field.type is "number" or "text"
  if (isTuitionKey(field.key)) {
    const strVal = normalizeFieldScalarValue(field, rawValue);
    if (!strVal) {
      return {
        error: field.required ? ERROR_MESSAGES.requiredField(field.label) : null,
        normalized: "",
      };
    }
    const parsed = TUITION_ZOD_SCHEMA.safeParse(strVal);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? ERROR_MESSAGES.tuitionInvalid,
        normalized: strVal,
      };
    }
    return { error: null, normalized: parsed.data };
  }

  if (field.type === "number") {
    const str =
      typeof rawValue === "number"
        ? String(rawValue)
        : typeof rawValue === "string"
          ? rawValue.trim()
          : "";

    if (!str) {
      return {
        error: field.required ? ERROR_MESSAGES.requiredField(field.label) : null,
        normalized: "",
      };
    }

    const num = Number(str);
    if (!Number.isFinite(num) || num < 0) {
      return { error: "Please write a valid number.", normalized: str };
    }
    return { error: null, normalized: num };
  }

  const normalized = normalizeFieldScalarValue(field, rawValue);

  if (!normalized) {
    return {
      error: field.required ? ERROR_MESSAGES.requiredField(field.label) : null,
      normalized: "",
    };
  }

  // Key-specific Bangladesh Zod rules
  const keyRule = getZodRuleForKey(field.key);
  if (keyRule) {
    const parsed = keyRule.safeParse(normalized);
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? ERROR_MESSAGES.genericValidation,
        normalized,
      };
    }
    return { error: null, normalized: parsed.data };
  }

  if (field.type === "email") {
    const parsed = EMAIL_SCHEMA.safeParse(normalized);
    if (!parsed.success) {
      return { error: ERROR_MESSAGES.wrongEmail, normalized };
    }
    return { error: null, normalized: parsed.data };
  }

  if (field.type === "tel") {
    const digits = normalized.replace(/\D/g, "");
    if (
      !GENERAL_PHONE_ALLOWED_REGEX.test(normalized) ||
      digits.length < 7 ||
      digits.length > 16
    ) {
      return { error: ERROR_MESSAGES.wrongPhone, normalized };
    }
    return { error: null, normalized };
  }

  if (field.type === "date") {
    if (!isValidYmdDate(normalized)) {
      return { error: "Please choose a valid date.", normalized };
    }

    const todayYmd = getTodayYmd();

    if (FUTURE_DATE_KEYS.has(field.key) && normalized < todayYmd) {
      return { error: ERROR_MESSAGES.pastDate, normalized };
    }

    if (STRICT_PAST_DATE_KEYS.has(field.key) && normalized >= todayYmd) {
      return {
        error:
          field.key === "date_of_birth"
            ? ERROR_MESSAGES.dobPast
            : ERROR_MESSAGES.passportIssueBeforeToday,
        normalized,
      };
    }

    if (PAST_OR_TODAY_DATE_KEYS.has(field.key) && normalized > todayYmd) {
      return { error: ERROR_MESSAGES.pastOrTodayDate, normalized };
    }

    const arrival = getStringAnswer(allAnswers, "intended_arrival_date");
    const departure = getStringAnswer(allAnswers, "intended_departure_date");
    const expiry = getStringAnswer(allAnswers, "passport_expiry_date");
    const issue = getStringAnswer(allAnswers, "passport_issue_date");
    const dob = getStringAnswer(allAnswers, "date_of_birth");
    const courseStart = getStringAnswer(allAnswers, "course_start_date");

    if (field.key === "date_of_birth") {
      const refDate = isValidYmdDate(arrival) ? arrival : todayYmd;
      const age = calculateCompletedYears(normalized, refDate);
      if (age < 0 || age > 100) {
        return { error: ERROR_MESSAGES.dobAgeRange, normalized };
      }
    }

    if (field.key === "intended_arrival_date" && isValidYmdDate(dob)) {
      const ageAtTravel = calculateCompletedYears(dob, normalized);
      if (ageAtTravel < 0 || ageAtTravel > 100) {
        return { error: ERROR_MESSAGES.dobAgeRange, normalized };
      }
    }

    if (field.key === "passport_issue_date" && isValidYmdDate(expiry) && normalized >= expiry) {
      return { error: ERROR_MESSAGES.passportIssueBeforeExpiry, normalized };
    }

    if (field.key === "passport_expiry_date") {
      if (isValidYmdDate(issue) && normalized <= issue) {
        return { error: ERROR_MESSAGES.passportIssueBeforeExpiry, normalized };
      }
      if (isValidYmdDate(arrival) && normalized < arrival) {
        return { error: ERROR_MESSAGES.passportBeforeTravel, normalized };
      }
      if (isValidYmdDate(departure)) {
        const minExpiry = addMonthsYmd(departure, 6);
        if (normalized < minExpiry) {
          return { error: ERROR_MESSAGES.passportSixMonthsAfterDeparture, normalized };
        }
      }
    }

    if (field.key === "intended_departure_date") {
      if (isValidYmdDate(arrival) && normalized <= arrival) {
        return { error: ERROR_MESSAGES.departureAfterArrival, normalized };
      }
      if (isValidYmdDate(expiry)) {
        const minExpiry = addMonthsYmd(normalized, 6);
        if (expiry < minExpiry) {
          return { error: ERROR_MESSAGES.passportSixMonthsAfterDeparture, normalized };
        }
      }
    }

    if (field.key === "course_end_date" && isValidYmdDate(courseStart) && normalized < courseStart) {
      return { error: ERROR_MESSAGES.courseEndBeforeStart, normalized };
    }
  }

  return { error: null, normalized };
}

