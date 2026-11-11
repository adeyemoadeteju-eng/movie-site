import { test, expect } from '@playwright/test';

test('homepage loads live catalogue rows and genres', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/movie-site/');

  await expect(page.getByRole('heading', { name: 'Trending Animes' })).toBeVisible();
  await expect(page.locator('#browse .browse-section').nth(0).locator('.poster-card').first()).toBeVisible();
  await expect(page.locator('#browse .browse-section').nth(1).locator('.poster-card').first()).toBeVisible();
  await expect(page.locator('#genreList .genre-chip').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});

test('genre filters, search results, and the anime details modal work', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));

  await page.goto('/movie-site/');

  const actionGenre = page.locator('#genreList .genre-chip', { hasText: 'Action' });
  await expect(actionGenre).toBeVisible();
  await actionGenre.click();
  await expect(page.locator('#results .poster-card').first()).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search anime' });
  await search.fill('Naruto');
  await page.getByRole('button', { name: 'Search' }).click();

  const firstResult = page.locator('#results .poster-card').first();
  await expect(firstResult).toBeVisible();
  const resultTitle = (await firstResult.locator('.title').innerText()).trim();
  await firstResult.click();

  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.series-meta h2')).toHaveText(resultTitle);
  await expect(page.locator('#seasonAccordion .episode-item').first()).toBeVisible();

  expect(pageErrors).toEqual([]);
});
