import { z } from "zod";
import { ERROR_MESSAGES } from "./errors";

export interface ValidationFieldSpec {
  key: string;
  label: string;
  type: "text" | "date" | "email" | "tel" | "number" | "select" | "textarea" | "table";
  required: boolean;
}

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_SCHEMA = z
  .string()
  .trim()
  .max(70, ERROR_MESSAGES.emailTooLong)
  .email(ERROR_MESSAGES.wrongEmail);
const GENERAL_PHONE_ALLOWED_REGEX = /^[0-9+\-\s()]{7,25}$/;
const HAS_ANY_DIGIT_REGEX = /[\d\u09E6-\u09EF]/;
const HAS_LETTER_REGEX = /[A-Za-z\u0980-\u09FF]/;

export const BD_MOBILE_FULL_REGEX = /^\+8801[3-9]\d{8}$/;
export const BD_MOBILE_LOCAL_REGEX = /^01[3-9]\d{8}$/;
export const PASSPORT_REGEX = /^[A-Z0-9]{9}$/;
export const TUITION_REGEX = /^\d{1,8}$/;
export const NID_REGEX = /^(?:\d{10}|\d{13}|\d{17})$/;
export const TIN_REGEX = /^\d{12}$/;

export interface TextFieldConstraint {
  minLength?: number;
  maxLength: number;
  disallowNumbers?: boolean;
  requireLetter?: boolean;
  requireDigit?: boolean;
  pattern?: RegExp;
  patternError?: string;
}

export interface NumberFieldConstraint {
  min: number;
  max: number;
  maxDigits: number;
  integerOnly?: boolean;
  rangeError?: string;
}

export const TEXT_FIELD_CONSTRAINTS: Record<string, TextFieldConstraint> = {
  // 1) Names (max 40, no numbers)
  surname: { maxLength: 40, disallowNumbers: true, requireLetter: true },
  given_names: { maxLength: 40, disallowNumbers: true, requireLetter: true },
  surname_at_birth: { maxLength: 40, disallowNumbers: true, requireLetter: true },

  // 2) Birthplace, nationalities, religion (max 50, no numbers)
  place_of_birth: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  country_of_birth: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  current_nationality: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  nationality_at_birth: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  other_nationalities: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  religion: { maxLength: 50, disallowNumbers: true, requireLetter: true },

  // 3) Family names (max 60, no numbers)
  fathers_name: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  mothers_name: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  spouse_name: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  spouse_nationality_nid: { maxLength: 60 },

  // Passport & travel
  passport_issued_by: { maxLength: 80, requireLetter: true },
  passport_place_of_issue: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  previous_passport_numbers: {
    maxLength: 80,
    pattern: /^[A-Z0-9,\s/-]+$/,
    patternError: ERROR_MESSAGES.previousPassportsInvalid,
  },
  destination_city: { maxLength: 80, disallowNumbers: true, requireLetter: true },
  port_of_entry: { maxLength: 80, disallowNumbers: true, requireLetter: true },

  // Addresses & contact
  present_address: { minLength: 5, maxLength: 250, requireLetter: true },
  permanent_address: { minLength: 5, maxLength: 250, requireLetter: true },
  residing_country_other: { maxLength: 100, requireLetter: true },
  accommodation_name_address: { minLength: 5, maxLength: 250, requireLetter: true },
  travelling_companions: { maxLength: 250, requireLetter: true },

  // Host & travel history
  host_full_name: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  host_relationship: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  host_address: { minLength: 5, maxLength: 250, requireLetter: true },
  host_phone_email: { maxLength: 100 },
  host_residence_status: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  countries_visited_last_5_years: { maxLength: 300, requireLetter: true },
  previous_visas_this_country: { maxLength: 300, requireLetter: true },
  refusal_details: { maxLength: 300, requireLetter: true },

  // Student
  institution_name: { maxLength: 120, requireLetter: true },
  institution_address: { minLength: 5, maxLength: 250, requireLetter: true },
  course_or_class: { maxLength: 80, requireLetter: true },
  current_semester_or_year: { maxLength: 50 },
  student_id_number: { maxLength: 40 },
  sponsor_name: { maxLength: 60, disallowNumbers: true, requireLetter: true },
  sponsor_relationship: { maxLength: 50, disallowNumbers: true, requireLetter: true },
  sponsor_occupation: { maxLength: 60, disallowNumbers: true, requireLetter: true },

  // Businessman
  business_name: { maxLength: 100, requireLetter: true },
  trade_licence_number: {
    minLength: 3,
    maxLength: 50,
    requireDigit: true,
    pattern: /^[A-Z0-9/\s.-]+$/,
    patternError: ERROR_MESSAGES.tradeLicenceInvalid,
  },
  nature_of_business: { maxLength: 100, requireLetter: true },
  business_address: { minLength: 5, maxLength: 250, requireLetter: true },

  // Employee
  employer_name: { maxLength: 100, requireLetter: true },
  employer_address: { minLength: 5, maxLength: 250, requireLetter: true },
  designation: { maxLength: 60, requireLetter: true },
  department: { maxLength: 60, requireLetter: true },
  employee_id_number: { maxLength: 40 },
  approved_leave_dates: { minLength: 5, maxLength: 80 },
};

