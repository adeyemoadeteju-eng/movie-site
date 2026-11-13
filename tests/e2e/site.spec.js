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

test('homepage catalogue is reused from the tab cache after refresh', async ({ page }) => {
  let requests = 0;
  await page.route('**/anime/home', route => {
    requests += 1;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        popular: [{ id: 91, title: { english: 'Cached Home Pick' }, format: 'TV', coverImage: { large: '' } }],
        recent: []
      })
    });
  });

  await page.goto(pagePath);
  await expect(page.locator('.ad-section .ad-tile').first()).toContainText('Cached Home Pick');
  await page.reload();
  await expect(page.locator('.ad-section .ad-tile').first()).toContainText('Cached Home Pick');
  expect(requests).toBe(1);
});

test('featured YouTube trailers autoplay muted on the home page', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      popular: [{
        id: 55, title: { english: 'Trailer Test' }, format: 'TV', seasonYear: 2026,
        description: 'A featured series', coverImage: { large: '', extraLarge: '' },
        trailer: { id: 'abcDEF12345', site: 'youtube' }
      }],
      recent: []
    })
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
  await page.route('**/anime/home', route => route.fulfill({
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
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ popular: [{ id: 1, title: { english: 'Test Anime' }, format: 'TV' }], recent: [] })
  }));
  await page.route('**/anime/search?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ results: [{
      id: 1, idMal: 1, title: { english: 'Test Anime', romaji: 'Test Anime' },
      description: 'A test series', coverImage: { large: '', extraLarge: '' }, format: 'TV',
      seasonYear: 2024, episodes: 3, genres: ['Action', 'Adventure'], status: 'FINISHED'
    }] })
  }));
  await page.route('**/anime/info/*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({
      id: 1, idMal: 1, title: { english: 'Test Anime', romaji: 'Test Anime' },
      description: 'A test series', coverImage: { large: '', extraLarge: '' }, format: 'TV',
      seasonYear: 2024, episodes: 3, genres: ['Action', 'Adventure'], status: 'FINISHED',
      recommendations: { nodes: [{ rating: 90, mediaRecommendation: {
        id: 3, title: { english: 'Recommended Pick' }, coverImage: { large: '' }, format: 'TV', genres: ['Action']
      }}] },
      relations: { edges: [{ relationType: 'SEQUEL', node: { id: 2, type: 'ANIME', format: 'TV', title: { english: 'Test Anime Season 2' }, coverImage: { large: '', extraLarge: '' }, episodes: 12 } }] }
    })
  }));
  let similarGenreRequests = 0;
  await page.route('**/anime/filter?**', route => {
    similarGenreRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
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
  await expect(page.locator('.ad-section .ad-tile').first()).toContainText('Recommended Pick');
  expect(similarGenreRequests).toBe(0);
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


test('advanced discovery combines catalogue filters and local studio, rating and popularity refinements', async ({ page }) => {
  let requestedUrl = '';
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ popular: [], recent: [] })
  }));
  await page.route('**/anime/genres', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ genres: ['Action','Comedy'] })
  }));
  await page.route('**/anime/filter?**', route => {
    requestedUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [
      { id: 801, title: { english: 'Qualified Filter Pick' }, coverImage: { large: '' }, format: 'TV', averageScore: 86, popularity: 120000, studios: { nodes: [{ name: 'Bones' }] } },
      { id: 802, title: { english: 'Low Score Pick' }, coverImage: { large: '' }, format: 'TV', averageScore: 62, popularity: 120000, studios: { nodes: [{ name: 'Bones' }] } },
      { id: 803, title: { english: 'Wrong Studio Pick' }, coverImage: { large: '' }, format: 'TV', averageScore: 91, popularity: 150000, studios: { nodes: [{ name: 'Madhouse' }] } }
    ] }) });
  });
  await page.goto(pagePath);
  await page.getByRole('button', { name: 'Open filters' }).click();
  await page.locator('.ad-discovery-form label').nth(0).locator('select').selectOption('Action');
  await page.locator('.ad-discovery-form label').nth(1).locator('input').fill('2024');
  await page.locator('.ad-discovery-form label').nth(2).locator('select').selectOption('FALL');
  await page.locator('.ad-discovery-form label').nth(4).locator('select').selectOption('FINISHED');
  await page.locator('.ad-discovery-form label').nth(5).locator('select').selectOption('80');
  await page.locator('.ad-discovery-form label').nth(6).locator('select').selectOption('100000');
  await page.locator('.ad-discovery-form label').nth(7).locator('input').fill('Bones');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('.ad-results .ad-tile')).toHaveCount(1);
  await expect(page.locator('.ad-results .ad-tile')).toContainText('Qualified Filter Pick');
  const requested = new URL(requestedUrl);
  expect(requested.searchParams.get('genre')).toBe('Action');
  expect(requested.searchParams.get('year')).toBe('2024');
  expect(requested.searchParams.get('season')).toBe('FALL');
  expect(requested.searchParams.get('status')).toBe('FINISHED');
});

test('watchlist, continue watching, episode completion and recommendations persist locally', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ popular: [{ id: 901, title: { english: 'Progress Test Anime' }, format: 'TV', coverImage: { large: '' } }], recent: [] })
  }));
  await page.route('**/anime/info/901', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 901, idMal: 901, title: { english: 'Progress Test Anime', romaji: 'Progress Test Anime' },
      description: 'A progress tracking test.', coverImage: { large: '', extraLarge: '' }, format: 'TV',
      seasonYear: 2025, episodes: 4, genres: ['Comedy'], status: 'RELEASING',
      recommendations: { nodes: [{ rating: 95, mediaRecommendation: {
        id: 902, title: { english: 'Because You Watched This' }, coverImage: { large: '' }, format: 'TV', genres: ['Comedy']
      }}] }
    })
  }));
  await page.route('**/anime/episodes/901', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: { demo: { episodes: { sub: [
      { number: 1, title: 'First Episode' }, { number: 2, title: 'Second Episode' },
      { number: 3, title: 'Third Episode' }, { number: 4, title: 'Fourth Episode' }
    ], dub: [] } } } })
  }));
  await page.route('**/anime/dub-finder/901**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_listings', providers: [] })
  }));
  await page.route('**/anime/playback/901?episode=1', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Test player', url: 'https://player.example.test/embed/901/1' }] })
  }));
  await page.route('**/anime/schedule?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] })
  }));
  await page.goto(pagePath);
  await page.locator('.ad-section .ad-tile').first().click();
  await expect(page.locator('.ad-detail-top')).toBeVisible();
  await page.getByRole('button', { name: '+ Add to watchlist' }).click();
  await expect(page.getByRole('button', { name: '✓ In your watchlist' })).toBeVisible();
  await page.locator('.ad-episode-grid a').first().click();
  await expect(page.locator('.ad-player iframe')).toBeVisible();
  await page.getByRole('button', { name: 'Mark episode as watched' }).click();
  await expect(page.getByRole('button', { name: '✓ Episode watched' })).toBeVisible();
  await page.goto(pagePath);
  await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible();
  await expect(page.locator('.ad-continue-card').first()).toContainText('Episode 2');
  await expect(page.getByRole('heading', { name: 'Picked for You' })).toBeVisible();
  await expect(page.locator('.ad-recommendations .ad-tile').first()).toContainText('Because You Watched This');
  await expect(page.getByRole('heading', { name: 'My Watchlist' })).toBeVisible();
  await expect(page.locator('.ad-my-list .ad-tile')).toContainText('Progress Test Anime');
});
