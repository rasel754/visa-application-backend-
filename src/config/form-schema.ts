import type { ApplicantProfileData, FormField, ProfessionKey } from "./form-data";

export const GENERAL_INFORMATION_FIELDS: FormField[] = [
  {
    key: "applicant_name",
    label: "Applicant's Name",
    type: "text",
    required: true,
    section: "General Information",
  },
  {
    key: "passport_number",
    label: "Passport Number",
    type: "text",
    required: true,
    section: "General Information",
  },
  {
    key: "phone_primary",
    label: "Applicant's Phone Number",
    type: "tel",
    required: true,
    section: "General Information",
  },
  {
    key: "present_address",
    label: "Current Home Address",
    type: "text",
    required: true,
    section: "General Information",
  },
];

function buildEducationFields(
  prefix: string,
  subgroup: string,
  required: boolean,
): FormField[] {
  return [
    {
      key: `${prefix}_years`,
      label: "Years — From & To",
      type: "text",
      required,
      section: "Educational Information",
      subgroup,
    },
    {
      key: `${prefix}_institution`,
      label: "Institution Name",
      type: "text",
      required,
      section: "Educational Information",
      subgroup,
    },
    {
      key: `${prefix}_major`,
      label: "Major",
      type: "text",
      required,
      section: "Educational Information",
      subgroup,
    },
  ];
}

export const EDUCATIONAL_INFORMATION_FIELDS: FormField[] = [
  {
    key: "has_no_education",
    label: "No Formal Education",
    type: "text",
    required: false,
    section: "Educational Information",
  },
  {
    key: "last_education_degree",
    label: "Degree Name",
    type: "text",
    required: true,
    section: "Educational Information",
    subgroup: "Last Education",
  },
  {
    key: "last_education_institution",
    label: "Institution Name",
    type: "text",
    required: false,
    section: "Educational Information",
    subgroup: "Last Education",
  },
  {
    key: "other_education",
    label: "Other Education",
    type: "table",
    required: false,
    section: "Educational Information",
    subgroup: "Other Education",
  },
];

function buildFamilyMemberFields(
  prefix: string,
  subgroup: string,
  nameAndNationalityRequired: boolean,
): FormField[] {
  return [
    {
      key: `${prefix}_name`,
      label: "Name",
      type: "text",
      required: nameAndNationalityRequired,
      section: "Family Information",
      subgroup,
    },
    {
      key: `${prefix}_nationality`,
      label: "Nationality",
      type: "text",
      required: nameAndNationalityRequired,
      section: "Family Information",
      subgroup,
    },
    {
      key: `${prefix}_date_of_birth`,
      label: "Date of Birth",
      type: "date",
      required: false,
      section: "Family Information",
      subgroup,
    },
  ];
}

export const FAMILY_INFORMATION_FIELDS: FormField[] = [
  ...buildFamilyMemberFields("fathers", "Father", true),
  ...buildFamilyMemberFields("mothers", "Mother", true),
];

export const TRAVEL_INFORMATION_FIELDS: FormField[] = [
  {
    key: "destination_city",
    label: "City to Stay",
    type: "text",
    required: true,
    section: "Travel Information",
  },
  {
    key: "intended_arrival_date",
    label: "Date of Arrival",
    type: "date",
    required: true,
    section: "Travel Information",
  },
  {
    key: "intended_departure_date",
    label: "Date of Departure",
    type: "date",
    required: false,
    section: "Travel Information",
  },
  {
    key: "duration_of_stay_days",
    label: "Max Days to Stay",
    type: "number",
    required: true,
    section: "Travel Information",
  },
];

export const COMMON_FORM_FIELDS: FormField[] = [
  ...GENERAL_INFORMATION_FIELDS,
  ...EDUCATIONAL_INFORMATION_FIELDS,
  ...FAMILY_INFORMATION_FIELDS,
  ...TRAVEL_INFORMATION_FIELDS,
];

