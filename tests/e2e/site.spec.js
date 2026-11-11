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
  await expect(page.locator('.ad-home-intro')).toBeVisible();
  await expect(page.locator('.ad-home-intro-brand')).toContainText('AnimeDex');
  await expect(page.locator('.ad-home-search')).toHaveCSS('border-radius', '999px');
  await expect(page.locator('.ad-header .ad-search')).toBeHidden();
  await expect(page.locator('.ad-brand')).toContainText('AnimeDex');
  await expect(page.locator('.ad-brand-mark')).toHaveCount(0);
  await expect(page.locator('.ad-brand')).toHaveCSS('align-items', 'center');
  await expect(page.getByRole('heading', { name: 'Most Popular' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently Updated' })).toBeVisible();
  await expect(page.locator('#boot-screen')).toHaveCount(0);
  await expect(page.locator('.ad-section').first().locator('.ad-tile').first()).toBeVisible();
  await expect(page.locator('.ad-section').first().locator('.ad-tile').first()).toHaveCSS('border-radius', '12px');
  await expect(page.locator('.ad-section').first().locator('.ad-poster').first()).toHaveCSS('position', 'relative');
  await expect(page.locator('.ad-section').first().locator('.ad-tile-info').first()).toHaveCSS('position', 'relative');
  await expect(page.locator('.ad-section').nth(1).locator('.ad-tile').first()).toBeVisible();
  expect(assetFailures).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('featured YouTube trailers autoplay muted on the home page', async ({ page }) => {
  await page.route('**/anime/popular?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ results: [{
      id: 55, title: { english: 'Trailer Test' }, format: 'TV', seasonYear: 2026,
      description: 'A featured series', coverImage: { large: '', extraLarge: '' },
      trailer: { id: 'abcDEF12345', site: 'youtube' }
    }] })
  }));
  await page.route('**/anime/recent?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] })
  }));
  await page.route('**/anime/filter?genre=Action**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [
      { id: 77, title: { english: 'Action Genre Pick' }, genres: ['Action'] }
    ] })
  }));
  await page.goto(pagePath);
  await page.locator('.ad-quick-tags').getByRole('button', { name: 'Action' }).click();
  await expect(page.getByRole('heading', { name: 'Action', exact: true })).toBeVisible();
  await expect(page.locator('.ad-results .ad-tile')).toContainText('Action Genre Pick');
  await page.getByRole('button', { name: 'Back to Home' }).click();
  const trailer = page.locator('.ad-hero-trailer');
  await expect(trailer).toBeVisible();
  await expect(trailer).toHaveAttribute('src', /autoplay=1.*mute=1/);
  await expect(trailer).toHaveAttribute('allow', /autoplay/);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Autoplay muted trailers').uncheck();
  await page.getByLabel('Accent colour').selectOption('blue');
  await expect(page.locator('.ad-hero-trailer')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByLabel('Autoplay muted trailers')).not.toBeChecked();
  await expect(page.getByLabel('Accent colour')).toHaveValue('blue');
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
  await page.route('**/anime/info/*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 1, idMal: 1, title: { english: 'Test Anime', romaji: 'Test Anime' },
      description: 'A test series', coverImage: { large: '', extraLarge: '' }, format: 'TV',
      seasonYear: 2024, episodes: 3, genres: ['Action', 'Adventure'], status: 'FINISHED',
      relations: { edges: [{ relationType: 'SEQUEL', node: { id: 2, type: 'ANIME', format: 'TV', title: { english: 'Test Anime Season 2' }, coverImage: { large: '', extraLarge: '' }, episodes: 12 } }] }
    })
  }));
  await page.route('**/anime/filter?**', route => {
    const url = new URL(route.request().url());
    const genre = url.searchParams.get('genre');
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ results: genre === 'Action'
        ? [{ id: 2, title: { english: 'Action Pick' }, genres: ['Action'] }, { id: 3, title: { english: 'Shared Pick' }, genres: ['Action', 'Adventure'] }]
        : [{ id: 3, title: { english: 'Shared Pick' }, genres: ['Action', 'Adventure'] }, { id: 4, title: { english: 'Adventure Pick' }, genres: ['Adventure'] }] })
    });
  });
  await page.route('**/anime/episodes/*', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      providers: {
        anineko: {
          episodes: {
            sub: [
              { number: 1, title: 'Episode 1' },
              { number: 2, title: 'Episode 2' },
              { number: 3, title: 'Episode 3' }
            ],
            dub: []
          }
        }
      }
    })
  }));
  await page.goto(pagePath);
  await page.getByRole('searchbox', { name: 'Search Anime' }).fill('Naruto');
  await page.getByRole('button', { name: 'Search' }).click();
  const first = page.locator('.ad-results .ad-grid .ad-tile').first();
  await expect(first).toBeVisible({ timeout: 60000 });
  await first.click();
  await expect(page.locator('.ad-detail-top')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.ad-detail-copy h1')).not.toBeEmpty();
  await expect(page.locator('.ad-episode-grid a').first()).toBeVisible();
  await expect(page.locator('.ad-episode-grid a')).toHaveCount(3);
  await expect(page.locator('.ad-episodes h2')).toHaveText('Season 1 Episodes');
  await expect(page.locator('.ad-episode-grid a').first()).toContainText('S1 · EP 1');
  await expect(page.getByRole('link', { name: /Next season Test Anime Season 2/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('a failed JavaScript bundle leaves a visible reload screen instead of a blank page', async ({ page }) => {
  await page.route('**/assets/*.js', route => route.abort());

  await page.goto(pagePath);
  await expect(page.locator('#boot-screen')).toBeVisible();
  await expect(page.locator('#boot-status')).toContainText('Starting AnimeDex');
  await expect(page.getByRole('button', { name: 'Reload site' })).toBeVisible({ timeout: 15000 });
});

test('poster catalogue stays usable on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pagePath);
  await expect(page.locator('.ad-brand')).toContainText('AnimeDex');
  await expect(page.locator('.ad-brand-mark')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search Anime' })).toBeVisible();
  await expect(page.locator('.ad-tile').first()).toBeVisible({ timeout: 60000 });
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
});
