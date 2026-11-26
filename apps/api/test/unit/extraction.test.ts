import { describe, expect, it } from 'vitest';
import { parseHtml } from '../../src/modules/extraction/html';
import { buildDraft, numbersInText } from '../../src/modules/extraction/normalize';
import { assertSafeUrl, isBlockedHostname, isPublicIp, SsrfError } from '../../src/modules/extraction/ssrf';
import { heuristicExtract } from '../../src/modules/llm/heuristic';
import type { ExtractionContext } from '../../src/modules/llm/types';
import { llmExtractionSchema } from '@jobs/shared';
import { fixture } from '../helpers';

const ctxFrom = (html: string, url: string): ExtractionContext => {
  const page = parseHtml(html, url);
  return {
    sourceUrl: url,
    pageTitle: page.title,
    text: page.text,
    jsonLd: page.jsonLd,
    meta: { siteName: page.meta.siteName, ogTitle: page.meta.ogTitle, description: page.meta.description },
    applyLinks: page.applyLinks,
    links: page.links,
    logoUrl: page.logoUrl,
  };
};

describe('SSRF protection', () => {
  it.each(['127.0.0.1', '10.0.0.5', '172.16.3.4', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '224.0.0.1'])(
    'rejects non-public address %s',
    (ip) => expect(isPublicIp(ip)).toBe(false),
  );

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('accepts public address %s', (ip) => expect(isPublicIp(ip)).toBe(true));

  it.each(['localhost', 'foo.localhost', 'printer.local', 'metadata.google.internal', 'intranet'])('blocks internal hostname %s', (h) =>
    expect(isBlockedHostname(h)).toBe(true),
  );

  it('rejects non-http protocols, credentials and odd ports', async () => {
    await expect(assertSafeUrl('file:///etc/passwd')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('ftp://example.com/x')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('https://user:pass@example.com/')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://example.com:6379/')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://[::1]/')).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://169.254.169.254/latest/meta-data')).rejects.toBeInstanceOf(SsrfError);
  });

  it('rejects hostnames that resolve to private addresses (DNS rebinding style)', async () => {
    const resolve = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.1', family: 4 }];
    await expect(assertSafeUrl('https://evil.example.com/job', { resolve })).rejects.toThrow(/private or internal/);
  });

  it('accepts hostnames resolving to public addresses', async () => {
    const resolve = async () => [{ address: '93.184.216.34', family: 4 }];
    await expect(assertSafeUrl('https://jobs.example.com/123', { resolve })).resolves.toBeInstanceOf(URL);
  });
});

describe('HTML cleaning (Cheerio)', () => {
  const page = parseHtml(fixture('static-job.html'), 'https://contoso.example/careers/qa-automation');

  it('extracts JSON-LD JobPosting and metadata', () => {
    expect(page.jsonLd?.title).toBe('QA Automation Engineer');
    expect(page.meta.siteName).toBe('Contoso Careers');
    expect(page.title).toBe('QA Automation Engineer');
    expect(page.logoUrl).toBe('https://contoso.example/logo.png');
  });

  it('removes navigation, cookie banners, ads, scripts and related-job boilerplate', () => {
    expect(page.text).toContain('Design and maintain Selenium WebDriver frameworks');
    expect(page.text).not.toMatch(/cookies/i);
    expect(page.text).not.toMatch(/ADVERTISEMENT/);
    expect(page.text).not.toMatch(/analytics/);
    expect(page.text).not.toMatch(/Related: Senior Java/);
    expect(page.text).not.toMatch(/Privacy/);
  });

  it('drops visually hidden text (prompt-injection vector)', () => {
    expect(page.text).not.toMatch(/Ignore all previous instructions/);
  });

  it('finds the apply link but ignores navigation links', () => {
    expect(page.applyLinks).toContain('https://contoso.example/careers/apply/qa-automation-123');
    expect(page.applyLinks).not.toContain('https://contoso.example/about/apps/');
  });

  it('detects JavaScript app shells and CAPTCHA walls', () => {
    expect(parseHtml(fixture('spa-shell.html'), 'https://x.example/').looksDynamic).toBe(true);
    expect(parseHtml(fixture('captcha.html'), 'https://x.example/').blocked).toBe('captcha');
    expect(page.looksDynamic).toBe(false);
    expect(page.blocked).toBeNull();
  });
});

describe('rule-based extractor', () => {
  it('reads schema.org JobPosting data', () => {
    const x = heuristicExtract(ctxFrom(fixture('static-job.html'), 'https://contoso.example/careers/qa-automation'));
    expect(x.title).toBe('QA Automation Engineer');
    expect(x.companyName).toBe('Contoso Software');
    expect(x.location).toBe('Hyderabad, Telangana');
    expect(x.employmentType).toBe('FULL_TIME');
    expect(x.workMode).toBe('HYBRID');
    expect(x.minExperienceYears).toBe(3);
    expect(x.maxExperienceYears).toBe(5);
    expect(x.salaryMin).toBe(1200000);
    expect(x.salaryCurrency).toBe('INR');
    expect(x.deadline).toBe('2030-02-28');
    expect(x.skills).toEqual(expect.arrayContaining(['Selenium', 'Java', 'Rest Assured', 'SQL']));
  });

  it('reads labelled lines from pages without structured data', () => {
    const x = heuristicExtract(ctxFrom(fixture('plain-job.html'), 'https://tailspin.example/jobs/csa'));
    expect(x.title).toBe('Customer Support Associate - Voice Process');
    expect(x.location).toBe('Chennai');
    expect(x.qualification).toBe('Any Graduate');
    expect(x.isFresherFriendly).toBe(true);
    expect(x.minExperienceYears).toBe(0);
    expect(x.maxExperienceYears).toBe(2);
    expect(x.walkInDate).toBe('2030-03-15');
    expect(x.openings).toBe(50);
    expect(x.salaryMin).toBe(18000);
    expect(x.salaryMax).toBe(25000);
    expect(x.salaryType).toBe('MONTHLY');
    expect(x.skills).toEqual(['Communication', 'English', 'Customer Service']);
    expect(x.applicationUrl).toBe('https://tailspin.example/walkin/register');
  });
});

describe('draft normalisation and grounding', () => {
  const url = 'https://contoso.example/careers/qa-automation';
  const ctx = ctxFrom(fixture('static-job.html'), url);
  const base = llmExtractionSchema.parse({
    title: 'QA Automation Engineer',
    companyName: 'Contoso Software',
    location: 'Hyderabad',
    workMode: 'HYBRID',
    skills: ['selenium webdriver', 'java', 'Java'],
    salaryMin: 1200000,
    salaryMax: 1800000,
    salaryCurrency: 'INR',
    salaryType: 'ANNUAL',
    applicationUrl: 'https://contoso.example/careers/apply/qa-automation-123',
    deadline: '2030-02-28',
  });

  it('keeps grounded values and preserves the application URL verbatim', () => {
    const { draft, flags } = buildDraft(base, ctx, url, new Date('2030-01-10'));
    expect(draft.applicationUrl).toBe('https://contoso.example/careers/apply/qa-automation-123');
    expect(draft.salaryMin).toBe(1200000);
    expect(draft.skills).toEqual(['Selenium WebDriver', 'Java']);
    expect(flags.filter((f) => f.level === 'error')).toEqual([]);
  });

  it('removes salary figures that do not appear on the page (hallucination guard)', () => {
    const { draft, flags } = buildDraft({ ...base, salaryMin: 990000000, salaryMax: null }, ctx, url, new Date('2030-01-10'));
    expect(draft.salaryMin).toBeNull();
    expect(flags.some((f) => f.field === 'salary')).toBe(true);
  });

  it('discards application URLs that are not on the page', () => {
    const { draft, flags } = buildDraft({ ...base, applicationUrl: 'https://phishing.example/apply' }, ctx, url, new Date('2030-01-10'));
    expect(draft.applicationUrl).toBe('https://contoso.example/careers/apply/qa-automation-123');
    expect(flags.some((f) => f.field === 'applicationUrl' && f.level === 'warning')).toBe(true);
  });

  it('flags expired postings and unparseable dates', () => {
    const { flags } = buildDraft({ ...base, deadline: '2030-02-28', walkInDate: 'sometime next week' }, ctx, url, new Date('2030-06-01'));
    expect(flags.some((f) => f.field === 'deadline' && /passed/.test(f.message))).toBe(true);
    expect(flags.some((f) => f.field === 'walkInDate' && /interpret/.test(f.message))).toBe(true);
  });

  it('uses null for missing fields rather than inventing them', () => {
    const { draft } = buildDraft(llmExtractionSchema.parse({ title: 'QA Automation Engineer', companyName: 'Contoso Software' }), ctx, url);
    expect(draft.salaryMin ?? null).toBeNull();
    expect(draft.qualification ?? null).toBeNull();
    expect(draft.deadline ?? null).toBeNull();
    expect(draft.minExperience ?? null).toBeNull();
  });

  it('expands lakh / k notations when grounding numbers', () => {
    const nums = numbersInText('CTC 4.5 LPA, stipend 15k, budget ₹12,00,000');
    expect(nums.has(450000)).toBe(true);
    expect(nums.has(15000)).toBe(true);
    expect(nums.has(1200000)).toBe(true);
  });
});

describe('loopback test mode', () => {
  it('permits loopback on any port but still blocks private ranges and metadata', async () => {
    await expect(assertSafeUrl('http://localhost:4100/jobs/1', { allowLoopback: true, resolve: async () => [{ address: '127.0.0.1', family: 4 }] })).resolves.toBeInstanceOf(URL);
    await expect(assertSafeUrl('http://127.0.0.1:4100/x', { allowLoopback: true })).resolves.toBeInstanceOf(URL);
    await expect(assertSafeUrl('http://169.254.169.254/latest', { allowLoopback: true })).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://10.0.0.5/', { allowLoopback: true })).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://example.com:6379/', { allowLoopback: true })).rejects.toBeInstanceOf(SsrfError);
    await expect(assertSafeUrl('http://localhost:4100/jobs/1')).rejects.toBeInstanceOf(SsrfError);
  });
});
