import { expect, test } from '@playwright/test';

test.describe('visitor experience', () => {
  test('home feed lists latest jobs first with key details', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /find your next role/i })).toBeVisible();
    const cards = page.getByTestId('job-card');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(1);
    await expect(page.getByText('Newest first').first()).toBeVisible();
    await expect(cards.first().getByRole('link', { name: /view details/i })).toBeVisible();
  });

  test('keyword search is debounced, partial and case-insensitive', async ({ page }) => {
    await page.goto('/search');
    await page.getByLabel('Search jobs').fill('SELEN');
    await expect(page).toHaveURL(/q=SELEN/);
    const cards = page.getByTestId('job-card');
    await expect(cards.first()).toContainText(/selenium/i);
  });

  test('filters combine and are reflected in the URL', async ({ page }) => {
    await page.goto('/search?experience=freshers');
    await expect(page.getByRole('button', { name: /^Freshers/ }).first()).toBeVisible();
    const total = page.getByRole('heading', { level: 2, name: /jobs?$/ });
    await expect(total).toBeVisible();
    await page.goto('/search?experience=freshers&workMode=WFH');
    await expect(page.getByTestId('job-card').first()).toContainText(/work from home/i);
  });

  test('expired jobs are labelled', async ({ page }) => {
    await page.goto('/search?status=expired');
    const card = page.getByTestId('job-card').first();
    await expect(card).toBeVisible();
    await expect(card.getByText('Expired', { exact: true })).toBeVisible();
  });

  test('job detail shows apply link, generated post and source attribution', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('job-card').first().getByRole('heading').getByRole('link').click();
    await expect(page.getByRole('heading', { name: 'Key details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Share-ready post' })).toBeVisible();
    await expect(page.getByText(/Source & verification/)).toBeVisible();
  });
});
