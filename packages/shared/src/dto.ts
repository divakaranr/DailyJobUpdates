import type {
  EmploymentType,
  ExtractionStatus,
  JobStatus,
  LlmProviderName,
  Role,
  SalaryType,
  SourceType,
  TagCategory,
  UserStatus,
  WorkMode,
} from './enums';
import type { FieldMeta, JobInput } from './schemas';
import type { TagAssignment } from './tagging';

export interface TagDTO {
  id: string;
  name: string;
  slug: string;
  category: TagCategory;
  synonyms: string[];
  description: string | null;
  isActive: boolean;
  isSystem: boolean;
  jobCount?: number;
}

export interface CompanyDTO {
  id: string;
  name: string;
  website: string | null;
  logoUrl: string | null;
}

export interface JobDTO {
  id: string;
  title: string;
  company: CompanyDTO;
  location: string | null;
  workMode: WorkMode | null;
  employmentType: EmploymentType | null;
  qualification: string | null;
  experienceText: string | null;
  minExperience: number | null;
  maxExperience: number | null;
  isFresherFriendly: boolean;
  summary: string | null;
  description: string | null;
  responsibilities: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
  salaryType: SalaryType | null;
  applicationUrl: string | null;
  sourceUrl: string | null;
  sourceWebsite: string | null;
  deadline: string | null;
  walkInDate: string | null;
  postedDate: string | null;
  industry: string | null;
  openings: number | null;
  status: JobStatus;
  sourceType: SourceType;
  publishedAt: string | null;
  scheduledAt: string | null;
  expiresAt: string | null;
  expiredAt: string | null;
  expiryReason: string | null;
  generatedPost: string | null;
  skills: string[];
  preferredSkills: string[];
  tags: Pick<TagDTO, 'id' | 'name' | 'slug' | 'category'>[];
  fieldMeta: FieldMeta | null;
  lastVerifiedAt: string | null;
  lastVerifyStatus: string | null;
  createdAt: string;
  updatedAt: string;
  bookmarked?: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface DuplicateCandidateDTO {
  jobId: string;
  title: string;
  companyName: string;
  location: string | null;
  status: JobStatus;
  publishedAt: string | null;
  score: number;
  reasons: string[];
  isLikelyDuplicate: boolean;
}

export interface ExtractionFlag {
  level: 'info' | 'warning' | 'error';
  field?: string;
  message: string;
}

export interface ExtractionResultDTO {
  draft: JobInput;
  fieldMeta: FieldMeta;
  suggestedTags: TagAssignment[];
  flags: ExtractionFlag[];
  duplicates: DuplicateCandidateDTO[];
  postPreview: string;
  provider: string;
  model: string;
  promptVersion: string;
}

export interface ExtractionDTO {
  id: string;
  sourceUrl: string;
  status: ExtractionStatus;
  fetchMethod: string | null;
  httpStatus: number | null;
  pageTitle: string | null;
  error: string | null;
  attempts: number;
  jobId: string | null;
  result: ExtractionResultDTO | null;
  submittedBy: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface ExtractionLogDTO {
  id: string;
  extractionId: string | null;
  sourceUrl: string;
  stage: string;
  status: 'SUCCESS' | 'FAILURE';
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCost: number;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface AuditLogDTO {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  details: Record<string, unknown> | null;
  user: { id: string; name: string } | null;
  createdAt: string;
}

export interface DashboardDTO {
  jobs: Record<JobStatus, number> & { total: number };
  extractions: { total: number; ready: number; failed: number; published: number; inProgress: number };
  llmUsage30d: { requests: number; tokens: number; cost: number; failures: number };
  publishedPerDay: { date: string; count: number }[];
  recentExtractions: Pick<ExtractionDTO, 'id' | 'sourceUrl' | 'status' | 'pageTitle' | 'createdAt' | 'error'>[];
  pendingJobs: Pick<JobDTO, 'id' | 'title' | 'company' | 'createdAt' | 'status'>[];
  possibleDuplicates: { a: { id: string; title: string; company: string }; b: { id: string; title: string; company: string }; score: number }[];
  bookmarks: number;
  users: number;
}

export interface LlmProviderStatusDTO {
  name: LlmProviderName;
  label: string;
  configured: boolean;
  defaultModel: string;
  costPer1MInput: number;
  costPer1MOutput: number;
}

export interface JobPreviewDTO {
  post: string;
  suggestedTags: TagAssignment[];
  duplicates: DuplicateCandidateDTO[];
  warnings: ExtractionFlag[];
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
