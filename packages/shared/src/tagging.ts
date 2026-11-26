import type { EmploymentType, TagCategory, WorkMode } from './enums';
import { experienceBucketSlugs } from './experience';
import {
  EMPLOYMENT_TYPE_TAG_SLUG,
  NON_IT_CATEGORY_SLUGS,
  NON_IT_SLUG,
  WORK_MODE_TAG_SLUG,
} from './taxonomy';
import { containsPhrase, normalizeKey } from './text';

export interface TagRef {
  id?: string;
  name: string;
  slug: string;
  category: TagCategory;
  synonyms: string[];
}

export interface TagAssignment {
  id?: string;
  name: string;
  slug: string;
  category: TagCategory;
  reason: string;
}

export interface TaggableJob {
  title: string;
  skills?: string[];
  preferredSkills?: string[];
  qualification?: string | null;
  workMode?: WorkMode | null;
  employmentType?: EmploymentType | null;
  minExperience?: number | null;
  maxExperience?: number | null;
  isFresherFriendly?: boolean | null;
  /** Free-text category suggested by the LLM, mapped onto the taxonomy if possible. */
  category?: string | null;
  /** Free-text tags suggested by the LLM; only ones matching the taxonomy are kept. */
  suggestedTags?: string[];
}

/** Very short tokens that are too ambiguous for phrase scanning inside titles. */
const AMBIGUOUS_TERMS = new Set(['ts', 'be', 'ma', 'pg', 'js', 'co']);

/** Skill tag → job category fallback when the title gives no category signal. */
const SKILL_CATEGORY_FALLBACK: Record<string, string> = {
  selenium: 'testing-qa',
  playwright: 'testing-qa',
  'api-testing': 'testing-qa',
  'manual-testing': 'testing-qa',
  java: 'software-development',
  python: 'software-development',
  javascript: 'software-development',
  typescript: 'software-development',
  react: 'software-development',
  'node-js': 'software-development',
  devops: 'devops',
  'ai-ml': 'ai-ml',
  'data-engineering': 'data-science',
  'cloud-computing': 'devops',
};

const termsOf = (tag: TagRef) => [tag.name, ...tag.synonyms];

function matchesTerm(value: string, term: string, allowAmbiguous: boolean): boolean {
  if (!term) return false;
  if (normalizeKey(value) === normalizeKey(term)) return true;
  if (!allowAmbiguous && AMBIGUOUS_TERMS.has(term.toLowerCase())) return false;
  return containsPhrase(value, term);
}

/** Finds the tag in `tags` whose name or synonyms match `value` exactly (by normalised key). */
export function findTagByKey(tags: TagRef[], value: string): TagRef | undefined {
  const key = normalizeKey(value);
  if (!key) return undefined;
  return tags.find(
    (t) => normalizeKey(t.name) === key || t.slug === value.toLowerCase() || t.synonyms.some((s) => normalizeKey(s) === key),
  );
}

/**
 * Deterministic tagging engine. Given extracted job data and the active taxonomy,
 * returns tag assignments with a human-readable reason for each. It never invents
 * tags: everything returned exists in `taxonomy`.
 */
