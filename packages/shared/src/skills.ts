import { normalizeKey } from './text';

/**
 * Canonical spellings for common skill variants. Keys are `normalizeKey` outputs.
 * Skills not listed are kept as written (trimmed, title-cased when all-lowercase).
 */
export const SKILL_CANONICAL: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  es6: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  node: 'Node.js',
  nodejs: 'Node.js',
  react: 'React',
  reactjs: 'React',
  nextjs: 'Next.js',
  vue: 'Vue.js',
  vuejs: 'Vue.js',
  angularjs: 'Angular',
  angular: 'Angular',
  py: 'Python',
  python: 'Python',
  python3: 'Python',
  java: 'Java',
  corejava: 'Core Java',
  springboot: 'Spring Boot',
  sql: 'SQL',
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  aws: 'AWS',
  amazonwebservices: 'AWS',
  gcp: 'GCP',
  googlecloud: 'GCP',
  azure: 'Azure',
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  docker: 'Docker',
  cicd: 'CI/CD',
  ml: 'Machine Learning',
  machinelearning: 'Machine Learning',
  ai: 'Artificial Intelligence',
  artificialintelligence: 'Artificial Intelligence',
  aiml: 'AI/ML',
  genai: 'Generative AI',
  generativeai: 'Generative AI',
  nlp: 'NLP',
  restassured: 'Rest Assured',
  restapi: 'REST APIs',
  restapis: 'REST APIs',
  selenium: 'Selenium',
  seleniumwebdriver: 'Selenium WebDriver',
  playwright: 'Playwright',
  postman: 'Postman',
  manualtesting: 'Manual Testing',
  apitesting: 'API Testing',
  html: 'HTML',
  html5: 'HTML',
  css: 'CSS',
  css3: 'CSS',
  msexcel: 'MS Excel',
  excel: 'MS Excel',
  advancedexcel: 'Advanced Excel',
  communication: 'Communication',
  communicationskills: 'Communication',
  csharp: 'C#',
  cplusplus: 'C++',
  dotnet: '.NET',
  golang: 'Go',
};

export function canonicalizeSkill(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim().replace(/[.;,]+$/, '');
  const key = normalizeKey(trimmed);
  if (SKILL_CANONICAL[key]) return SKILL_CANONICAL[key];
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.replace(/\b[a-z]/g, (c) => c.toUpperCase());
  }
  return trimmed;
}

/** Canonicalises and de-duplicates skills, preserving first-seen order. */
export function dedupeSkills(skills: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of skills) {
    if (!raw || !raw.trim()) continue;
    const skill = canonicalizeSkill(raw);
    const key = normalizeKey(skill);
    if (!key || seen.has(key) || skill.length > 60) continue;
    seen.add(key);
    result.push(skill);
  }
  return result;
}
