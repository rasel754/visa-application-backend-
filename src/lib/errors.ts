export type FieldErrors = Record<string, string>;

export interface ApiErrorBody {
  success: false;
  message: string;
  fieldErrors: FieldErrors;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly fieldErrors: FieldErrors;

  constructor(statusCode: number, message: string, fieldErrors: FieldErrors = {}) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

export function toSimpleFieldName(label: string): string {
  const withoutDashNote = label.replace(/\s*—\s*repeating table\s*$/i, "");
  const withoutParens = withoutDashNote
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleaned = (withoutParens || label).replace(/^applicant's\s+/i, "").trim();
  return cleaned.toLowerCase();
}

export const ERROR_MESSAGES = {
  requiredField: (label: string): string => `Please write your ${toSimpleFieldName(label)}.`,
  requiredFile: (label: string): string => `Please give your ${toSimpleFieldName(label)}.`,
  wrongEmail: "This email does not look right. Please check and write again.",
  emailTooLong: "Email address must be 70 characters or fewer.",
  wrongPhone: "Please write a correct phone number.",
  invalidBdPhone: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX).",
  passportLength: "Passport number must be exactly 9 characters.",
  passportFormat: "Passport number must be 9 letters and numbers (e.g. A01234567).",
  previousPassportsInvalid:
    "Previous passport numbers can only contain letters, numbers, commas, slashes, or hyphens.",
  tuitionInvalid: "Tuition fee can contain numbers only, maximum 8 digits.",
  nidInvalid: "NID number must be 10, 13 or 17 digits.",
  tinInvalid: "TIN number must be exactly 12 digits.",
  tradeLicenceInvalid: "Enter a valid Trade Licence number (must include digits).",
  numbersNotAllowed: "Numbers are not allowed in this field.",
  mustContainLetter: "Please enter valid text (letters are required).",
  maxLengthExceeded: (max: number): string => `Must be ${max} characters or fewer.`,
  minLengthRequired: (min: number): string => `Please write at least ${min} characters.`,
  wholeNumber: "Please enter a whole number.",
  durationRange: "Duration of stay must be between 1 and 365 days.",
  childrenRange: "Number of children must be between 0 and 20.",
  numberOutOfRange: "Please enter a realistic positive number.",
  pastDate: "This date has already passed. Please choose a future date.",
  pastOrTodayDate: "Please choose a date on or before today.",
  invalidDateRange: "Please choose a valid date between 1900 and 2100.",
  dobPast: "Date of birth must be in the past.",
  dobAgeRange: "Applicant age at travel must be between 0 and 100 years.",
  parentDobAfterApplicant:
    "Parent's date of birth must be before the applicant's date of birth.",
  passportIssueBeforeDob: "Passport issue date cannot be before your date of birth.",
  dateAfterDob: "This date must be after your date of birth.",
  passportIssueBeforeToday: "Passport issue date must be before today.",
  passportIssueBeforeExpiry: "Passport issue date must be before the expiry date.",
  passportBeforeTravel:
    "Your passport will expire before your travel date. Please check the dates.",
  passportSixMonthsAfterDeparture:
    "Your passport must be valid for at least 6 months after your departure date.",
  departureAfterArrival: "Departure date must be after your arrival date.",
  courseEndBeforeStart: "Course end date cannot be before the start date.",
  fileTooBig: "This file is too big. Please give a file smaller than 10 MB.",
  wrongFileType: "Only PDF or photo (JPG/PNG) files are allowed here.",
  uploadFailed: "Your file could not be sent. Please check your internet and try again.",
  loginWrong: "Email or password is wrong. Please try again.",
  loginTooManyTries: "Too many tries. Please wait 15 minutes and try again.",
  sessionExpired: "You have been logged out. Please log in again.",
  serverError: "Something went wrong on our side. Please try again in a few minutes.",
  formNotFound: "This link is not correct. Please contact the IGL Visa Help office.",
  genericValidation: "Please check the marked boxes and try again.",
  otpRequired: "Please verify your mobile number with an OTP code before submitting.",
  otpWrong: "Code is wrong. Please check the 6-digit code and try again.",
  otpExpired: "Code expired — tap Resend for a new one.",
  otpTooManyAttempts:
    "Too many wrong tries. This code is no longer valid — tap Resend for a new one.",
  otpTooManySends:
    "You have asked for too many codes. Please wait 15 minutes and try again.",
  otpUnavailable:
    "Phone verification is not available right now. Please contact the IGL Visa Help office.",
  otpSmsFailed:
    "We could not send the code right now. Please try again in a few minutes.",
  otpPhoneMismatch:
    "Your verified phone number does not match the primary mobile number on the form. Please verify again.",
  otpAlreadyUsed:
    "This verification code has already been used. Please request a new code.",
  otpRateLimit: "Too many verification tries. Please wait 15 minutes and try again.",
  otpPhoneBlocked:
    "This number cannot receive a verification code. Please contact our office.",
  phoneAlreadyBlocked: "This mobile number is already blocked.",
} as const;
