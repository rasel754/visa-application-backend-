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
  const withoutParens = withoutDashNote.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
  const cleaned = (withoutParens || label).replace(/^applicant's\s+/i, "").trim();
  return cleaned.toLowerCase();
}

export const ERROR_MESSAGES = {
  requiredField: (label: string): string => `Please write your ${toSimpleFieldName(label)}.`,
  requiredFile: (label: string): string => `Please give your ${toSimpleFieldName(label)}.`,
  wrongEmail: "This email does not look right. Please check and write again.",
  wrongPhone: "Please write a correct mobile number.",
  pastDate: "This date has already passed. Please choose a future date.",
  passportBeforeTravel: "Your passport will expire before your travel date. Please check the dates.",
  fileTooBig: "This file is too big. Please give a file smaller than 10 MB.",
  wrongFileType: "Only PDF or photo (JPG/PNG) files are allowed here.",
  uploadFailed: "Your file could not be sent. Please check your internet and try again.",
  loginWrong: "Email or password is wrong. Please try again.",
  loginTooManyTries: "Too many tries. Please wait 15 minutes and try again.",
  sessionExpired: "You have been logged out. Please log in again.",
  serverError: "Something went wrong on our side. Please try again in a few minutes.",
  formNotFound: "This link is not correct. Please contact the IGL Visa Help office.",
  genericValidation: "Please check the marked boxes and try again.",
} as const;