export const NUMBER_FIELD_CONSTRAINTS: Record<string, NumberFieldConstraint> = {
  duration_of_stay_days: {
    min: 1,
    max: 365,
    maxDigits: 3,
    integerOnly: true,
    rangeError: ERROR_MESSAGES.durationRange,
  },
  number_of_children: {
    min: 0,
    max: 20,
    maxDigits: 2,
    integerOnly: true,
    rangeError: ERROR_MESSAGES.childrenRange,
  },
  number_of_employees: {
    min: 0,
    max: 1000000,
    maxDigits: 7,
    integerOnly: true,
    rangeError: ERROR_MESSAGES.numberOutOfRange,
  },
  monthly_salary: {
    min: 1,
    max: 100000000,
    maxDigits: 9,
    integerOnly: true,
    rangeError: ERROR_MESSAGES.numberOutOfRange,
  },
  estimated_trip_cost: {
    min: 1,
    max: 100000000,
    maxDigits: 9,
    integerOnly: true,
    rangeError: ERROR_MESSAGES.numberOutOfRange,
  },
};

export function getTextFieldConstraint(key: string): TextFieldConstraint | null {
  return TEXT_FIELD_CONSTRAINTS[key] ?? null;
}

export function getNumberFieldConstraint(key: string): NumberFieldConstraint | null {
  return NUMBER_FIELD_CONSTRAINTS[key] ?? null;
}

export function isNoNumberFieldKey(key: string): boolean {
  return Boolean(TEXT_FIELD_CONSTRAINTS[key]?.disallowNumbers);
}

