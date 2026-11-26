import { z } from 'zod';
import {
  EMPLOYMENT_TYPES,
  JOB_ACTIONS,
  JOB_STATUSES,
  LLM_PROVIDERS,
  ROLES,
  SALARY_TYPES,
  TAG_CATEGORIES,
  USER_STATUSES,
  WORK_MODES,
  type EmploymentType,
  type SalaryType,
  type WorkMode,
} from './enums';
import { isHttpUrl } from './text';

const emptyToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const toNumberOrNull = (v: unknown) => {
  if (v === '' || v === undefined || v === null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url('Must be a valid URL')
  .refine(isHttpUrl, 'Only http:// and https:// URLs are allowed');

const optionalUrl = z.preprocess(emptyToNull, httpUrlSchema.nullable()).optional();
const nullableText = (max: number) => z.preprocess(emptyToNull, z.string().trim().max(max).nullable()).optional();
const ymd = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .nullable(),
).optional();
const nullableNumber = (schema: z.ZodNumber) => z.preprocess(toNumberOrNull, schema.nullable()).optional();

export const fieldMetaSchema = z.object({
  inferred: z.array(z.string()).default([]),
  ambiguities: z.array(z.object({ field: z.string(), issue: z.string() })).default([]),
});
export type FieldMeta = z.infer<typeof fieldMetaSchema>;

/** Shared input contract for manual creation, editing and extraction publishing. */
export const jobInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Title is required').max(200),
    companyName: z.string().trim().min(1, 'Company is required').max(200),
    companyWebsite: optionalUrl,
    companyLogoUrl: optionalUrl,
    location: nullableText(200),
    workMode: z.preprocess(emptyToNull, z.enum(WORK_MODES).nullable()).optional(),
    employmentType: z.preprocess(emptyToNull, z.enum(EMPLOYMENT_TYPES).nullable()).optional(),
    qualification: nullableText(300),
    experienceText: nullableText(200),
    minExperience: nullableNumber(z.number().min(0).max(50)),
    maxExperience: nullableNumber(z.number().min(0).max(50)),
    isFresherFriendly: z.boolean().default(false),
    skills: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    preferredSkills: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
    summary: nullableText(1500),
    description: nullableText(30000),
    responsibilities: z.array(z.string().trim().min(1).max(1000)).max(60).default([]),
    salaryMin: nullableNumber(z.number().min(0).max(1e10)),
    salaryMax: nullableNumber(z.number().min(0).max(1e10)),
    currency: z.preprocess(
      (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim().toUpperCase()) : v),
      z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code').nullable(),
    ).optional(),
    salaryType: z.preprocess(emptyToNull, z.enum(SALARY_TYPES).nullable()).optional(),
    applicationUrl: optionalUrl,
    sourceUrl: optionalUrl,
    deadline: ymd,
    walkInDate: ymd,
    postedDate: ymd,
    industry: nullableText(120),
    openings: nullableNumber(z.number().int().min(1).max(100000)),
    tagIds: z.array(z.string().min(1)).max(80).default([]),
    autoTag: z.boolean().default(false),
    action: z.enum(JOB_ACTIONS).default('draft'),
    scheduledAt: z.preprocess(emptyToNull, z.string().datetime({ offset: true }).nullable()).optional(),
    fieldMeta: fieldMetaSchema.optional(),
    /** Confirms publishing even though a likely duplicate exists. */
    confirmDuplicate: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.minExperience != null && v.maxExperience != null && v.minExperience > v.maxExperience) {
      ctx.addIssue({ code: 'custom', path: ['maxExperience'], message: 'Max experience must be ≥ min experience' });
    }
    if (v.salaryMin != null && v.salaryMax != null && v.salaryMin > v.salaryMax) {
      ctx.addIssue({ code: 'custom', path: ['salaryMax'], message: 'Max salary must be ≥ min salary' });
    }
    if (v.action === 'schedule' && !v.scheduledAt) {
      ctx.addIssue({ code: 'custom', path: ['scheduledAt'], message: 'Choose a publication date and time' });
    }
  });
export type JobInput = z.infer<typeof jobInputSchema>;
export type JobInputRaw = z.input<typeof jobInputSchema>;

const csv = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.string().max(80)).max(30).default([]),
);

export const jobQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
  sort: z.enum(['latest', 'oldest', 'relevance']).default('latest'),
  workMode: csv.pipe(z.array(z.enum(WORK_MODES))),
  employmentType: csv.pipe(z.array(z.enum(EMPLOYMENT_TYPES))),
  experience: z.enum(['freshers', 'experienced']).optional(),
  experienceLevel: csv,
  category: csv,
  skills: csv,
  qualification: csv,
  tags: csv,
  location: z.string().trim().max(100).optional(),
  company: z.string().trim().max(100).optional(),
  postedWithin: z.coerce.number().int().min(1).max(365).optional(),
  status: z.enum(['active', 'expired', 'all']).default('active'),
});
export type JobQuery = z.infer<typeof jobQuerySchema>;

export const adminJobQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(JOB_STATUSES).optional(),
  sourceType: z.enum(['MANUAL', 'URL']).optional(),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z
    .string()
    .min(8, 'At least 8 characters')
    .max(128)
    .regex(/[A-Za-z]/, 'Include a letter')
    .regex(/\d/, 'Include a number'),
});
export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(1).max(128),
});