export function assignTags(job: TaggableJob, taxonomy: TagRef[]): TagAssignment[] {
  const out = new Map<string, TagAssignment>();
  const byCategory = (c: TagCategory) => taxonomy.filter((t) => t.category === c);
  const add = (tag: TagRef | undefined, reason: string) => {
    if (!tag) return;
    const key = `${tag.category}:${tag.slug}`;
    if (!out.has(key)) out.set(key, { id: tag.id, name: tag.name, slug: tag.slug, category: tag.category, reason });
  };
  const bySlug = (c: TagCategory, slug: string) => taxonomy.find((t) => t.category === c && t.slug === slug);

  // Experience
  for (const slug of experienceBucketSlugs(job.minExperience, job.maxExperience, !!job.isFresherFriendly)) {
    add(bySlug('EXPERIENCE', slug), 'Derived from experience range');
  }

  // Work mode & employment type
  if (job.workMode) add(bySlug('WORK_MODE', WORK_MODE_TAG_SLUG[job.workMode]), 'Work mode');
  if (job.employmentType) add(bySlug('EMPLOYMENT_TYPE', EMPLOYMENT_TYPE_TAG_SLUG[job.employmentType]), 'Employment type');

  // Skills: match each extracted skill, then scan the title.
  const skillTags = byCategory('SKILL');
  const skills = [...(job.skills ?? []), ...(job.preferredSkills ?? [])];
  for (const skill of skills) {
    for (const tag of skillTags) {
      if (termsOf(tag).some((term) => matchesTerm(skill, term, true))) add(tag, `Skill "${skill}"`);
    }
  }
  for (const tag of skillTags) {
    if (termsOf(tag).some((term) => matchesTerm(job.title, term, false) && normalizeKey(term).length >= 2)) {
      add(tag, 'Mentioned in job title');
    }
  }

  // Qualification
  const qualificationText = job.qualification ?? '';
  if (qualificationText) {
    const matched = byCategory('QUALIFICATION').filter((tag) =>
      termsOf(tag).some((term) => matchesTerm(qualificationText, term, true)),
    );
    const specific = matched.filter((m) => m.slug !== 'any-graduation');
    const keepGeneric = specific.length === 0 || containsPhrase(qualificationText, 'any');
    for (const tag of matched) {
      if (tag.slug === 'any-graduation' && !keepGeneric) continue;
      add(tag, 'Qualification requirement');
    }
  }

  // Job category: title keywords → LLM category → skill fallback.
  const categoryTags = byCategory('JOB_CATEGORY');
  for (const tag of categoryTags) {
    if (tag.slug === NON_IT_SLUG) continue;
    if (termsOf(tag).some((term) => matchesTerm(job.title, term, false))) add(tag, 'Job title keywords');
  }
  if (job.category) {
    const tag = findTagByKey(categoryTags, job.category) ??
      categoryTags.find((t) => termsOf(t).some((term) => matchesTerm(job.category!, term, false)));
    add(tag, 'Suggested category');
  }
  const hasCategory = [...out.values()].some((a) => a.category === 'JOB_CATEGORY');
  if (!hasCategory) {
    for (const a of [...out.values()].filter((v) => v.category === 'SKILL')) {
      const slug = SKILL_CATEGORY_FALLBACK[a.slug];
      if (slug) add(bySlug('JOB_CATEGORY', slug), `Inferred from skill ${a.name}`);
    }
  }
  if ([...out.values()].some((a) => a.category === 'JOB_CATEGORY' && NON_IT_CATEGORY_SLUGS.includes(a.slug))) {
    add(bySlug('JOB_CATEGORY', NON_IT_SLUG), 'Non-IT job category');
  }

  // LLM-suggested tags — only accepted if they map onto existing taxonomy entries.
  const suggestable = taxonomy.filter((t) => ['SKILL', 'JOB_CATEGORY', 'QUALIFICATION', 'OTHER'].includes(t.category));
  for (const s of job.suggestedTags ?? []) {
    add(findTagByKey(suggestable, s.replace(/^#/, '')), 'Suggested by AI and matched to taxonomy');
  }

  return [...out.values()];
}

/** Converts a tag/skill/company name into a hashtag: "Work From Home" → "#WorkFromHome". */
export function toHashtag(name: string): string | null {
  const cleaned = name
    .replace(/(\d)\s*-\s*(\d)/g, '$1to$2')
    .replace(/\+/g, ' plus ')
    .replace(/#/g, ' sharp ')
    .replace(/&/g, ' and ');
  const words = cleaned.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (words.length === 0) return null;
  const body = words.map((w) => (w === w.toUpperCase() ? w : w[0].toUpperCase() + w.slice(1))).join('');
  return `#${body}`;
}