export const PROFESSION_FORM_PROFILES: Record<ProfessionKey, ApplicantProfileData> = {
  student: {
    label: "Student",
    description: "Applicant is currently studying at a school, college or university.",
    profile_information_fields: [
      {
        key: "institution_name",
        label: "Institution Name (school / college / university)",
        type: "text",
        required: true,
        section: "Work/Study Information",
      },
      {
        key: "institution_address",
        label: "Institution Address",
        type: "text",
        required: true,
        section: "Work/Study Information",
      },
      {
        key: "course_or_class",
        label: "Course / Class / Program",
        type: "text",
        required: true,
        section: "Work/Study Information",
      },
      {
        key: "current_semester_or_year",
        label: "Current Class / Semester",
        type: "text",
        required: true,
        section: "Work/Study Information",
      },
      {
        key: "student_id_number",
        label: "Student ID Number",
        type: "text",
        required: true,
        section: "Work/Study Information",
      },
      {
        key: "institution_phone",
        label: "Institution Contact Number",
        type: "tel",
        required: false,
        section: "Work/Study Information",
      },
      {
        key: "study_start_date",
        label: "Study Start Date",
        type: "date",
        required: false,
        section: "Work/Study Information",
      },
      {
        key: "expected_completion_date",
        label: "Expected Completion Date",
        type: "date",
        required: false,
        section: "Work/Study Information",
      },
    ],
    additional_documents: [],
  },
  businessman: {
    label: "Businessman",
    description: "Applicant owns / co-owns a business (proprietor, partner or company director).",
    profile_information_fields: [
      {
        key: "employer_name",
        label: "Name of Your Employer",
        type: "text",
        required: true,
        section: "Work Information",
      },
      {
        key: "employer_address",
        label: "Employer Address",
        type: "text",
        required: true,
        section: "Work Information",
      },
      {
        key: "date_of_joining",
        label: "Employment Date — From",
        type: "date",
        required: false,
        section: "Work Information",
      },
      {
        key: "employer_phone",
        label: "Contact Number",
        type: "tel",
        required: true,
        section: "Work Information",
      },
      {
        key: "designation",
        label: "Designation",
        type: "text",
        required: true,
        section: "Work Information",
      },
      {
        key: "supervisor_name",
        label: "Supervisor's Name",
        type: "text",
        required: false,
        section: "Work Information",
      },
      {
        key: "supervisor_phone",
        label: "Supervisor's Phone Number",
        type: "tel",
        required: false,
        section: "Work Information",
      },
    ],
    additional_documents: [],
  },
  employee: {
    label: "Employee",
    description: "Applicant works for an employer (private or government job).",
    profile_information_fields: [
      {
        key: "employer_name",
        label: "Employer Name",
        type: "text",
        required: true,
        section: "Work Information",
      },
      {
        key: "employer_address",
        label: "Employer Address",
        type: "text",
        required: true,
        section: "Work Information",
      },
      {
        key: "designation",
        label: "Designation",
        type: "text",
        required: true,
        section: "Work Information",
      },
      {
        key: "employee_id_number",
        label: "Employee ID Number",
        type: "text",
        required: false,
        section: "Work Information",
      },
      {
        key: "date_of_joining",
        label: "Employment Date — From (joining date)",
        type: "date",
        required: false,
        section: "Work Information",
      },
      {
        key: "employer_phone",
        label: "Employer Contact Number",
        type: "tel",
        required: true,
        section: "Work Information",
      },
      {
        key: "monthly_salary",
        label: "Monthly Salary",
        type: "number",
        required: true,
        section: "Work Information",
      },
      {
        key: "supervisor_name",
        label: "Supervisor's Name",
        type: "text",
        required: false,
        section: "Work Information",
      },
      {
        key: "supervisor_phone",
        label: "Supervisor's Phone Number",
        type: "tel",
        required: false,
        section: "Work Information",
      },
      {
        key: "approved_leave_dates",
        label: "Approved Leave Dates (for this trip)",
        type: "text",
        required: true,
        section: "Work Information",
      },
    ],
    additional_documents: [],
  },
};

export const SECTION_DISPLAY_ORDER = [
  "General Information",
  "Personal Information",
  "Contact",
  "Passport",
  "Travel Plan",
  "Travel Information",
  "Host / Invitation",
  "Family Information",
  "Educational Information",
  "Education (Student)",
  "Work Information",
  "Work/Study Information",
  "Business (Businessman)",
  "Employment (Employee)",
  "Financial",
  "Sponsor (Student)",
  "Travel History",
  "Additional Information",
  "Additional Application Data",
] as const;

