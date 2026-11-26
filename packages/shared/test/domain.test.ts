import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAXONOMY,
  assignTags,
  buildHashtags,
  dedupeSkills,
  experienceBucketSlugs,
  formatExperience,
  formatJobPost,
  isPastDate,
  normalizeCompany,
  normalizeTitle,
  normalizeUrl,
  parseDateLoose,
  parseExperience,
  scoreDuplicate,
  slugify,
  toHashtag,
  urlFingerprint,
  DUPLICATE_THRESHOLD,
} from '../src';

const taxonomy = DEFAULT_TAXONOMY;
const slugs = (job: Parameters<typeof assignTags>[0]) =>
  assignTags(job, taxonomy).map((t) => `${t.category}:${t.slug}`);

describe('text normalisation', () => {
  it('slugifies tag names', () => {
    expect(slugify('B.E / B.Tech')).toBe('b-e-b-tech');
    expect(slugify('8+ Years')).toBe('8-plus-years');
    expect(slugify('Node.js')).toBe('node-js');
    expect(slugify('Testing / QA')).toBe('testing-qa');
  });

  it('normalises titles and companies for duplicate checks', () => {
    expect(normalizeTitle('URGENT Hiring: Investigation Specialist (Work From Home)')).toBe('investigation specialist');
    expect(normalizeCompany('Acme Technologies Pvt. Ltd.')).toBe('acme technologies');
  });

  it('strips tracking parameters and fragments from URLs', () => {
    expect(normalizeUrl('https://Example.com/jobs/123/?utm_source=x&b=2&a=1#apply')).toBe('https://example.com/jobs/123?a=1&b=2');
    expect(urlFingerprint('http://www.example.com/jobs/123/')).toBe(urlFingerprint('https://example.com/jobs/123?utm_medium=y'));
  });
});

describe('dates', () => {
  it.each([
    ['2025-03-15', '2025-03-15'],
    ['15/03/2025', '2025-03-15'],
    ['15-03-2025', '2025-03-15'],
    ['15th March, 2025', '2025-03-15'],
    ['March 15, 2025', '2025-03-15'],
    ['15 Mar 25', '2025-03-15'],
    ['2025-02-30', null],
    ['next friday', null],
    ['', null],
  ])('parses %s', (input, expected) => {
    expect(parseDateLoose(input)).toBe(expected);
  });

  it('detects past dates relative to now', () => {
    const now = new Date('2025-06-10T10:00:00Z');
    expect(isPastDate('2025-06-09', now)).toBe(true);
    expect(isPastDate('2025-06-10', now)).toBe(false);
    expect(isPastDate(null, now)).toBe(false);
  });
});

describe('experience classification', () => {
  it.each([
    ['0-2 years', { min: 0, max: 2, fresher: true }],
    ['2 to 5 yrs', { min: 2, max: 5, fresher: false }],
    ['3+ years', { min: 3, max: null, fresher: false }],
    ['Freshers / Experienced', { min: 0, max: null, fresher: true }],
    ['Minimum 4 years of experience', { min: 4, max: null, fresher: false }],
    ['Up to 1 year', { min: 0, max: 1, fresher: true }],
    ['Not mentioned', { min: null, max: null, fresher: false }],
  ])('parses %s', (text, expected) => {
    expect(parseExperience(text)).toEqual(expected);
  });

  it('maps ranges to overlapping buckets', () => {
    expect(experienceBucketSlugs(0, 1)).toEqual(['freshers', '0-1-years']);
    expect(experienceBucketSlugs(2, 4)).toEqual(['1-3-years', '3-5-years']);
    expect(experienceBucketSlugs(3, null)).toEqual(['3-5-years']);
    expect(experienceBucketSlugs(10, 12)).toEqual(['8-plus-years']);
    expect(experienceBucketSlugs(null, null, true)).toEqual(['freshers']);
    expect(experienceBucketSlugs(null, null)).toEqual([]);
  });

  it('formats experience text', () => {
    expect(formatExperience(0, 2)).toBe('Freshers / 0-2 Years');
    expect(formatExperience(3, null)).toBe('3+ Years');
    expect(formatExperience(null, null, true)).toBe('Freshers');
    expect(formatExperience(null, null, false, 'Freshers / Experienced')).toBe('Freshers / Experienced');
    expect(formatExperience(null, null)).toBeNull();
  });
});

describe('skills', () => {
  it('canonicalises and de-duplicates synonyms', () => {
    expect(dedupeSkills(['ReactJS', 'react.js', 'nodejs', 'Node.js', 'js', 'communication skills', 'Communication'])).toEqual([
      'React',
      'Node.js',
      'JavaScript',
      'Communication',
    ]);
  });
});

