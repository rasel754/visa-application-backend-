import fs from "node:fs";
import path from "node:path";
import { Profession } from "@prisma/client";
import { z } from "zod";
import { env } from "./env";

export const PROFESSION_KEYS = ["student", "businessman", "employee"] as const;
export type ProfessionKey = (typeof PROFESSION_KEYS)[number];

const fieldTypeSchema = z.enum([
  "text",
  "date",
  "email",
  "tel",
  "number",
  "select",
  "textarea",
  "table",
]);

const fieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: fieldTypeSchema,
  required: z.boolean(),
  section: z.string().min(1),
});

const documentSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean(),
  upload: z.boolean().optional(),
  note: z.string().optional(),
});

const applicantProfileSchema = z.object({
  label: z.string().min(1),
  description: z.string().min(1),
  profile_information_fields: z.array(fieldSchema),
  additional_documents: z.array(documentSchema),
});

const visitVisaSchema = z.object({
  official_visa_name: z.string().min(1),
  official_form: z.string().default(""),
  source_url: z.string().optional().default(""),
  field_source: z.string().optional(),
  last_verified_at: z.string().optional().default(""),
  common_information_fields: z.array(fieldSchema).min(1),
  common_required_documents: z.array(documentSchema),
  applicant_profiles: z.object({
    student: applicantProfileSchema,
    businessman: applicantProfileSchema,
    employee: applicantProfileSchema,
  }),
});

const countrySchema = z.object({
  rank: z.number(),
  country: z.string().min(1),
  country_code: z.string().min(1),
  region: z.string().min(1),
  applicant_nationality: z.string().optional(),
  visa_required_for_bangladeshi_ordinary_passport: z.boolean().optional(),
  official_authority: z.string().default(""),
  official_application_system: z.string().optional().default(""),
  source_regime: z.string().optional(),
  country_notes: z.string().optional(),
  visa_types: z.object({
    visit: visitVisaSchema,
  }),
});

const formDataFileSchema = z.object({
  _meta: z.record(z.string(), z.unknown()).optional(),
  countries: z.array(countrySchema).min(1),
});

export type FieldType = z.infer<typeof fieldTypeSchema>;
export type FormField = z.infer<typeof fieldSchema>;
export type FormDocument = z.infer<typeof documentSchema>;
export type ApplicantProfileData = z.infer<typeof applicantProfileSchema>;
export type VisitVisaData = z.infer<typeof visitVisaSchema>;
export type CountryData = z.infer<typeof countrySchema>;

export interface CountrySummary {
  country: string;
  country_code: string;
  region: string;
}

export interface VisitFormPayload {
  country: string;
  country_code: string;
  region: string;
  official_authority: string;
  official_application_system: string;
  visa_type: "visit";
  official_visa_name: string;
  official_form: string;
  source_url: string;
  last_verified_at: string;
  common_information_fields: FormField[];
  common_required_documents: FormDocument[];
  applicant_profiles: Record<ProfessionKey, ApplicantProfileData>;
}

export interface GroupedFormDocument extends FormDocument {
  group: "common" | ProfessionKey;
}

export interface ResolvedProfessionForm {
  country: string;
  country_code: string;
  visa_type: "visit";
  profession: ProfessionKey | null;
  profession_label: string;
  official_visa_name: string;
  official_form: string;
  official_authority: string;
  commonFields: FormField[];
  profileFields: FormField[];
  allFields: FormField[];
  commonDocuments: GroupedFormDocument[];
  additionalDocuments: GroupedFormDocument[];
  allDocuments: GroupedFormDocument[];
}

export interface SectionGroup {
  section: string;
  fields: FormField[];
}

let loadedCountries: CountryData[] = [];
const countriesByCode = new Map<string, CountryData>();

