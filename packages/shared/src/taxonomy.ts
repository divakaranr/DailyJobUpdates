import type { EmploymentType, TagCategory, WorkMode } from './enums';
import { EXPERIENCE_BUCKETS, FRESHERS_SLUG } from './experience';
import { slugify } from './text';

export interface TaxonomyTag {
  name: string;
  slug: string;
  category: TagCategory;
  /** Alternative spellings / keywords that map onto this tag. */
  synonyms: string[];
}

const t = (category: TagCategory, name: string, synonyms: string[] = [], slug?: string): TaxonomyTag => ({
  category,
  name,
  slug: slug ?? slugify(name),
  synonyms,
});

export const WORK_MODE_TAG_SLUG: Record<WorkMode, string> = {
  REMOTE: 'remote',
  WFH: 'work-from-home',
  HYBRID: 'hybrid',
  ONSITE: 'onsite',
};

export const EMPLOYMENT_TYPE_TAG_SLUG: Record<EmploymentType, string> = {
  FULL_TIME: 'full-time',
  PART_TIME: 'part-time',
  CONTRACT: 'contract',
  INTERNSHIP: 'internship',
};

/**
 * The default, controlled tag taxonomy. Seeded into the database; administrators
 * can extend it (and edit synonyms/keywords) from the Tag Management screen.
 * For JOB_CATEGORY tags the synonyms double as title keywords for classification.
 */
