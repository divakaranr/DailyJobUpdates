import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, todayYmd, type ExtractionDTO, type JobDTO } from '@jobs/shared';
import { createTestApp, createUser, FakeBrowser, FakeFetcher, fixture, resetDatabase, TEST_DB_URL } from '../helpers';

const JOB_URL = 'https://contoso.example/careers/qa-automation';
const fetcher = new FakeFetcher({
  [JOB_URL]: fixture('static-job.html'),
  'https://tailspin.example/jobs/csa': fixture('plain-job.html'),
  'https://blocked.example/job': fixture('captcha.html'),
  'https://spa.example/job/1': fixture('spa-shell.html'),
  'https://gone.example/job': 404,
});
const browser = new FakeBrowser(fixture('plain-job.html'));

const ymd = (days: number) => todayYmd(addDays(new Date(), days));
const baseJob = (over: Record<string, unknown> = {}) => ({
  title: 'Java Backend Developer',
  companyName: 'Acme Corp',
  location: 'Pune',
  workMode: 'HYBRID',
  employmentType: 'FULL_TIME',
  qualification: 'B.E / B.Tech',
  minExperience: 2,
  maxExperience: 4,
  skills: ['Java', 'Spring Boot', 'SQL'],
  applicationUrl: 'https://acme.example/apply/123',
  action: 'publish',
  ...over,
});