describe('tagging engine', () => {
  it('tags a QA automation job', () => {
    const result = slugs({
      title: 'Senior QA Automation Engineer',
      skills: ['Selenium WebDriver', 'Java', 'Rest Assured', 'SQL'],
      workMode: 'HYBRID',
      employmentType: 'FULL_TIME',
      minExperience: 3,
      maxExperience: 6,
      qualification: 'B.E/B.Tech in Computer Science',
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'EXPERIENCE:3-5-years',
        'EXPERIENCE:5-8-years',
        'WORK_MODE:hybrid',
        'EMPLOYMENT_TYPE:full-time',
        'SKILL:selenium',
        'SKILL:java',
        'SKILL:api-testing',
        'SKILL:sql',
        'QUALIFICATION:b-e-b-tech',
        'JOB_CATEGORY:testing-qa',
      ]),
    );
    expect(result).not.toContain('QUALIFICATION:any-graduation');
    expect(result).not.toContain('EXPERIENCE:freshers');
  });

  it('tags a non-IT fresher job and adds the Non-IT category', () => {
    const result = slugs({
      title: 'Investigation Specialist',
      skills: ['Investigation', 'Analytical Skills', 'Communication'],
      workMode: 'WFH',
      isFresherFriendly: true,
      qualification: 'Any Graduation',
    });
    expect(result).toEqual(
      expect.arrayContaining([
        'EXPERIENCE:freshers',
        'WORK_MODE:work-from-home',
        'QUALIFICATION:any-graduation',
        'JOB_CATEGORY:operations',
        'JOB_CATEGORY:non-it',
      ]),
    );
  });

  it('falls back to skill-derived categories and only accepts known LLM tags', () => {
    const result = slugs({
      title: 'Associate - Team Alpha',
      skills: ['Playwright', 'TypeScript'],
      suggestedTags: ['#Playwright', 'Quantum Basket Weaving'],
    });
    expect(result).toContain('JOB_CATEGORY:testing-qa');
    expect(result.some((s) => s.includes('quantum'))).toBe(false);
  });

  it('never matches ambiguous short terms inside titles', () => {
    const result = slugs({ title: 'Must be a team player', skills: [] });
    expect(result).not.toContain('QUALIFICATION:b-e-b-tech');
    expect(result).not.toContain('SKILL:typescript');
  });
});

describe('post formatter', () => {
  const job = {
    title: 'Investigation Specialist',
    companyName: 'Amazon',
    location: 'Bangalore',
    workMode: 'WFH' as const,
    qualification: 'Any Graduation',
    experienceText: 'Freshers / Experienced',
    isFresherFriendly: true,
    minExperience: 0,
    skills: ['Investigation', 'Analytical Skills', 'Communication'],
    applicationUrl: 'https://tinyurl.com/46npetab',
    sourceUrl: 'https://example.com/job-posting/investigation-specialist',
    tags: [
      { name: 'Freshers', category: 'EXPERIENCE' },
      { name: 'Work From Home', category: 'WORK_MODE' },
    ],
  };

  it('renders the standard template and keeps the application URL verbatim', () => {
    const post = formatJobPost(job);
    expect(post.split('\n')[0]).toBe('Amazon Recruitment | Investigation Specialist (Work From Home) @ Bangalore');
    expect(post).toContain('Qualification: Any Graduation');
    expect(post).toContain('Experience: Freshers / Experienced');
    expect(post).toContain('Apply Link: https://tinyurl.com/46npetab');
    expect(post).toContain('Walk-in Date: Not specified');
    expect(post).toContain('Application Deadline: Not specified');
    expect(post).toContain('#Freshers #WorkFromHome');
    expect(post).toContain('#AmazonJobs');
    expect(post).toContain('Source: example.com');
  });

  it('omits unavailable fields when configured', () => {
    const post = formatJobPost(job, { showUnavailable: false, notSpecifiedText: 'N/A', includeHashtags: false, includeSource: false });
    expect(post).not.toContain('Walk-in Date');
    expect(post).not.toContain('Tags:');
    expect(post).not.toContain('Source:');
  });

  it('builds hashtags', () => {
    expect(toHashtag('0-1 Years')).toBe('#0to1Years');
    expect(toHashtag('8+ Years')).toBe('#8PlusYears');
    expect(buildHashtags(job)).toContain('#Investigation');
  });
});

describe('duplicate scoring', () => {
  const base = {
    title: 'Investigation Specialist',
    companyName: 'Amazon',
    location: 'Bangalore',
    sourceUrl: 'https://example.com/jobs/1',
  };

  it('treats identical source URLs as duplicates', () => {
    expect(scoreDuplicate(base, { ...base, title: 'Other', sourceUrl: 'https://www.example.com/jobs/1?utm_source=x' }).score).toBe(1);
  });

  it('scores same company + similar title + location above threshold', () => {
    const s = scoreDuplicate(base, {
      title: 'Investigation Specialist (WFH)',
      companyName: 'Amazon Pvt Ltd',
      location: 'Bengaluru',
      sourceUrl: 'https://other.com/x',
    });
    expect(s.score).toBeGreaterThanOrEqual(DUPLICATE_THRESHOLD);
  });

  it('scores different roles low', () => {
    const s = scoreDuplicate(base, { title: 'Senior Java Developer', companyName: 'Amazon', location: 'Hyderabad' });
    expect(s.score).toBeLessThan(0.65);
  });
});
