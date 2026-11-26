import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@jobportal.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';
const FIXTURE = process.env.E2E_FIXTURE_URL ?? 'http://localhost:4100';

async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/admin');
}

test.describe('accounts & bookmarks', () => {
  test('a visitor registers, saves a job and finds it under Saved', async ({ page }) => {
    const email = `viewer-${Date.now()}@e2e.local`;
    await page.goto('/register');
    await page.getByLabel('Full name').fill('E2E Viewer');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('Password123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL((u) => u.pathname === '/');

    const card = page.getByTestId('job-card').first();
    const title = (await card.getByRole('heading').innerText()).trim();
    await card.getByRole('button', { name: 'Save job' }).click();
    await expect(card.getByRole('button', { name: 'Remove from saved jobs' })).toBeVisible();

    await page.goto('/saved');
    await expect(page.getByTestId('job-card').first()).toContainText(title);
  });

  test('non-staff users cannot open the admin area', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByText('Sign in required')).toBeVisible();
  });
});

test.describe('administrator workflows', () => {
  test('primary flow: paste a job URL, review the extraction and publish', async ({ page }) => {
    const id = `e2e-${Date.now()}`;
    await loginAsAdmin(page);
    await page.goto('/admin/submit');
    await page.getByLabel('Job posting URL').fill(`${FIXTURE}/jobs/${id}`);
    await page.getByRole('button', { name: 'Extract job' }).click();

    await page.waitForURL('**/admin/extractions/**');
    await expect(page.getByRole('heading', { name: 'Review extracted job' })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel('Job title')).toHaveValue(`Playwright Test Engineer ${id}`);
    await expect(page.getByLabel('Company', { exact: true })).toHaveValue(`Fixture Labs ${id}`);
    await expect(page.getByLabel('Application URL')).toHaveValue(`https://fixture-careers.example/apply/${id}`);

    // Live LinkedIn-style preview is generated from the draft.
    await expect(page.getByText(`Fixture Labs ${id} Recruitment | Playwright Test Engineer ${id}`)).toBeVisible();

    // Edit before publishing.
    await page.getByLabel('Location').fill('Pune, India');
    await page.getByRole('button', { name: 'Publish now' }).click();

    await page.waitForURL('**/jobs/**');
    await expect(page.getByRole('heading', { level: 1, name: `Playwright Test Engineer ${id}` })).toBeVisible();
    await expect(page.getByText('Pune, India').first()).toBeVisible();

    // Visible to visitors in search, newest first.
    await page.goto(`/search?q=${id}`);
    await expect(page.getByTestId('job-card').first()).toContainText(`Playwright Test Engineer ${id}`);

    // Re-submitting the same URL is flagged as a duplicate.
    await page.goto('/admin/submit');
    await page.getByLabel('Job posting URL').fill(`${FIXTURE}/jobs/${id}`);
    await page.getByRole('button', { name: 'Extract job' }).click();
    await expect(page.getByText(/already used for/i)).toBeVisible();
    await expect(page.getByText('Likely duplicate')).toBeVisible({ timeout: 45_000 });
  });

  test('manual job creation with live preview and publish', async ({ page }) => {
    const stamp = Array.from({ length: 8 }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
    const title = `Manual QA Analyst ${stamp}`;
    const company = `Vendor ${stamp}`;
    await loginAsAdmin(page);
    await page.goto('/admin/jobs/new');
    await page.getByLabel('Job title').fill(title);
    await page.getByLabel('Company', { exact: true }).fill(company);
    await page.getByLabel('Location').fill('Chennai');
    await page.getByLabel('Work mode').selectOption('HYBRID');
    await page.getByLabel('Required skills').fill('Selenium, SQL,');
    await page.getByLabel('Application URL').fill(`https://e2e-manual.example/apply/${stamp}`);
    await expect(page.getByText(`${company} Recruitment | ${title} (Hybrid) @ Chennai`)).toBeVisible();
    await page.getByRole('button', { name: 'Publish now' }).click();
    await page.waitForURL('**/jobs/**');
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.getByText('#Hybrid').first()).toBeVisible();
  });

  test('blocks SSRF targets with a clear message', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/admin/submit');
    await page.getByLabel('Job posting URL').fill('http://169.254.169.254/latest/meta-data');
    await page.getByRole('button', { name: 'Extract job' }).click();
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /private or internal addresses/i })).toBeVisible();
  });
});