describe.skipIf(!TEST_DB_URL)('API integration', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp({ fetcher, browser });
  });
  afterAll(async () => {
    await t?.app.close();
    await t?.container.close();
    await t?.prisma.$disconnect();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    t.container.tags.invalidate();
    t.container.settings.clearCache();
    await createUser(t.prisma, 'SUPER_ADMIN', 'super@test.local');
    await createUser(t.prisma, 'ADMIN', 'admin@test.local');
    await createUser(t.prisma, 'EDITOR', 'editor@test.local');
    await createUser(t.prisma, 'VIEWER', 'viewer@test.local');
    for (const e of ['super@test.local', 'admin@test.local', 'editor@test.local', 'viewer@test.local']) await t.login(e);
  });

  const waitForExtraction = async (id: string): Promise<ExtractionDTO> => {
    await t.queue.onIdle();
    return (await t.req('GET', `/api/extractions/${id}`, { as: 'admin@test.local' })).json();
  };

  describe('authentication & security', () => {
    it('registers viewers, logs in and out', async () => {
      const reg = await t.req('POST', '/api/auth/register', { body: { name: 'New Person', email: 'new@test.local', password: 'Secret1234' } });
      expect(reg.statusCode).toBe(201);
      expect(reg.json().user.role).toBe('VIEWER');
      const bad = await t.req('POST', '/api/auth/login', { body: { email: 'new@test.local', password: 'wrongpass1' } });
      expect(bad.statusCode).toBe(401);
      const dup = await t.req('POST', '/api/auth/register', { body: { name: 'Again', email: 'new@test.local', password: 'Secret1234' } });
      expect(dup.statusCode).toBe(409);
      const weak = await t.req('POST', '/api/auth/register', { body: { name: 'Weak', email: 'weak@test.local', password: 'short' } });
      expect(weak.statusCode).toBe(400);
    });

    it('returns the current user from the session cookie', async () => {
      const me = await t.req('GET', '/api/auth/me', { as: 'editor@test.local' });
      expect(me.json().user.role).toBe('EDITOR');
      const anon = await t.req('GET', '/api/auth/me');
      expect(anon.json().user).toBeNull();
    });

    it('blocks state-changing requests without the CSRF header or from foreign origins', async () => {
      const noHeader = await t.app.inject({ method: 'POST', url: '/api/auth/logout' });
      expect(noHeader.statusCode).toBe(403);
      const foreign = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { origin: 'https://evil.example', 'x-requested-with': 'fetch' } });
      expect(foreign.statusCode).toBe(403);
    });

    it('rejects suspended users', async () => {
      const viewer = await t.prisma.user.findUniqueOrThrow({ where: { email: 'viewer@test.local' } });
      await t.prisma.user.update({ where: { id: viewer.id }, data: { status: 'SUSPENDED' } });
      const me = await t.req('GET', '/api/auth/me', { as: 'viewer@test.local' });
      expect(me.json().user).toBeNull();
    });

    it('rejects SSRF targets at submission time', async () => {
      for (const url of ['http://127.0.0.1/admin', 'http://169.254.169.254/latest', 'http://localhost:4000/api', 'file:///etc/passwd']) {
        const res = await t.req('POST', '/api/extractions', { as: 'editor@test.local', body: { url } });
        expect(res.statusCode, url).toBe(400);
      }
    });
  });

  describe('role-based access control', () => {
    it('enforces roles on job management', async () => {
      expect((await t.req('POST', '/api/jobs', { body: baseJob() })).statusCode).toBe(401);
      expect((await t.req('POST', '/api/jobs', { as: 'viewer@test.local', body: baseJob() })).statusCode).toBe(403);
      expect((await t.req('GET', '/api/admin/dashboard', { as: 'viewer@test.local' })).statusCode).toBe(403);
      expect((await t.req('GET', '/api/admin/extraction-logs', { as: 'editor@test.local' })).statusCode).toBe(403);
      expect((await t.req('GET', '/api/admin/settings', { as: 'admin@test.local' })).statusCode).toBe(200);
    });

    it('routes editor publications through approval', async () => {
      const created = await t.req('POST', '/api/jobs', { as: 'editor@test.local', body: baseJob() });
      expect(created.statusCode).toBe(201);
      const job: JobDTO = created.json();
      expect(job.status).toBe('PENDING_APPROVAL');
      expect((await t.req('GET', `/api/jobs/${job.id}`)).statusCode).toBe(404); // not public yet
      expect((await t.req('POST', `/api/admin/jobs/${job.id}/approve`, { as: 'editor@test.local' })).statusCode).toBe(403);
      const approved = await t.req('POST', `/api/admin/jobs/${job.id}/approve`, { as: 'admin@test.local' });
      expect(approved.json().status).toBe('PUBLISHED');
      expect((await t.req('GET', `/api/jobs/${job.id}`)).statusCode).toBe(200);
    });

    it('prevents admins from escalating to super admin', async () => {
      const res = await t.req('POST', '/api/admin/users', {
        as: 'admin@test.local',
        body: { name: 'Sneaky', email: 'sneaky@test.local', password: 'Password123', role: 'SUPER_ADMIN' },
      });
      expect(res.statusCode).toBe(403);
      const ok = await t.req('POST', '/api/admin/users', {
        as: 'admin@test.local',
        body: { name: 'Writer', email: 'writer@test.local', password: 'Password123', role: 'EDITOR' },
      });
      expect(ok.statusCode).toBe(201);
    });
  });

  describe('manual job creation & publishing', () => {
    it('creates a job with auto tags, normalised skills and a generated post', async () => {
      const res = await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ skills: ['java', 'SpringBoot', 'mysql'] }) });
      expect(res.statusCode).toBe(201);
      const job: JobDTO = res.json();
      expect(job.status).toBe('PUBLISHED');
      expect(job.skills).toEqual(['Java', 'Spring Boot', 'MySQL']);
      const slugs = job.tags.map((x) => `${x.category}:${x.slug}`);
      expect(slugs).toEqual(expect.arrayContaining(['SKILL:java', 'SKILL:sql', 'WORK_MODE:hybrid', 'EXPERIENCE:1-3-years', 'JOB_CATEGORY:software-development']));
      expect(job.generatedPost).toContain('Acme Corp Recruitment | Java Backend Developer (Hybrid) @ Pune');
      expect(job.generatedPost).toContain('Apply Link: https://acme.example/apply/123');
      expect(job.expiresAt).not.toBeNull();
    });

    it('supports drafts, scheduling and archiving', async () => {
      const draft: JobDTO = (await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ action: 'draft' }) })).json();
      expect(draft.status).toBe('DRAFT');
      const future = new Date(Date.now() + 3600_000).toISOString();
      const scheduled = await t.req('PUT', `/api/jobs/${draft.id}`, { as: 'admin@test.local', body: baseJob({ action: 'schedule', scheduledAt: future }) });
      expect(scheduled.json().status).toBe('SCHEDULED');
      await t.container.maintenance.run(new Date(Date.now() + 2 * 3600_000));
      expect((await t.req('GET', `/api/jobs/${draft.id}`)).json().status).toBe('PUBLISHED');
      const archived = await t.req('POST', `/api/admin/jobs/${draft.id}/archive`, { as: 'admin@test.local' });
      expect(archived.json().status).toBe('ARCHIVED');
    });

    it('validates input', async () => {
      const res = await t.req('POST', '/api/jobs', {
        as: 'admin@test.local',
        body: baseJob({ minExperience: 5, maxExperience: 2, applicationUrl: 'javascript:alert(1)' }),
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('previews a post without saving', async () => {
      const res = await t.req('POST', '/api/jobs/preview', { as: 'editor@test.local', body: baseJob({ deadline: ymd(-1) }) });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.post).toContain('Java Backend Developer');
      expect(body.suggestedTags.length).toBeGreaterThan(3);
      expect(body.warnings.some((w: { field: string }) => w.field === 'deadline')).toBe(true);
      expect(await t.prisma.job.count()).toBe(0);
    });
  });

  describe('duplicate detection', () => {
    it('blocks likely duplicates unless confirmed', async () => {
      await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob() });
      const dup = await t.req('POST', '/api/jobs', {
        as: 'admin@test.local',
        body: baseJob({ title: 'Java Backend Developer (Urgent Hiring)', companyName: 'ACME Corp Pvt Ltd', applicationUrl: null }),
      });
      expect(dup.statusCode).toBe(409);
      expect(dup.json().error.code).toBe('DUPLICATE_JOB');
      expect(dup.json().error.details.candidates[0].reasons).toContain('Same company');
      const forced = await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ confirmDuplicate: true }) });
      expect(forced.statusCode).toBe(201);
    });

    it('allows different roles at the same company', async () => {
      await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob() });
      const other = await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ title: 'HR Executive', applicationUrl: 'https://acme.example/apply/999' }) });
      expect(other.statusCode).toBe(201);
    });
  });

  describe('search, filters, sorting & bookmarks', () => {
    beforeEach(async () => {
      const jobs = [
        baseJob({ title: 'Java Backend Developer', companyName: 'Acme' }),
        baseJob({ title: 'Selenium Test Engineer', companyName: 'Globex', workMode: 'REMOTE', skills: ['Selenium', 'Java'], location: 'Bangalore', applicationUrl: 'https://globex.example/a' }),
        baseJob({ title: 'Customer Support Executive', companyName: 'Initech', workMode: 'WFH', skills: ['Communication'], minExperience: 0, maxExperience: 1, qualification: 'Any Graduation', applicationUrl: 'https://initech.example/a' }),
        baseJob({ title: 'Old Role', companyName: 'Umbrella', deadline: ymd(-2), applicationUrl: 'https://umbrella.example/a' }),
      ];
      let i = 0;
      for (const j of jobs) {
        const job: JobDTO = (await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: j })).json();
        await t.prisma.job.update({ where: { id: job.id }, data: { publishedAt: new Date(Date.now() - (10 - i++) * 3600_000) } });
      }
    });

    it('lists active jobs latest first and supports oldest first', async () => {
      const latest = (await t.req('GET', '/api/jobs')).json();
      expect(latest.data.map((j: JobDTO) => j.title)).toEqual(['Customer Support Executive', 'Selenium Test Engineer', 'Java Backend Developer']);
      const oldest = (await t.req('GET', '/api/jobs?sort=oldest')).json();
      expect(oldest.data[0].title).toBe('Java Backend Developer');
    });

    it('supports partial, case-insensitive keyword search', async () => {
      const res = (await t.req('GET', '/api/jobs?q=SELEN')).json();
      expect(res.data.map((j: JobDTO) => j.title)).toEqual(['Selenium Test Engineer']);
      const byCompany = (await t.req('GET', '/api/jobs?q=initech')).json();
      expect(byCompany.data[0].title).toBe('Customer Support Executive');
      const relevance = (await t.req('GET', '/api/jobs?q=java&sort=relevance')).json();
      expect(relevance.data[0].title).toBe('Java Backend Developer');
    });

    it('combines multiple filters', async () => {
      const remote = (await t.req('GET', '/api/jobs?workMode=REMOTE,WFH')).json();
      expect(remote.meta.total).toBe(2);
      const freshers = (await t.req('GET', '/api/jobs?experience=freshers&category=customer-support')).json();
      expect(freshers.data.map((j: JobDTO) => j.title)).toEqual(['Customer Support Executive']);
      const skills = (await t.req('GET', '/api/jobs?skills=selenium&location=bangalore')).json();
      expect(skills.data.map((j: JobDTO) => j.title)).toEqual(['Selenium Test Engineer']);
      const expired = (await t.req('GET', '/api/jobs?status=expired')).json();
      expect(expired.data.map((j: JobDTO) => [j.title, j.status])).toEqual([['Old Role', 'EXPIRED']]);
    });

    it('paginates', async () => {
      const p1 = (await t.req('GET', '/api/jobs?pageSize=2')).json();
      const p2 = (await t.req('GET', '/api/jobs?pageSize=2&page=2')).json();
      expect(p1.meta).toMatchObject({ total: 3, totalPages: 2 });
      expect(p2.data).toHaveLength(1);
    });

    it('bookmarks jobs for logged-in users', async () => {
      const [job] = (await t.req('GET', '/api/jobs')).json().data as JobDTO[];
      expect((await t.req('POST', `/api/jobs/${job.id}/bookmark`)).statusCode).toBe(401);
      expect((await t.req('POST', `/api/jobs/${job.id}/bookmark`, { as: 'viewer@test.local' })).statusCode).toBe(201);
      const list = (await t.req('GET', '/api/bookmarks', { as: 'viewer@test.local' })).json();
      expect(list.data.map((j: JobDTO) => j.id)).toEqual([job.id]);
      const feed = (await t.req('GET', '/api/jobs', { as: 'viewer@test.local' })).json();
      expect(feed.data.find((j: JobDTO) => j.id === job.id).bookmarked).toBe(true);
      await t.req('DELETE', `/api/jobs/${job.id}/bookmark`, { as: 'viewer@test.local' });
      expect((await t.req('GET', '/api/bookmarks', { as: 'viewer@test.local' })).json().meta.total).toBe(0);
    });
  });

  describe('tag management', () => {
    it('prevents duplicate tags by case, spelling and synonym', async () => {
      for (const name of ['java', 'JAVA', 'Node JS', 'ReactJS']) {
        const res = await t.req('POST', '/api/tags', { as: 'editor@test.local', body: { name, category: 'SKILL' } });
        expect(res.statusCode, name).toBe(409);
      }
      const ok = await t.req('POST', '/api/tags', { as: 'editor@test.local', body: { name: 'Golang', category: 'SKILL', synonyms: ['go', 'GO', 'golang'] } });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().synonyms).toEqual(['go']);
    });

    it('lets admins deactivate but not delete system tags', async () => {
      const tags = (await t.req('GET', '/api/tags')).json().data;
      const java = tags.find((x: { slug: string; category: string }) => x.slug === 'java' && x.category === 'SKILL');
      expect((await t.req('DELETE', `/api/tags/${java.id}`, { as: 'editor@test.local' })).statusCode).toBe(403);
      expect((await t.req('DELETE', `/api/tags/${java.id}`, { as: 'admin@test.local' })).statusCode).toBe(403);
      const off = await t.req('PUT', `/api/tags/${java.id}`, { as: 'admin@test.local', body: { isActive: false } });
      expect(off.json().isActive).toBe(false);
      const active = (await t.req('GET', '/api/tags')).json().data;
      expect(active.some((x: { id: string }) => x.id === java.id)).toBe(false);
    });
  });

  describe('URL extraction workflow', () => {
    it('extracts, previews and publishes a job from a URL', async () => {
      const submit = await t.req('POST', '/api/extractions', { as: 'editor@test.local', body: { url: `${JOB_URL}?utm_source=newsletter` } });
      expect(submit.statusCode).toBe(202);
      const ex = await waitForExtraction(submit.json().extraction.id);
      expect(ex.status).toBe('READY');
      expect(ex.fetchMethod).toBe('STATIC');
      const r = ex.result!;
      expect(r.draft.title).toBe('QA Automation Engineer');
      expect(r.draft.companyName).toBe('Contoso Software');
      expect(r.draft.sourceUrl).toBe(JOB_URL);
      expect(r.draft.applicationUrl).toBe('https://contoso.example/careers/apply/qa-automation-123');
      expect(r.suggestedTags.map((x) => x.slug)).toEqual(expect.arrayContaining(['selenium', 'java', 'testing-qa', 'hybrid']));
      expect(r.postPreview).toContain('Contoso Software Recruitment | QA Automation Engineer (Hybrid)');

      const pub = await t.req('POST', `/api/extractions/${ex.id}/publish`, { as: 'admin@test.local', body: { ...r.draft, action: 'publish' } });
      expect(pub.statusCode).toBe(201);
      const job: JobDTO = pub.json();
      expect(job.sourceType).toBe('URL');
      expect(job.status).toBe('PUBLISHED');
      expect(job.company.logoUrl).toBe('https://contoso.example/logo.png');
      const after = (await t.req('GET', `/api/extractions/${ex.id}`, { as: 'admin@test.local' })).json();
      expect(after.status).toBe('PUBLISHED');
      expect(after.jobId).toBe(job.id);
      const source = await t.prisma.jobSource.findFirstOrThrow({ where: { jobId: job.id } });
      expect(source.extractedContentHash).toMatch(/^[a-f0-9]{64}$/);

      // Re-submitting the same URL reports the existing job and flags the duplicate.
      const again = await t.req('POST', '/api/extractions', { as: 'editor@test.local', body: { url: JOB_URL } });
      expect(again.json().existingJob.id).toBe(job.id);
      const ex2 = await waitForExtraction(again.json().extraction.id);
      expect(ex2.result!.duplicates[0]).toMatchObject({ jobId: job.id, isLikelyDuplicate: true });
      const blocked = await t.req('POST', `/api/extractions/${ex2.id}/publish`, { as: 'admin@test.local', body: { ...ex2.result!.draft, action: 'publish' } });
      expect(blocked.statusCode).toBe(409);
      const updated = await t.req('POST', `/api/extractions/${ex2.id}/publish`, {
        as: 'admin@test.local',
        body: { ...ex2.result!.draft, title: 'QA Automation Engineer II', action: 'publish', updateJobId: job.id },
      });
      expect(updated.statusCode).toBe(201);
      expect(updated.json().id).toBe(job.id);
      expect(updated.json().title).toBe('QA Automation Engineer II');
    });

    it('falls back to browser rendering for JavaScript-only pages', async () => {
      const submit = await t.req('POST', '/api/extractions', { as: 'editor@test.local', body: { url: 'https://spa.example/job/1' } });
      const ex = await waitForExtraction(submit.json().extraction.id);
      expect(ex.status).toBe('READY');
      expect(ex.fetchMethod).toBe('BROWSER');
      expect(ex.result!.draft.title).toBe('Customer Support Associate - Voice Process');
    });

    it('refuses CAPTCHA-protected pages and records failures in the logs', async () => {
      const submit = await t.req('POST', '/api/extractions', { as: 'editor@test.local', body: { url: 'https://blocked.example/job' } });
      const ex = await waitForExtraction(submit.json().extraction.id);
      expect(ex.status).toBe('FAILED');
      expect(ex.error).toMatch(/CAPTCHA/);
      const logs = (await t.req('GET', `/api/admin/extraction-logs?extractionId=${ex.id}`, { as: 'admin@test.local' })).json();
      expect(logs.data.some((l: { stage: string; status: string }) => l.stage === 'PIPELINE' && l.status === 'FAILURE')).toBe(true);
    });

    it('reports HTTP errors and allows retry', async () => {
      const submit = await t.req('POST', '/api/extractions', { as: 'editor@test.local', body: { url: 'https://gone.example/job' } });
      const ex = await waitForExtraction(submit.json().extraction.id);
      expect(ex.status).toBe('FAILED');
      expect(ex.error).toMatch(/404/);
      fetcher.pages['https://gone.example/job'] = fixture('plain-job.html');
      await t.req('POST', `/api/extractions/${ex.id}/retry`, { as: 'editor@test.local' });
      const retried = await waitForExtraction(ex.id);
      expect(retried.status).toBe('READY');
      expect(retried.attempts).toBe(2);
      fetcher.pages['https://gone.example/job'] = 404;
    });
  });

  describe('expiry & verification', () => {
    it('expires jobs past their deadline, walk-in date or default expiry window', async () => {
      const a: JobDTO = (await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ deadline: ymd(1) }) })).json();
      const b: JobDTO = (await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ title: 'Walk-in Drive', walkInDate: ymd(1), applicationUrl: 'https://x.example/1' }) })).json();
      const c: JobDTO = (await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ title: 'No Deadline Role', applicationUrl: 'https://x.example/2' }) })).json();
      const report = await t.container.maintenance.run(new Date(Date.now() + 3 * 86_400_000));
      expect(report).toMatchObject({ expiredByDeadline: 1, expiredByWalkIn: 1 });
      expect((await t.req('GET', `/api/jobs/${a.id}`)).json()).toMatchObject({ status: 'EXPIRED', expiryReason: 'DEADLINE_PASSED' });
      expect((await t.req('GET', `/api/jobs/${b.id}`)).json().expiryReason).toBe('WALKIN_DATE_PASSED');
      expect((await t.req('GET', `/api/jobs/${c.id}`)).json().status).toBe('PUBLISHED');
      await t.container.maintenance.run(new Date(Date.now() + 31 * 86_400_000));
      expect((await t.req('GET', `/api/jobs/${c.id}`)).json()).toMatchObject({ status: 'EXPIRED', expiryReason: 'AUTO_EXPIRY_RULE' });
      // History is retained.
      expect(await t.prisma.job.count()).toBe(3);
    });

    it('supports manual expiry and source re-verification', async () => {
      const job: JobDTO = (await t.req('POST', '/api/jobs', { as: 'admin@test.local', body: baseJob({ sourceUrl: 'https://gone.example/job' }) })).json();
      const verify = await t.req('POST', `/api/admin/jobs/${job.id}/verify`, { as: 'editor@test.local' });
      expect(verify.json()).toMatchObject({ status: 'LIKELY_CLOSED', httpStatus: 404 });
      const detail = (await t.req('GET', `/api/jobs/${job.id}`)).json();
      expect(detail.lastVerifyStatus).toBe('LIKELY_CLOSED');
      const expired = await t.req('POST', `/api/admin/jobs/${job.id}/expire`, { as: 'admin@test.local' });
      expect(expired.json()).toMatchObject({ status: 'EXPIRED', expiryReason: 'MANUAL' });
    });
  });

  describe('admin dashboard & settings', () => {
    it('reports counts and never exposes API keys', async () => {
      await t.req('POST', '/api/jobs', { as: 'editor@test.local', body: baseJob() });
      const dash = (await t.req('GET', '/api/admin/dashboard', { as: 'editor@test.local' })).json();
      expect(dash.jobs.PENDING_APPROVAL).toBe(1);
      expect(dash.pendingJobs).toHaveLength(1);
      const settings = await t.req('GET', '/api/admin/settings', { as: 'admin@test.local' });
      expect(settings.body).not.toMatch(/api[_-]?key/i);
      expect(settings.json().providers.find((p: { name: string }) => p.name === 'heuristic').configured).toBe(true);
      const upd = await t.req('PUT', '/api/admin/settings/general', { as: 'admin@test.local', body: { defaultExpiryDays: 45, showUnavailableFields: false } });
      expect(upd.json().defaultExpiryDays).toBe(45);
      const history = (await t.req('GET', '/api/admin/history?entityType=Setting', { as: 'admin@test.local' })).json();
      expect(history.data[0].action).toBe('SETTINGS_UPDATE');
    });
  });
});
