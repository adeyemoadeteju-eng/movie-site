import { test, expect } from '@playwright/test';

test('AnimeDex home renders spotlight, popular and recent catalogue rows', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/movie-site/');
  await expect(page.locator('.ad-header')).toBeVisible();
  await expect(page.locator('.ad-brand')).toContainText('AnimeDex');
  await expect(page.getByRole('heading', { name: 'Most Popular' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Release' })).toBeVisible();
  await expect(page.locator('.ad-section').first().locator('.ad-tile').first()).toBeVisible();
  await expect(page.locator('.ad-section').nth(1).locator('.ad-tile').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('search and anime details page load and episode links are present', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/movie-site/');
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