export const createUserSchema = registerSchema.extend({ role: z.enum(ROLES) });
export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.enum(TAG_CATEGORIES),
  synonyms: z.array(z.string().trim().min(1).max(60)).max(60).default([]),
  description: nullableText(300),
  isActive: z.boolean().default(true),
});
export const tagUpdateSchema = tagInputSchema.partial();

export const extractionSubmitSchema = z.object({
  url: httpUrlSchema,
  forceBrowser: z.boolean().default(false),
});

export const llmSettingsSchema = z.object({
  provider: z.enum(LLM_PROVIDERS),
  model: z.string().trim().min(1).max(120),
  fallbackProvider: z.preprocess(emptyToNull, z.enum(LLM_PROVIDERS).nullable()).default(null),
  fallbackModel: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()).default(null),
  temperature: z.coerce.number().min(0).max(1).default(0.1),
  timeoutMs: z.coerce.number().int().min(2000).max(180_000).default(45_000),
  maxRetries: z.coerce.number().int().min(0).max(5).default(2),
  maxInputChars: z.coerce.number().int().min(2000).max(200_000).default(24_000),
  promptVersion: z.string().trim().min(1).max(40).default('job-extract@v1'),
});
export type LlmSettings = z.infer<typeof llmSettingsSchema>;

export const generalSettingsSchema = z.object({
  defaultExpiryDays: z.coerce.number().int().min(1).max(365).default(30),
  showUnavailableFields: z.boolean().default(true),
  notSpecifiedText: z.string().trim().min(1).max(40).default('Not specified'),
  respectRobotsTxt: z.boolean().default(true),
  requireApprovalForEditors: z.boolean().default(true),
  includeSourceAttribution: z.boolean().default(true),
});
export type GeneralSettings = z.infer<typeof generalSettingsSchema>;

// ---------------------------------------------------------------------------
// LLM output contract
// ---------------------------------------------------------------------------

export function normalizeWorkMode(v: unknown): WorkMode | null {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  if (WORK_MODES.includes(v.toUpperCase() as WorkMode)) return v.toUpperCase() as WorkMode;
  if (/work\s*from\s*home|wfh/.test(s)) return 'WFH';
  if (/hybrid/.test(s)) return 'HYBRID';
  if (/remote|telecommute/.test(s)) return 'REMOTE';
  if (/on\s*-?\s*site|office|in[- ]person/.test(s)) return 'ONSITE';
  return null;
}

export function normalizeEmploymentType(v: unknown): EmploymentType | null {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase().replace(/[_-]/g, ' ');
  if (/intern/.test(s)) return 'INTERNSHIP';
  if (/part\s*time/.test(s)) return 'PART_TIME';
  if (/contract|temporary|freelance|c2h/.test(s)) return 'CONTRACT';
  if (/full\s*time|permanent/.test(s)) return 'FULL_TIME';
  return null;
}

export function normalizeSalaryType(v: unknown): SalaryType | null {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  if (/hour/.test(s)) return 'HOURLY';
  if (/month/.test(s)) return 'MONTHLY';
  if (/year|annum|annual|lpa|ctc/.test(s)) return 'ANNUAL';
  return null;
}

const llmString = z.preprocess(
  (v) => (typeof v === 'number' ? String(v) : typeof v === 'string' && v.trim() === '' ? null : v),
  z.string().nullable(),
).catch(null);
const llmNumber = z.preprocess(toNumberOrNull, z.number().nullable()).catch(null);
const llmStringArray = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.split(/[,;\n]/) : Array.isArray(v) ? v : []),
    z.array(z.any()),
  )
  .transform((arr) => arr.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean))
  .catch([]);

/**
 * Lenient schema for model output. Unknown/invalid values degrade to null rather
 * than failing the whole extraction; missing required structure still fails.
 */
export const llmExtractionSchema = z.object({
  title: llmString,
  companyName: llmString,
  location: llmString,
  workMode: z.any().transform(normalizeWorkMode),
  employmentType: z.any().transform(normalizeEmploymentType),
  qualification: llmString,
  experienceText: llmString,
  minExperienceYears: llmNumber,
  maxExperienceYears: llmNumber,
  isFresherFriendly: z.boolean().nullable().catch(null).default(null),
  skills: llmStringArray.default([]),
  preferredSkills: llmStringArray.default([]),
  summary: llmString,
  description: llmString,
  responsibilities: llmStringArray.default([]),
  salaryMin: llmNumber,
  salaryMax: llmNumber,
  salaryCurrency: llmString,
  salaryType: z.any().transform(normalizeSalaryType),
  applicationUrl: llmString,
  deadline: llmString,
  walkInDate: llmString,
  postedDate: llmString,
  category: llmString,
  industry: llmString,
  openings: llmNumber,
  inferredFields: llmStringArray.default([]),
  ambiguities: z
    .array(z.object({ field: z.string().catch('general'), issue: z.string() }))
    .catch([])
    .default([]),
  suggestedTags: llmStringArray.default([]),
});
export type LlmExtraction = z.infer<typeof llmExtractionSchema>;
