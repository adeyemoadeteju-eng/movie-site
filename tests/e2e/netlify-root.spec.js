import { test, expect } from '@playwright/test';

// This smoke test is run only against Netlify's deployed root URL from the PR workflow.
test.skip(process.env.PLAYWRIGHT_NETLIFY_SMOKE !== 'true', 'Runs only against a Netlify deploy preview.');

test('Netlify root deployment loads the app and its JS/CSS assets', async ({ page }) => {
  const assetFailures = [];
  const pageErrors = [];

  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ popular: [], recent: [] })
  }));
  await page.route('https://anime-api-jqpp.onrender.com/docs', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>API docs mock</title>'
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/', route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><title>Anivexa mock</title>'
  }));

  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    const url = new URL(response.url());
    if (/\\.(?:js|css)$/.test(url.pathname) && response.status() >= 400) {
      assetFailures.push(response.status() + ' ' + url.pathname);
    }
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.ad-header')).toBeVisible();
  await expect(page.locator('.ad-home-intro')).toBeVisible();
  await expect(page.locator('.ad-home-intro-brand')).toContainText('AniOrbit');
  await expect(page.locator('#boot-screen')).toHaveCount(0);
  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});
