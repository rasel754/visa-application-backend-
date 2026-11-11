import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "./env";

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

const categorySchema = z.object({
  official_visa_name: z.string().min(1),
  official_form: z.string().default(""),
  application_fields: z.array(fieldSchema).min(1),
  required_documents: z.array(documentSchema),
});

const countrySchema = z.object({
  rank: z.number(),
  country: z.string().min(1),
  country_code: z.string().min(1),
  region: z.string().min(1),
  applicant_nationality: z.string().optional(),
  official_authority: z.string().default(""),
  official_application_system: z.string().optional(),
  source_regime: z.string().optional(),
  country_notes: z.string().optional(),
  categories: z.record(z.string().min(1), categorySchema),
});

const formDataFileSchema = z.object({
  _meta: z.record(z.string(), z.unknown()).optional(),
  countries: z.array(countrySchema).min(1),
});

export type FieldType = z.infer<typeof fieldTypeSchema>;
export type FormField = z.infer<typeof fieldSchema>;
export type FormDocument = z.infer<typeof documentSchema>;
export type CategoryData = z.infer<typeof categorySchema>;
export type CountryData = z.infer<typeof countrySchema>;

export interface CountrySummary {
  country: string;
  country_code: string;
  region: string;
  categories: string[];
}

export interface CategoryFormPayload {
  country: string;
  country_code: string;
  official_visa_name: string;
  official_form: string;
  official_authority: string;
  fields: FormField[];
  documents: FormDocument[];
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
  const fromCwd = path.resolve(process.cwd(), env.FORM_DATA_PATH);
  if (fs.existsSync(fromCwd)) {
    return fromCwd;
  }
  return path.resolve(__dirname, "..", "..", env.FORM_DATA_PATH);
}

export function initFormData(): void {
  const filePath = resolveFormDataPath();
  if (!fs.existsSync(filePath)) {
    console.error(`FATAL: Form configuration file not found at: ${filePath}`);
    console.error("Set FORM_DATA_PATH in backend/.env to point to visa_100_countries_official_fields.json.");
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

  console.log(`Loaded form configuration for ${loadedCountries.length} countries from ${filePath}`);
}

export function listCountries(): CountrySummary[] {
  return loadedCountries.map((c) => ({
    country: c.country,
    country_code: c.country_code,
    region: c.region,
    categories: Object.keys(c.categories),
  }));
}

export function getCountry(countryCode: string): CountryData | null {
  return countriesByCode.get(countryCode.trim().toUpperCase()) ?? null;
}

export function getCategory(countryCode: string, category: string): CategoryFormPayload | null {
  const country = getCountry(countryCode);
  if (!country) {
    return null;
  }

  const normalizedCategory = category.trim().toLowerCase();
  const matchedEntry = Object.entries(country.categories).find(
    ([key]) => key.toLowerCase() === normalizedCategory,
  );
  if (!matchedEntry) {
    return null;
  }

  const [, catData] = matchedEntry;
  return {
    country: country.country,
    country_code: country.country_code,
    official_visa_name: catData.official_visa_name,
    official_form: catData.official_form,
    official_authority: country.official_authority,
    fields: catData.application_fields,
    documents: catData.required_documents,
  };
}

export function resolveCategoryKey(countryCode: string, category: string): string | null {
  const country = getCountry(countryCode);
  if (!country) {
    return null;
  }
  const normalized = category.trim().toLowerCase();
  const key = Object.keys(country.categories).find((k) => k.toLowerCase() === normalized);
  return key ?? null;
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

