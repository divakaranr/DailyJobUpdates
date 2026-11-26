export const ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_RANK: Record<Role, number> = {
  VIEWER: 0,
  EDITOR: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  EDITOR: 'Content Editor',
  VIEWER: 'Viewer',
};

export function hasRole(role: Role | null | undefined, minimum: Role): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const JOB_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'SCHEDULED',
  'PUBLISHED',
  'EXPIRED',
  'ARCHIVED',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending approval',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  EXPIRED: 'Expired',
  ARCHIVED: 'Archived',
};

export const WORK_MODES = ['REMOTE', 'WFH', 'HYBRID', 'ONSITE'] as const;
export type WorkMode = (typeof WORK_MODES)[number];
export const WORK_MODE_LABELS: Record<WorkMode, string> = {
  REMOTE: 'Remote',
  WFH: 'Work From Home',
  HYBRID: 'Hybrid',
  ONSITE: 'Onsite',
};

export const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  INTERNSHIP: 'Internship',
};

export const SALARY_TYPES = ['ANNUAL', 'MONTHLY', 'HOURLY'] as const;
export type SalaryType = (typeof SALARY_TYPES)[number];
export const SALARY_TYPE_LABELS: Record<SalaryType, string> = {
  ANNUAL: 'per year',
  MONTHLY: 'per month',
  HOURLY: 'per hour',
};

export const TAG_CATEGORIES = [
  'EXPERIENCE',
  'WORK_MODE',
  'EMPLOYMENT_TYPE',
  'SKILL',
  'QUALIFICATION',
  'JOB_CATEGORY',
  'OTHER',
] as const;
export type TagCategory = (typeof TAG_CATEGORIES)[number];
export const TAG_CATEGORY_LABELS: Record<TagCategory, string> = {
  EXPERIENCE: 'Experience',
  WORK_MODE: 'Work Mode',
  EMPLOYMENT_TYPE: 'Employment Type',
  SKILL: 'Skills',
  QUALIFICATION: 'Qualification',
  JOB_CATEGORY: 'Job Category',
  OTHER: 'Other',
};

export const SOURCE_TYPES = ['MANUAL', 'URL'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const EXTRACTION_STATUSES = [
  'QUEUED',
  'FETCHING',
  'EXTRACTING',
  'READY',
  'FAILED',
  'PUBLISHED',
  'DISCARDED',
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const LLM_PROVIDERS = ['gemini', 'openai', 'groq', 'ollama', 'heuristic'] as const;
export type LlmProviderName = (typeof LLM_PROVIDERS)[number];
export const LLM_PROVIDER_LABELS: Record<LlmProviderName, string> = {
  gemini: 'Google Gemini',
  openai: 'OpenAI',
  groq: 'Groq',
  ollama: 'Ollama (self-hosted)',
  heuristic: 'Rule-based (no LLM)',
};

export const JOB_ACTIONS = ['draft', 'submit', 'publish', 'schedule'] as const;
export type JobAction = (typeof JOB_ACTIONS)[number];