function resolveFormDataPath(): string {
  if (path.isAbsolute(env.FORM_DATA_PATH)) {
    return env.FORM_DATA_PATH;
  }

  const candidates = [
    path.resolve(process.cwd(), env.FORM_DATA_PATH),
    path.resolve(__dirname, "..", "..", env.FORM_DATA_PATH),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

export function initFormData(): void {
  const filePath = resolveFormDataPath();
  if (!fs.existsSync(filePath)) {
    console.error(`FATAL: Form configuration file not found at: ${filePath}`);
    console.error(
      "Set FORM_DATA_PATH in backend/.env to point to visa_100_countries_visit_visa_official_fields.json.",
    );
    process.exit(1);
  }

  let rawJson: unknown;
  try {
    const content = fs.readFileSync(filePath, "utf8");
    rawJson = JSON.parse(content) as unknown;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown read/parse error";
    console.error(`FATAL: Could not parse form configuration JSON (${filePath}): ${message}`);
    process.exit(1);
  }

  const parsed = formDataFileSchema.safeParse(rawJson);
  if (!parsed.success) {
    console.error(`FATAL: Form configuration JSON failed validation (${filePath}):`);
    for (const issue of parsed.error.issues.slice(0, 10)) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  loadedCountries = parsed.data.countries;
  countriesByCode.clear();
  for (const country of loadedCountries) {
    countriesByCode.set(country.country_code.toUpperCase(), country);
  }

  console.log(`Loaded visit visa form configuration for ${loadedCountries.length} countries from ${filePath}`);
}

export function listCountries(): CountrySummary[] {
  return loadedCountries.map((c) => ({
    country: c.country,
    country_code: c.country_code,
    region: c.region,
  }));
}

export function getCountry(countryCode: string): CountryData | null {
  return countriesByCode.get(countryCode.trim().toUpperCase()) ?? null;
}

export function resolveProfessionKey(raw: string | null | undefined): ProfessionKey | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "student") return "student";
  if (normalized === "businessman") return "businessman";
  if (normalized === "employee") return "employee";
  return null;
}

export function toPrismaProfession(key: ProfessionKey): Profession {
  if (key === "student") return Profession.STUDENT;
  if (key === "businessman") return Profession.BUSINESSMAN;
  return Profession.EMPLOYEE;
}

export function fromPrismaProfession(profession: Profession | null | undefined): ProfessionKey | null {
  if (profession === Profession.STUDENT) return "student";
  if (profession === Profession.BUSINESSMAN) return "businessman";
  if (profession === Profession.EMPLOYEE) return "employee";
  return null;
}

export function formatProfessionLabel(profession: Profession | ProfessionKey | null | undefined): string {
  const key =
    profession === "STUDENT" || profession === "student"
      ? "student"
      : profession === "BUSINESSMAN" || profession === "businessman"
        ? "businessman"
        : profession === "EMPLOYEE" || profession === "employee"
          ? "employee"
          : null;
  if (key === "student") return "Student";
  if (key === "businessman") return "Businessman";
  if (key === "employee") return "Employee";
  return "Not specified";
}

export function getVisitForm(countryCode: string): VisitFormPayload | null {
  const country = getCountry(countryCode);
  if (!country) {
    return null;
  }

  const visit = country.visa_types.visit;
  return {
    country: country.country,
    country_code: country.country_code,
    region: country.region,
    official_authority: country.official_authority,
    official_application_system: country.official_application_system ?? "",
    visa_type: "visit",
    official_visa_name: visit.official_visa_name,
    official_form: visit.official_form,
    source_url: visit.source_url ?? "",
    last_verified_at: visit.last_verified_at ?? "",
    common_information_fields: visit.common_information_fields,
    common_required_documents: visit.common_required_documents,
    applicant_profiles: visit.applicant_profiles,
  };
}

export function resolveVisitFormForProfession(
  countryCode: string,
  professionKey: ProfessionKey | null,
): ResolvedProfessionForm | null {
  const country = getCountry(countryCode);
  if (!country) {
    return null;
  }

  const visit = country.visa_types.visit;
  const profile = professionKey ? visit.applicant_profiles[professionKey] : null;

  const commonFields = visit.common_information_fields;
  const profileFields = profile ? profile.profile_information_fields : [];
  const commonDocuments: GroupedFormDocument[] = visit.common_required_documents.map((doc) => ({
    ...doc,
    group: "common",
  }));
  const additionalDocuments: GroupedFormDocument[] = profile && professionKey
    ? profile.additional_documents.map((doc) => ({
        ...doc,
        group: professionKey,
      }))
    : [];

  return {
    country: country.country,
    country_code: country.country_code,
    visa_type: "visit",
    profession: professionKey,
    profession_label: profile ? profile.label : formatProfessionLabel(professionKey),
    official_visa_name: visit.official_visa_name,
    official_form: visit.official_form,
    official_authority: country.official_authority,
    commonFields,
    profileFields,
    allFields: [...commonFields, ...profileFields],
    commonDocuments,
    additionalDocuments,
    allDocuments: [...commonDocuments, ...additionalDocuments],
  };
}

export function groupFieldsBySection(fields: FormField[]): SectionGroup[] {
  const groups = new Map<string, FormField[]>();
  for (const field of fields) {
    const existing = groups.get(field.section);
    if (existing) {
      existing.push(field);
    } else {
      groups.set(field.section, [field]);
    }
  }
  return Array.from(groups.entries()).map(([section, sectionFields]) => ({
    section,
    fields: sectionFields,
  }));
}
