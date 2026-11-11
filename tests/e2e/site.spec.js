import { test, expect } from '@playwright/test';

const pagePath='/movie-site/';

test('AnimeDex boots without a blank screen and loads its catalogue assets', async ({ page }) => {
  const pageErrors = [];
  const assetFailures = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (/\.(?:js|css)$/.test(url.pathname) && response.status() >= 400) {
      assetFailures.push(`${response.status()} ${url.pathname}`);
    }
  });

  await page.goto(pagePath);
  await expect(page.locator('.ad-header')).toBeVisible();
  await expect(page.locator('.ad-brand')).toContainText('AnimeDex');
  await expect(page.getByRole('heading', { name: 'Most Popular' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Release' })).toBeVisible();
  await expect(page.locator('#boot-screen')).toHaveCount(0);
  await expect(page.locator('.ad-section').first().locator('.ad-tile').first()).toBeVisible();
  await expect(page.locator('.ad-section').nth(1).locator('.ad-tile').first()).toBeVisible();
  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('catalogue failures show a recovery message instead of an empty or blank page', async ({ page }) => {
  await page.route('**/anime/popular?**', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'temporarily unavailable' })
  }));
  await page.route('**/anime/recent?**', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'temporarily unavailable' })
  }));

  await page.goto(pagePath);
  await expect(page.locator('.ad-header')).toBeVisible();
  await expect(page.getByRole('alert').filter({ hasText: 'catalogue is temporarily unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('search and anime details page load and episode links are present', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pagePath);
  await page.getByRole('searchbox', { name: 'Search Anime' }).fill('Naruto');
  await page.getByRole('button', { name: 'Search' }).click();
  const first = page.locator('.ad-results .ad-grid .ad-tile').first();
  await expect(first).toBeVisible({ timeout: 60000 });
  await first.click();
  await expect(page.locator('.ad-detail-top')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.ad-detail-copy h1')).not.toBeEmpty();
  await expect(page.locator('.ad-episode-grid a').first()).toBeVisible();
  expect(errors).toEqual([]);
});