export function getFieldMaxLength(field: Pick<ValidationFieldSpec, "key" | "type">): number | undefined {
  if (field.type === "email") return 70;
  if (field.type === "tel") return 25;
  if (field.key === "passport_number") return 9;
  if (field.key === "national_id_number") return 17;
  if (field.key === "tin_number") return 12;
  if (field.type === "number") return NUMBER_FIELD_CONSTRAINTS[field.key]?.maxDigits ?? 10;
  return TEXT_FIELD_CONSTRAINTS[field.key]?.maxLength;
}

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
    })
    .refine((v) => /[A-Z]/.test(v) && /\d/.test(v), {
      message: ERROR_MESSAGES.passportFormat,
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
    .refine((v) => NID_REGEX.test(v) && !/^0+$/.test(v), {
      message: ERROR_MESSAGES.nidInvalid,
    }),
  tin_number: z
    .string()
    .trim()
    .refine((v) => TIN_REGEX.test(v) && !/^0+$/.test(v), {
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
    const numConstraint = getNumberFieldConstraint(field.key);
    if (numConstraint) {
      if (numConstraint.integerOnly && !Number.isInteger(num)) {
        return { error: ERROR_MESSAGES.wholeNumber, normalized: str };
      }
      if (num < numConstraint.min || num > numConstraint.max) {
        return {
          error: numConstraint.rangeError ?? ERROR_MESSAGES.numberOutOfRange,
          normalized: str,
        };
      }
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
      return {
        error: parsed.error.issues[0]?.message ?? ERROR_MESSAGES.wrongEmail,
        normalized,
      };
    }
    return { error: null, normalized: parsed.data };
  }

  if (field.type === "tel") {
    const digits = normalized.replace(/\D/g, "");
    if (
      !GENERAL_PHONE_ALLOWED_REGEX.test(normalized) ||
      digits.length < 7 ||
      digits.length > 15
    ) {
      return { error: ERROR_MESSAGES.wrongPhone, normalized };
    }
    const localBd = digits.startsWith("8801") ? digits.slice(2) : digits;
    if (localBd.startsWith("01") && !BD_MOBILE_LOCAL_REGEX.test(localBd)) {
      return { error: ERROR_MESSAGES.invalidBdPhone, normalized };
    }
    return { error: null, normalized };
  }

  if (field.type === "text" || field.type === "textarea") {
    const constraint = getTextFieldConstraint(field.key);
    const maxLen = constraint?.maxLength ?? (field.type === "textarea" ? 500 : 250);
    if (constraint?.disallowNumbers && HAS_ANY_DIGIT_REGEX.test(normalized)) {
      return { error: ERROR_MESSAGES.numbersNotAllowed, normalized };
    }
    if (normalized.length > maxLen) {
      return { error: ERROR_MESSAGES.maxLengthExceeded(maxLen), normalized };
    }
    if (constraint?.minLength && normalized.length < constraint.minLength) {
      return {
        error: ERROR_MESSAGES.minLengthRequired(constraint.minLength),
        normalized,
      };
    }
    if (constraint?.requireLetter && !HAS_LETTER_REGEX.test(normalized)) {
      return { error: ERROR_MESSAGES.mustContainLetter, normalized };
    }
    if (constraint?.requireDigit && !/\d/.test(normalized)) {
      return {
        error: constraint.patternError ?? ERROR_MESSAGES.genericValidation,
        normalized,
      };
    }
    if (constraint?.pattern && !constraint.pattern.test(normalized)) {
      return {
        error: constraint.patternError ?? ERROR_MESSAGES.genericValidation,
        normalized,
      };
    }
  }

  if (field.type === "date") {
    if (!isValidYmdDate(normalized)) {
      return { error: "Please choose a valid date.", normalized };
    }
    const year = Number(normalized.slice(0, 4));
    if (year < 1900 || year > 2100) {
      return { error: ERROR_MESSAGES.invalidDateRange, normalized };
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

    if (field.key === "passport_issue_date") {
      if (isValidYmdDate(dob) && normalized < dob) {
        return { error: ERROR_MESSAGES.passportIssueBeforeDob, normalized };
      }
      if (isValidYmdDate(expiry) && normalized >= expiry) {
        return { error: ERROR_MESSAGES.passportIssueBeforeExpiry, normalized };
      }
    }

    if (
      (field.key === "fathers_date_of_birth" || field.key === "mothers_date_of_birth") &&
      isValidYmdDate(dob) &&
      normalized >= dob
    ) {
      return { error: ERROR_MESSAGES.parentDobAfterApplicant, normalized };
    }

    if (
      (field.key === "date_of_joining" || field.key === "business_start_date") &&
      isValidYmdDate(dob) &&
      normalized <= dob
    ) {
      return { error: ERROR_MESSAGES.dateAfterDob, normalized };
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