export const DEFAULT_TAXONOMY: TaxonomyTag[] = [
  t('EXPERIENCE', 'Freshers', ['fresher', 'freshers', 'entry level', 'graduate trainee'], FRESHERS_SLUG),
  ...EXPERIENCE_BUCKETS.map((b) => t('EXPERIENCE', b.name, [], b.slug)),

  t('WORK_MODE', 'Work From Home', ['wfh', 'work from home'], WORK_MODE_TAG_SLUG.WFH),
  t('WORK_MODE', 'Remote', ['remote', 'fully remote', 'remote first'], WORK_MODE_TAG_SLUG.REMOTE),
  t('WORK_MODE', 'Hybrid', ['hybrid'], WORK_MODE_TAG_SLUG.HYBRID),
  t('WORK_MODE', 'Onsite', ['on site', 'onsite', 'work from office', 'wfo', 'in office'], WORK_MODE_TAG_SLUG.ONSITE),

  t('EMPLOYMENT_TYPE', 'Full-time', ['full time', 'permanent'], EMPLOYMENT_TYPE_TAG_SLUG.FULL_TIME),
  t('EMPLOYMENT_TYPE', 'Part-time', ['part time'], EMPLOYMENT_TYPE_TAG_SLUG.PART_TIME),
  t('EMPLOYMENT_TYPE', 'Contract', ['contractual', 'contract to hire', 'c2h', 'freelance'], EMPLOYMENT_TYPE_TAG_SLUG.CONTRACT),
  t('EMPLOYMENT_TYPE', 'Internship', ['intern', 'internship', 'trainee intern'], EMPLOYMENT_TYPE_TAG_SLUG.INTERNSHIP),

  t('SKILL', 'Java', ['java', 'core java', 'j2ee', 'spring', 'spring boot', 'hibernate']),
  t('SKILL', 'Python', ['python', 'python3', 'django', 'flask', 'fastapi', 'pandas']),
  t('SKILL', 'JavaScript', ['javascript', 'js', 'es6', 'ecmascript']),
  t('SKILL', 'TypeScript', ['typescript', 'ts']),
  t('SKILL', 'Selenium', ['selenium', 'selenium webdriver', 'webdriver']),
  t('SKILL', 'Playwright', ['playwright']),
  t('SKILL', 'API Testing', ['api testing', 'rest assured', 'restassured', 'postman', 'api automation', 'soapui']),
  t('SKILL', 'Manual Testing', ['manual testing', 'functional testing', 'regression testing', 'test case design']),
  t('SKILL', 'React', ['react', 'reactjs', 'react.js', 'react js', 'next.js', 'nextjs']),
  t('SKILL', 'Node.js', ['node', 'nodejs', 'node.js', 'node js', 'express', 'expressjs', 'nestjs']),
  t('SKILL', 'SQL', ['sql', 'mysql', 'postgresql', 'postgres', 'pl/sql', 'plsql', 'sql server', 'mssql', 't-sql', 'oracle sql']),
  t('SKILL', 'DevOps', ['devops', 'ci/cd', 'cicd', 'jenkins', 'docker', 'kubernetes', 'k8s', 'terraform', 'ansible']),
  t('SKILL', 'AI/ML', ['ai', 'ml', 'ai/ml', 'machine learning', 'artificial intelligence', 'deep learning', 'nlp', 'llm', 'genai', 'generative ai', 'tensorflow', 'pytorch', 'computer vision']),
  t('SKILL', 'Data Engineering', ['data engineering', 'etl', 'spark', 'pyspark', 'hadoop', 'airflow', 'kafka', 'databricks', 'snowflake', 'data pipelines']),
  t('SKILL', 'Cloud Computing', ['cloud', 'cloud computing', 'aws', 'azure', 'gcp', 'google cloud']),

  t('QUALIFICATION', 'Any Graduation', ['any graduate', 'any graduation', 'any degree', 'any stream', 'graduate', 'graduation', 'bachelor', 'bachelors', 'degree']),
  t('QUALIFICATION', 'B.E / B.Tech', ['b.e', 'b e', 'b.tech', 'btech', 'bachelor of engineering', 'bachelor of technology', 'engineering graduate']),
  t('QUALIFICATION', 'B.Sc', ['b.sc', 'bsc', 'bachelor of science']),
  t('QUALIFICATION', 'BCA', ['bca', 'bachelor of computer applications']),
  t('QUALIFICATION', 'MCA', ['mca', 'master of computer applications']),
  t('QUALIFICATION', 'MBA', ['mba', 'pgdm', 'master of business administration']),
  t('QUALIFICATION', 'Diploma', ['diploma', 'polytechnic']),
  t('QUALIFICATION', 'Postgraduate', ['postgraduate', 'post graduate', 'post graduation', 'masters', "master's degree", 'master degree', 'm.tech', 'mtech', 'm.e', 'm.sc', 'msc', 'm.com']),

  t('JOB_CATEGORY', 'Software Development', ['developer', 'software engineer', 'software development', 'sde', 'programmer', 'full stack', 'fullstack', 'frontend', 'front end', 'backend', 'back end', 'web developer', 'mobile developer', 'android developer', 'ios developer', 'application developer']),
  t('JOB_CATEGORY', 'Testing / QA', ['qa', 'quality assurance', 'test engineer', 'tester', 'testing', 'sdet', 'automation engineer', 'test analyst', 'software testing']),
  t('JOB_CATEGORY', 'DevOps', ['devops', 'sre', 'site reliability', 'platform engineer', 'cloud engineer', 'release engineer', 'build engineer']),
  t('JOB_CATEGORY', 'Data Science', ['data scientist', 'data science', 'data analyst', 'data analytics', 'business intelligence', 'bi developer', 'data engineer']),
  t('JOB_CATEGORY', 'AI / ML', ['machine learning', 'ml engineer', 'ai engineer', 'artificial intelligence', 'deep learning', 'nlp', 'computer vision', 'genai', 'llm', 'ai/ml']),
  t('JOB_CATEGORY', 'Business Analyst', ['business analyst', 'product analyst', 'functional consultant', 'business analysis']),
  t('JOB_CATEGORY', 'Customer Support', ['customer support', 'customer service', 'customer care', 'call center', 'call centre', 'bpo', 'voice process', 'non voice', 'chat process', 'technical support', 'helpdesk', 'help desk', 'customer success']),
  t('JOB_CATEGORY', 'Operations', ['operations', 'back office', 'process associate', 'data entry', 'logistics', 'supply chain', 'investigation', 'content moderator', 'trust and safety', 'transaction risk']),
  t('JOB_CATEGORY', 'Finance', ['finance', 'accountant', 'accounts', 'accounting', 'chartered accountant', 'financial analyst', 'audit', 'taxation', 'payroll', 'accounts payable', 'accounts receivable']),
  t('JOB_CATEGORY', 'HR', ['hr', 'human resources', 'recruiter', 'talent acquisition', 'recruitment', 'people operations']),
  t('JOB_CATEGORY', 'Sales', ['sales', 'business development', 'bde', 'inside sales', 'account executive', 'telesales', 'field sales', 'marketing executive']),
  t('JOB_CATEGORY', 'Banking', ['bank', 'banking', 'relationship manager', 'loan officer', 'credit officer', 'teller', 'branch banking']),
  t('JOB_CATEGORY', 'Non-IT', ['non it', 'non-it']),
];

/** Job categories that imply the additional "Non-IT" tag. */
export const NON_IT_CATEGORY_SLUGS = ['customer-support', 'operations', 'finance', 'hr', 'sales', 'banking'];
export const NON_IT_SLUG = 'non-it';
