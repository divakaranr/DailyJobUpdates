import type { EmploymentType, ExtractionFlag, FieldMeta, JobAction, JobDTO, JobInput, SalaryType, WorkMode } from '@jobs/shared';

/** Form state keeps numbers as strings so inputs can be empty. */
export interface JobFormState {
  title: string;
  companyName: string;
  companyWebsite: string;
  companyLogoUrl: string;
  location: string;
  workMode: WorkMode | '';
  employmentType: EmploymentType | '';
  qualification: string;
  experienceText: string;
  minExperience: string;
  maxExperience: string;
  isFresherFriendly: boolean;
  skills: string[];
  preferredSkills: string[];
  summary: string;
  description: string;
  responsibilities: string;
  salaryMin: string;
  salaryMax: string;
  currency: string;
  salaryType: SalaryType | '';
  applicationUrl: string;
  sourceUrl: string;
  deadline: string;
  walkInDate: string;
  postedDate: string;
  industry: string;
  openings: string;
  tagIds: string[];
  scheduledAt: string;
}

export const emptyForm: JobFormState = {
  title: '',
  companyName: '',
  companyWebsite: '',
  companyLogoUrl: '',
  location: '',
  workMode: '',
  employmentType: '',
  qualification: '',
  experienceText: '',
  minExperience: '',
  maxExperience: '',
  isFresherFriendly: false,
  skills: [],
  preferredSkills: [],
  summary: '',
  description: '',
  responsibilities: '',
  salaryMin: '',
  salaryMax: '',
  currency: 'INR',
  salaryType: '',
  applicationUrl: '',
  sourceUrl: '',
  deadline: '',
  walkInDate: '',
  postedDate: '',
  industry: '',
  openings: '',
  tagIds: [],
  scheduledAt: '',
};

const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function formFromDraft(d: Partial<JobInput>): JobFormState {
  return {
    ...emptyForm,
    title: s(d.title),
    companyName: s(d.companyName),
    companyWebsite: s(d.companyWebsite),
    companyLogoUrl: s(d.companyLogoUrl),
    location: s(d.location),
    workMode: (d.workMode ?? '') as WorkMode | '',
    employmentType: (d.employmentType ?? '') as EmploymentType | '',
    qualification: s(d.qualification),
    experienceText: s(d.experienceText),
    minExperience: s(d.minExperience),
    maxExperience: s(d.maxExperience),
    isFresherFriendly: !!d.isFresherFriendly,
    skills: d.skills ?? [],
    preferredSkills: d.preferredSkills ?? [],
    summary: s(d.summary),
    description: s(d.description),
    responsibilities: (d.responsibilities ?? []).join('\n'),
    salaryMin: s(d.salaryMin),
    salaryMax: s(d.salaryMax),
    currency: s(d.currency) || 'INR',
    salaryType: (d.salaryType ?? '') as SalaryType | '',
    applicationUrl: s(d.applicationUrl),
    sourceUrl: s(d.sourceUrl),
    deadline: s(d.deadline),
    walkInDate: s(d.walkInDate),
    postedDate: s(d.postedDate),
    industry: s(d.industry),
    openings: s(d.openings),
    tagIds: d.tagIds ?? [],
  };
}

export function formFromJob(j: JobDTO): JobFormState {
  return {
    ...formFromDraft({
      ...j,
      companyName: j.company.name,
      companyWebsite: j.company.website,
      companyLogoUrl: j.company.logoUrl,
      tagIds: j.tags.map((t) => t.id),
    } as unknown as Partial<JobInput>),
    scheduledAt: j.scheduledAt ? toLocalInput(j.scheduledAt) : '',
  };
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

const num = (v: string) => (v.trim() === '' ? null : Number(v.replace(/,/g, '')));
const str = (v: string) => (v.trim() === '' ? null : v.trim());

export function formToPayload(f: JobFormState, action: JobAction, extra: { fieldMeta?: FieldMeta | null; confirmDuplicate?: boolean } = {}) {
  const hasSalary = f.salaryMin.trim() !== '' || f.salaryMax.trim() !== '';
  return {
    title: f.title.trim(),
    companyName: f.companyName.trim(),
    companyWebsite: str(f.companyWebsite),
    companyLogoUrl: str(f.companyLogoUrl),
    location: str(f.location),
    workMode: f.workMode || null,
    employmentType: f.employmentType || null,
    qualification: str(f.qualification),
    experienceText: str(f.experienceText),
    minExperience: num(f.minExperience),
    maxExperience: num(f.maxExperience),
    isFresherFriendly: f.isFresherFriendly,
    skills: f.skills,
    preferredSkills: f.preferredSkills,
    summary: str(f.summary),
    description: str(f.description),
    responsibilities: f.responsibilities.split('\n').map((r) => r.replace(/^[•\-*]\s*/, '').trim()).filter(Boolean),
    salaryMin: num(f.salaryMin),
    salaryMax: num(f.salaryMax),
    currency: hasSalary ? str(f.currency) : null,
    salaryType: hasSalary ? f.salaryType || null : null,
    applicationUrl: str(f.applicationUrl),
    sourceUrl: str(f.sourceUrl),
    deadline: str(f.deadline),
    walkInDate: str(f.walkInDate),
    postedDate: str(f.postedDate),
    industry: str(f.industry),
    openings: num(f.openings),
    tagIds: f.tagIds,
    autoTag: false,
    action,
    scheduledAt: action === 'schedule' && f.scheduledAt ? new Date(f.scheduledAt).toISOString() : null,
    ...(extra.fieldMeta ? { fieldMeta: extra.fieldMeta } : {}),
    confirmDuplicate: !!extra.confirmDuplicate,
  };
}

/** Maps API/zod field paths onto form keys so errors and flags appear next to the right input. */
export function fieldKey(path: string | undefined): keyof JobFormState | 'salary' | 'experience' | null {
  if (!path) return null;
  const root = path.split('.')[0];
  if (root === 'salary' || root === 'experience') return root;
  return root in emptyForm ? (root as keyof JobFormState) : null;
}

export function flagsByField(flags: ExtractionFlag[]) {
  const map = new Map<string, ExtractionFlag[]>();
  for (const f of flags) {
    const k = fieldKey(f.field) ?? '_general';
    const key = k === 'salary' ? 'salaryMin' : k === 'experience' ? 'minExperience' : k;
    map.set(key, [...(map.get(key) ?? []), f]);
  }
  return map;
}
