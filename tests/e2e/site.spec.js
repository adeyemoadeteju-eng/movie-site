import { test, expect } from '@playwright/test';

const pagePath='/movie-site/';

test.beforeEach(async ({ page }) => {
  await page.route('https://anime-api-jqpp.onrender.com/docs', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>API docs mock</title>'
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Anivexa mock</title>'
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/episodes/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: '{}'
  }));
  await page.route('https://ani.pm/api/partner/v1/series/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ data: { episodeList: [] } })
  }));
  await page.route('**/anime/info/*', route => {
    const id = Number(new URL(route.request().url()).pathname.split('/').pop());
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id, isAdult: false, genres: ['Action'], title: { english: 'Safe Test Anime' }, coverImage: { large: '' } })
    });
  });
});



test('homepage TileGrid renders popular and recent shelves without a runtime error', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      popular: [
        { id: 98101, title: { english: 'Runtime Grid Check One' }, format: 'TV', genres: ['Action'], seasonYear: 2026, meanScore: 86, isAdult: false },
        { id: 98102, title: { english: 'Runtime Grid Check Two' }, format: 'TV', genres: ['Drama'], seasonYear: 2025, isAdult: false },
        { id: 98103, title: { english: 'Runtime Grid Check Three' }, format: 'TV', genres: ['Comedy'], seasonYear: 2024, isAdult: false }
      ],
      recent: [
        { id: 98104, title: { english: 'Runtime Recent Check' }, format: 'TV', genres: ['Mystery'], isAdult: false }
      ]
    })
  }));

  await page.goto(pagePath);
  await expect(page.locator('.ao-topbar')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Most Popular' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently Updated' })).toBeVisible();
  await expect(page.locator('.ao-section').filter({ has: page.getByRole('heading', { name: 'Most Popular' }) }).locator('.ao-grid-rail .ao-tile')).toHaveCount(3);
  await expect(page.getByRole('link', { name: /Runtime Recent Check/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('ani.pm is checked before alternatives and becomes the default source', async ({ page }) => {
  await page.route('**/anime/info/8126', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 8126, title: { english: 'Ani.pm Primary Test' }, isAdult: false, format: 'TV', genres: ['Action'] })
  }));
  await page.route('**/anime/playback/8126?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'VidSrc Alternative', provider: 'vidsrc', url: 'https://vidsrc.example.test/embed/8126/1' }
    ] })
  }));

  let releaseAniPm;
  let markAniPmRequested;
  const aniPmRequested = new Promise(resolve => { markAniPmRequested = resolve; });
  const aniPmGate = new Promise(resolve => { releaseAniPm = resolve; });
  await page.route('https://ani.pm/api/partner/v1/series/8126', async route => {
    markAniPmRequested();
    await aniPmGate;
    await route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ data: { episodeList: [{
        number: 1,
        available: { sub: true, dub: false },
        embed: { sub: 'https://ani.pm/embed/8126-1' }
      }] } })
    });
  });

  await page.goto('/movie-site/#/watch/8126/1/sub/embed?title=Ani.pm%20Primary%20Test');
  await aniPmRequested;
  await expect(page.locator('.ao-player-message')).toContainText('Checking ani.pm first');
  await expect(page.locator('.ao-server-grid button')).toHaveCount(0);

  releaseAniPm();
  await expect(page.locator('.ao-server-grid button').first()).toContainText('ani.pm');
  await expect(page.locator('.ao-server-grid button').nth(1)).toContainText('VidSrc Alternative');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute('src', 'https://ani.pm/embed/8126-1');
});

test('catalogue retry reloads only the catalogue and keeps the page alive', async ({ page }) => {
  let calls = 0;
  await page.route('**/anime/home', route => {
    calls += 1;
    if (calls === 1) {
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Temporarily unavailable' }) });
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        popular: [{ id: 7411, title: { english: 'Retry Success Anime' }, format: 'TV', genres: ['Action'], isAdult: false }],
        recent: []
      })
    });
  });

  await page.goto(pagePath);
  const retry = page.getByRole('button', { name: 'Try again' });
  await expect(retry).toBeVisible();
  await retry.click();
  await expect(page.getByRole('heading', { name: 'Retry Success Anime' })).toBeVisible();
  await expect(page.locator('.ao-catalogue-error')).toHaveCount(0);
  expect(calls).toBe(2);
});

test('Smart TV browsers skip autoplaying homepage trailers', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 SMART-TV Tizen' });
    localStorage.setItem('animedex-settings', JSON.stringify({ autoplayTrailer: true, quickTags: true, accent: 'lavender' }));
  });
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      popular: [{
        id: 7412, title: { english: 'TV Safe Feature' }, format: 'TV', genres: ['Action'], isAdult: false,
        trailer: { site: 'youtube', id: 'dQw4w9WgXcQ' }
      }],
      recent: []
    })
  }));

  await page.goto(pagePath);
  await expect(page.locator('.ao-hero')).toBeVisible();
  await expect(page.locator('.ao-hero-trailer')).toHaveCount(0);
  await expect(page.locator('body')).toHaveClass(/ao-tv-mode/);
});

test('closed account dialog stays hidden and does not block the site', async ({ page }) => {
  await page.route('**/anime/search?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [
      { id: 7131, title: { english: 'Safe Overlay Test' }, genres: ['Action'], isAdult: false }
    ] })
  }));

  await page.goto(pagePath);
  const accountBackdrop = page.locator('.ao-auth-backdrop');
  await expect(accountBackdrop).toBeHidden();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(accountBackdrop).toBeVisible();
  await page.getByRole('button', { name: 'Close account dialog' }).click();
  await expect(accountBackdrop).toBeHidden();

  // The search flow must still accept a real click after the dialog closes.
  await page.locator('.ao-home-search input').fill('Safe');
  await page.locator('.ao-home-search button').click();
  await expect(page.locator('.ao-results .ao-grid .ao-tile').first()).toBeVisible();
});

test('adult and hentai titles stay out of discovery, search, and direct title pages', async ({ page }) => {
  let episodeRequests = 0;
  let dubRequests = 0;
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      popular: [
        { id: 7011, title: { english: 'Safe Home Pick' }, format: 'TV', genres: ['Action'], isAdult: false },
        { id: 7012, title: { english: 'Adult Home Pick' }, format: 'TV', genres: ['Hentai'], isAdult: true }
      ],
      recent: [{ id: 7012, title: { english: 'Adult Home Pick' }, format: 'TV', genres: ['Hentai'], isAdult: true }]
    })
  }));
  await page.route('**/anime/search?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ results: [
      { id: 7021, title: { english: 'Safe Search Pick' }, genres: ['Adventure'], isAdult: false },
      { id: 7022, title: { english: 'Hentai Search Pick' }, genres: ['Hentai'], isAdult: true }
    ] })
  }));
  await page.route('**/anime/info/7099', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 7099, title: { english: 'Blocked Adult Title' }, genres: ['Hentai'], isAdult: true, format: 'TV', episodes: 12 })
  }));
  await page.route('**/anime/episodes/7099', route => {
    episodeRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ providers: {} }) });
  });
  await page.route('**/anime/dub-finder/7099?**', route => {
    dubRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_listings', providers: [] }) });
  });

  await page.goto(pagePath);
  await expect(page.locator('.ao-tile').filter({ hasText: 'Safe Home Pick' })).toBeVisible();
  await expect(page.getByText('Adult Home Pick')).toHaveCount(0);
  await page.locator('.ao-home-search input').fill('test');
  await page.locator('.ao-home-search button').click();
  await expect(page.locator('.ao-tile').filter({ hasText: 'Safe Search Pick' })).toBeVisible();
  await expect(page.getByText('Hentai Search Pick')).toHaveCount(0);

  await page.goto('/movie-site/#/anime/7099');
  await expect(page.getByRole('heading', { name: 'Title not available' })).toBeVisible();
  expect(episodeRequests).toBe(0);
  expect(dubRequests).toBe(0);
});

test('direct watch URLs keep the adult gate ahead of the backup provider lookup', async ({ page }) => {
  let kuhiPlaybackRequests = 0;
  let anivexaRequests = 0;
  await page.route('**/anime/info/7100', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 7100, title: { english: 'Adult Direct Watch' }, isAdult: true, genres: ['Hentai'] })
  }));
  await page.route('**/anime/playback/7100?**', route => {
    kuhiPlaybackRequests += 1;
    return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ detail: 'Adult and hentai titles are excluded from AniOrbit.' }) });
  });
  await page.route('https://anivexa-api-ypbr.onrender.com/episodes/**', route => {
    anivexaRequests += 1;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/movie-site/#/watch/7100/1/sub/embed?title=Adult%20Direct%20Watch');
  await expect(page.getByText('Adult and hentai titles are excluded from AniOrbit.')).toBeVisible();
  expect(kuhiPlaybackRequests).toBe(1);
  expect(anivexaRequests).toBe(0);
});

test('VidZen TV server is imported automatically from an exact title and episode match', async ({ page }) => {
  await page.route('**/anime/info/8123', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 8123, title: { english: 'VidZen TV Test' }, isAdult: false, format: 'TV', seasonYear: 2023, genres: ['Action'] })
  }));
  await page.route('**/anime/playback/8123?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [] })
  }));
  await page.route('https://v3-cinemeta.strem.io/catalog/series/top/search=VidZen%20TV%20Test.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ metas: [{ id: 'tt4052886', imdb_id: 'tt4052886', name: 'VidZen TV Test', releaseInfo: '2023' }] })
  }));
  await page.route('https://v3-cinemeta.strem.io/meta/series/tt4052886.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ meta: { videos: [{ season: 2, episode: 5 }] } })
  }));
  await page.route('https://vidzen.fun/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>VidZen mock player</title>'
  }));

  await page.goto('/movie-site/#/watch/8123/5/sub/embed?title=VidZen%20TV%20Test');
  await expect(page.locator('.ao-server-grid')).toContainText('VidZen');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.getByRole('button', { name: /VidZen/ }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute(
    'src',
    'https://vidzen.fun/tv/tt4052886/2/5?autoPlay=true&theme=8179c2'
  );
  await page.reload();
  await expect(page.locator('.ao-server-grid')).toContainText('VidZen');
});

test('VidZen picks the season matching the anime release year when episode numbers repeat', async ({ page }) => {
  await page.route('**/anime/info/8126', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 8126, title: { english: 'Frieren: Beyond Journey\'s End' }, isAdult: false, format: 'TV', seasonYear: 2023, genres: ['Adventure'] })
  }));
  await page.route('**/anime/playback/8126?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [] })
  }));
  await page.route('https://v3-cinemeta.strem.io/catalog/series/top/search=Frieren*End.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ metas: [{ id: 'tt22248376', imdb_id: 'tt22248376', name: 'Frieren: Beyond Journey\'s End', releaseInfo: '2023' }] })
  }));
  await page.route('https://v3-cinemeta.strem.io/meta/series/tt22248376.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ meta: { videos: [
      { season: 0, episode: 1, firstAired: '2023-10-11T14:00:00.000Z' },
      { season: 1, episode: 1, firstAired: '2023-09-29T00:00:00.000Z' },
      { season: 2, episode: 1, firstAired: '2026-01-16T00:00:00.000Z' }
    ] } })
  }));
  await page.route('https://vidzen.fun/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>VidZen mock player</title>'
  }));
  await page.goto('/movie-site/#/watch/8126/1/sub/embed?title=Frieren');
  await expect(page.locator('.ao-server-grid')).toContainText('VidZen');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.getByRole('button', { name: /VidZen/ }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute(
    'src',
    'https://vidzen.fun/tv/tt22248376/1/1?autoPlay=true&theme=8179c2'
  );
});

test('VidZen movie server is imported automatically from an exact title match', async ({ page }) => {
  await page.route('**/anime/info/8124', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 8124, title: { english: 'VidZen Movie Test' }, isAdult: false, format: 'MOVIE', seasonYear: 2021, genres: ['Drama'] })
  }));
  await page.route('**/anime/playback/8124?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [] })
  }));
  await page.route('https://v3-cinemeta.strem.io/catalog/movie/top/search=VidZen%20Movie%20Test.json', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ metas: [{ id: 'tt1234567', imdb_id: 'tt1234567', name: 'VidZen Movie Test', releaseInfo: '2021' }] })
  }));
  await page.route('https://vidzen.fun/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>VidZen mock player</title>'
  }));

  await page.goto('/movie-site/#/watch/8124/1/sub/embed?title=VidZen%20Movie%20Test');
  await expect(page.locator('.ao-server-grid')).toContainText('VidZen');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.getByRole('button', { name: /VidZen/ }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute(
    'src',
    'https://vidzen.fun/movie/tt1234567?autoPlay=true&theme=8179c2'
  );
});

test('ani.pm is primary and AniEmbed is the next playback choice', async ({ page }) => {
  await page.route('**/anime/info/8125', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 8125, title: { english: 'Provider Test Anime' }, isAdult: false, format: 'TV', genres: ['Action'] })
  }));
  await page.route('**/anime/playback/8125?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [] })
  }));
  await page.route('https://ani.pm/api/partner/v1/series/8125', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { episodeList: [{
      number: 3,
      available: { sub: true, dub: false, subHard: false, dubHard: false },
      embed: { sub: 'https://ani.pm/embed/ani/8125/3/sub' }
    }] } })
  }));
  await page.route('https://aniembed.se/**', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>AniEmbed mock</title>'
  }));

  await page.goto('/movie-site/#/watch/8125/3/sub/embed?title=Provider%20Test%20Anime');
  await expect(page.locator('.ao-server-grid button').nth(0)).toContainText('ani.pm');
  await expect(page.locator('.ao-server-grid button').nth(1)).toContainText('AniEmbed');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute(
    'src',
    'https://ani.pm/embed/ani/8125/3/sub'
  );
  await page.getByRole('button', { name: /AniEmbed/ }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute(
    'src',
    'https://aniembed.se/e/8125/3?lang=sub&autoplay=1'
  );
  await page.getByRole('button', { name: /ani\.pm/ }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute(
    'src',
    'https://ani.pm/embed/ani/8125/3/sub'
  );
});

test('Cyberpunk: Edgerunners has a bundled poster fallback when catalogue artwork is missing', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      popular: [{ id: 156822, title: { english: 'Cyberpunk: Edgerunners' }, format: 'TV', seasonYear: 2022, genres: ['Action', 'Sci-Fi'], coverImage: { large: '', extraLarge: '' }, isAdult: false }],
      recent: []
    })
  }));
  await page.goto(pagePath);
  const poster = page.locator('.ao-section .ao-tile').first().locator('.ao-poster img');
  await expect(poster).toHaveAttribute('src', /\/movie-site\/images\/cyberpunk-edgerunners\.svg$/);
  await expect.poll(() => poster.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
});

test('AniOrbit boots without a blank screen and loads its catalogue assets', async ({ page }) => {
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
  await expect(page.locator('.ao-topbar')).toBeVisible();
  await expect(page.locator('.ao-home-intro')).toBeVisible();
  await expect(page.locator('.ao-home-intro-brand')).toContainText('AniOrbit');
  await expect(page.locator('.ao-home-search')).toHaveCSS('border-radius', '999px');
  await expect(page.locator('.ao-topbar .ao-search')).toBeHidden();
  await expect(page.locator('.ao-brand')).toContainText('AniOrbit');
  await expect(page.locator('.ao-brand-mark')).toHaveCount(0);
  await expect(page.locator('.ao-brand')).toHaveCSS('align-items', 'center');
  await expect(page.getByRole('heading', { name: 'Most Popular' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recently Updated' })).toBeVisible();
  await expect(page.locator('#boot-screen')).toHaveCount(0);
  await expect(page.locator('.ao-section').first().locator('.ao-tile').first()).toBeVisible();
  await expect(page.locator('.ao-section').first().locator('.ao-tile').first()).toHaveCSS('border-radius', '12px');
  await expect(page.locator('.ao-section').first().locator('.ao-poster').first()).toHaveCSS('position', 'relative');
  await expect(page.locator('.ao-section').first().locator('.ao-tile-info').first()).toHaveCSS('position', 'relative');
  await expect(page.locator('.ao-section').nth(1).locator('.ao-tile').first()).toBeVisible();
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
  await expect(page.locator('.ao-section .ao-tile').first()).toContainText('Cached Home Pick');
  await page.reload();
  await expect(page.locator('.ao-section .ao-tile').first()).toContainText('Cached Home Pick');
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
  await page.locator('.ao-quick-tags').getByRole('button', { name: 'Action' }).click();
  await expect(page.getByRole('heading', { name: 'Action', exact: true })).toBeVisible();
  await expect(page.locator('.ao-results .ao-tile')).toContainText('Action Genre Pick');
  await page.getByRole('button', { name: 'Back to Home' }).click();
  const trailer = page.locator('.ao-hero-trailer');
  await expect(trailer).toBeVisible();
  await expect(trailer).toHaveAttribute('src', /autoplay=1.*mute=1/);
  await expect(trailer).toHaveAttribute('allow', /autoplay/);
  await page.getByRole('button', { name: 'Open settings' }).click();
  await page.getByLabel('Autoplay muted trailers').uncheck();
  await page.getByLabel('Accent colour').selectOption('blue');
  await expect(page.locator('.ao-hero-trailer')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByLabel('Autoplay muted trailers')).not.toBeChecked();
  await expect(page.getByLabel('Accent colour')).toHaveValue('blue');
  await expect(page.getByLabel('Block pop-ups and full-page redirects in embeds')).toHaveCount(0);
});

test('catalogue failures show a recovery message instead of an empty or blank page', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'temporarily unavailable' })
  }));

  await page.goto(pagePath);
  await expect(page.locator('.ao-topbar')).toBeVisible();
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
  const first = page.locator('.ao-results .ao-grid .ao-tile').first();
  await expect(first).toBeVisible({ timeout: 60000 });
  await first.click();
  await expect(page.locator('.ao-detail-top')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('.ao-community')).toBeVisible();
  await expect(page.locator('.ao-community-titlebar h2')).toHaveText('Community discussion');
  await expect(page.locator('.ao-detail-copy h1')).not.toBeEmpty();
  await expect(page.locator('.ao-episode-grid a').first()).toBeVisible();
  await expect(page.locator('.ao-episode-grid a')).toHaveCount(3);
  await expect(page.locator('.ao-episodes h2')).toHaveText('Season 1 Episodes');
  await expect(page.locator('.ao-episode-grid a').first()).toContainText('S1 · EP 1');
  await expect(page.getByRole('link', { name: /Next season Test Anime Season 2/ })).toBeVisible();
  await expect(page.locator('.ao-section .ao-tile').first()).toContainText('Recommended Pick');
  expect(similarGenreRequests).toBe(0);
  expect(errors).toEqual([]);
});

test('a failed JavaScript bundle leaves a visible reload screen instead of a blank page', async ({ page }) => {
  await page.route('**/assets/*.js', route => route.abort());

  await page.goto(pagePath);
  await expect(page.locator('#boot-screen')).toBeVisible();
  await expect(page.locator('#boot-status')).toContainText('Starting AniOrbit');
  await expect(page.getByRole('button', { name: 'Reload site' })).toBeVisible({ timeout: 15000 });
});

test('poster catalogue stays usable on mobile without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pagePath);
  await expect(page.locator('.ao-brand')).toContainText('AniOrbit');
  await expect(page.locator('.ao-brand-mark')).toHaveCount(0);
  await expect(page.getByRole('searchbox', { name: 'Search Anime' })).toBeVisible();
  await expect(page.locator('.ao-tile').first()).toBeVisible({ timeout: 60000 });
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
  await page.locator('.ao-discovery-form label').nth(0).locator('select').selectOption('Action');
  await page.locator('.ao-discovery-form label').nth(1).locator('input').fill('2024');
  await page.locator('.ao-discovery-form label').nth(2).locator('select').selectOption('FALL');
  await page.locator('.ao-discovery-form label').nth(4).locator('select').selectOption('FINISHED');
  await page.locator('.ao-discovery-form label').nth(5).locator('select').selectOption('80');
  await page.locator('.ao-discovery-form label').nth(6).locator('select').selectOption('100000');
  await page.locator('.ao-discovery-form label').nth(7).locator('input').fill('Bones');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('.ao-results .ao-tile')).toHaveCount(1);
  await expect(page.locator('.ao-results .ao-tile')).toContainText('Qualified Filter Pick');
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
  await page.route('**/anime/playback/901?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Test player', url: 'https://player.example.test/embed/901/1' }] })
  }));
  await page.route('**/anime/schedule?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] })
  }));
  await page.goto(pagePath);
  await page.locator('.ao-section .ao-tile').first().click();
  await expect(page.locator('.ao-detail-top')).toBeVisible();
  await page.getByRole('button', { name: '+ Add to watchlist' }).click();
  await expect(page.getByRole('button', { name: '✓ In your watchlist' })).toBeVisible();
  await page.locator('.ao-episode-grid a').first().click();
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toBeVisible();
  await page.getByRole('button', { name: 'Mark episode as watched' }).click();
  await expect(page.getByRole('button', { name: '✓ Episode watched' })).toBeVisible();
  await page.goto(pagePath);
  await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible();
  await expect(page.locator('.ao-continue-card').first()).toContainText('Episode 2');
  await expect(page.getByRole('heading', { name: 'Picked for You' })).toBeVisible();
  await expect(page.locator('.ao-recommendations .ao-tile').first()).toContainText('Because You Watched This');
  await expect(page.getByRole('heading', { name: 'My Watchlist' })).toBeVisible();
  await expect(page.locator('.ao-my-list .ao-tile')).toContainText('Progress Test Anime');
});


test('watch page offers previous/skip episode controls and reports intro support honestly for embeds', async ({ page }) => {
  await page.route('**/anime/playback/101?episode=2**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Test embed', url: 'https://player.example/embed/101/2' }] })
  }));
  await page.route('https://api.aniskip.com/v2/skip-times/9001/2?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ found: true, results: [{ skipType: 'op', interval: { start: 90, end: 180 } }] })
  }));
  await page.goto('/movie-site/#/watch/101/2/sub/embed?mal=9001&title=Skip%20Test');
  await expect(page.getByRole('heading', { name: 'Skip Test - Episode 2' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-community-titlebar h2')).toHaveText('Episode discussion');
  await expect(page.getByRole('button', { name: /Previous episode/ }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: /Skip episode/ })).toBeVisible();
  await expect(page.getByText('Opening detected: 1:30–3:00')).toBeVisible();
  await expect(page.getByText(/external embedded player that does not expose seeking controls/i)).toBeVisible();
  await page.getByLabel('Auto-skip intro and outro').uncheck();
  await expect(page.getByLabel('Auto-skip intro and outro')).not.toBeChecked();
});

test('watch page gracefully handles missing AniSkip metadata and preserves episode navigation', async ({ page }) => {
  await page.route('**/anime/playback/101?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Test embed', url: 'https://player.example/embed/101/1' }] })
  }));
  await page.route('https://api.aniskip.com/v2/skip-times/9001/1?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ found: false, results: [] })
  }));
  await page.goto('/movie-site/#/watch/101/1/sub/embed?mal=9001&title=Skip%20Test');
  await expect(page.getByRole('button', { name: /Previous episode/ }).first()).toBeDisabled();
  await expect(page.getByRole('button', { name: /Skip episode/ })).toBeVisible();
  await expect(page.getByText('No verified opening timestamps were found for this episode.')).toBeVisible();
});


test('direct video player automatically jumps over a verified opening when auto-skip is enabled', async ({ page }) => {
  await page.route('**/anime/playback/202?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Direct video', url: 'https://media.example/episode.mp4', type: 'video/mp4' }] })
  }));
  await page.route('https://media.example/episode.mp4', route => route.fulfill({
    status: 200, contentType: 'video/mp4', body: Buffer.from([])
  }));
  await page.route('https://api.aniskip.com/v2/skip-times/9202/1?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ found: true, results: [{ skipType: 'op', interval: { start: 90, end: 180 } }] })
  }));
  await page.goto('/movie-site/#/watch/202/1/sub/embed?mal=9202&title=Direct%20Skip%20Test');
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'Direct video' }).click();
  const video = page.locator('.ao-direct-player video');
  await expect(video).toBeVisible();
  await expect(page.getByText('Opening detected: 1:30–3:00')).toBeVisible();
  await page.evaluate(() => {
    const element = document.querySelector('.ao-direct-player video');
    Object.defineProperty(element, 'currentTime', { configurable: true, writable: true, value: 100 });
    element.dispatchEvent(new Event('timeupdate', { bubbles: true }));
  });
  await expect.poll(() => page.locator('.ao-direct-player video').evaluate(element => element.currentTime)).toBe(180);
});

test('Continue Watching repairs stale posters from the catalogue and can dismiss entries', async ({ page }) => {
  const brokenUrl = 'https://images.example.test/cyberpunk-old.jpg';
  const freshUrl = 'https://images.example.test/cyberpunk-current.png';
  const savedAnime = {
    id: 156822,
    title: { english: 'Cyberpunk: Edgerunners', romaji: 'Cyberpunk: Edgerunners' },
    coverImage: { large: brokenUrl, extraLarge: brokenUrl },
    format: 'TV',
    seasonYear: 2022,
    genres: ['Action', 'Sci-Fi'],
    lastEpisode: 4,
    audio: 'sub',
    recommendations: []
  };

  await page.addInitScript(library => {
    localStorage.setItem('animedex-library-v1', JSON.stringify({
      watchlist: [library],
      history: [library],
      watchedEpisodes: {},
      notifiedEpisodes: []
    }));
  }, savedAnime);

  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ popular: [], recent: [] })
  }));
  await page.route('**/anime/info/156822', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      id: 156822,
      title: { english: 'Cyberpunk: Edgerunners', romaji: 'Cyberpunk: Edgerunners' },
      coverImage: { large: freshUrl, extraLarge: freshUrl },
      format: 'TV',
      seasonYear: 2022,
      genres: ['Action', 'Sci-Fi']
    })
  }));
  await page.route(brokenUrl, route => route.fulfill({ status: 404, body: 'not found' }));
  await page.route(freshUrl, route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/S2cAAAAASUVORK5CYII=', 'base64')
  }));

  await page.goto(pagePath);
  const card = page.locator('.ao-continue-card').filter({ hasText: 'Cyberpunk: Edgerunners' });
  await expect(page.getByRole('heading', { name: 'Continue Watching' })).toBeVisible();
  await expect(card.locator('img')).toHaveAttribute('src', freshUrl);
  await expect.poll(() => card.locator('img').evaluate(img => img.naturalWidth)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.history?.[0]?.coverImage?.large || '';
  })).toBe(freshUrl);

  await card.getByRole('button', { name: 'Remove Cyberpunk: Edgerunners from Continue Watching' }).click();
  await expect(page.getByRole('heading', { name: 'Continue Watching' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'My Watchlist' })).toBeVisible();
  await expect(page.locator('.ao-my-list .ao-tile')).toContainText('Cyberpunk: Edgerunners');
});


test('custom anime lists can be created and filled from an anime page', async ({ page }) => {
  await page.goto('/movie-site/#/lists');
  await expect(page.getByRole('heading', { name: 'Custom anime lists' })).toBeVisible();
  await page.getByLabel('List name').fill('Favourites');
  await page.getByLabel(/Description/).fill('Shows I want to keep close');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page.getByRole('heading', { name: 'Favourites' })).toBeVisible();

  await page.route('**/anime/info/1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 1, idMal: 1, title: { english: 'List Test Anime', romaji: 'List Test Anime' },
      coverImage: { large: '', extraLarge: '' }, format: 'TV', seasonYear: 2025,
      status: 'FINISHED', episodes: 2, genres: ['Adventure']
    })
  }));
  await page.route('**/anime/episodes/1', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: { anineko: { episodes: { sub: [{ number: 1 }, { number: 2 }], dub: [] } } } })
  }));
  await page.route('**/anime/dub-finder/1?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_listings', providers: [] })
  }));

  await page.goto('/movie-site/#/anime/1');
  await expect(page.locator('.ao-detail-top')).toBeVisible();
  await page.locator('#ao-add-to-list').selectOption({ label: 'Favourites' });
  await page.getByRole('button', { name: '+ Add to list' }).click();
  await expect(page.getByRole('button', { name: '✓ In this list' })).toBeVisible();
  await page.goto('/movie-site/#/lists');
  await expect(page.locator('.ao-custom-list-card').filter({ hasText: 'Favourites' })).toContainText('List Test Anime');
});

test('release schedule displays upcoming catalogue episodes and supports date filters', async ({ page }) => {
  const now = Math.floor(Date.now() / 1000);
  await page.route('**/anime/schedule?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      results: [
        { id: 701, title: { english: 'Schedule Test Show' }, coverImage: { large: '' }, next_episode: 5, airingAt: now + 3600 },
        { id: 702, title: { english: 'Schedule Later Show' }, coverImage: { large: '' }, next_episode: 2, airingAt: now + 9 * 24 * 3600 },
        { id: 703, title: { english: 'Adult Schedule Show' }, coverImage: { large: '' }, next_episode: 1, airingAt: now + 7200, isAdult: true, genres: ['Hentai'] }
      ]
    })
  }));
  await page.goto('/movie-site/#/schedule');
  await expect(page.getByRole('heading', { name: 'Upcoming episodes' })).toBeVisible();
  await expect(page.getByText('Schedule Test Show')).toBeVisible();
  await expect(page.getByText('Adult Schedule Show')).toHaveCount(0);
  await expect(page.getByText('Episode 5')).toBeVisible();
  await page.getByRole('button', { name: 'Today' }).click();
  await expect(page.getByText('Schedule Test Show')).toBeVisible();
  await expect(page.getByText('Schedule Later Show')).toHaveCount(0);
});

test('anime detail pages use the saved default audio preference for episode links', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('animedex-settings', JSON.stringify({ defaultAudio: 'dub' }));
  });
  await page.route('**/anime/info/1', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      id: 1, idMal: 1, title: { english: 'Audio Preference Test' },
      coverImage: { large: '' }, format: 'TV', episodes: 1, genres: []
    })
  }));
  await page.route('**/anime/episodes/1', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: { anineko: { episodes: { sub: [{ number: 1 }], dub: [] } } } })
  }));
  await page.route('**/anime/dub-finder/1?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_listings', providers: [] })
  }));
  await page.goto('/movie-site/#/anime/1');
  await expect(page.locator('.ao-detail-top')).toBeVisible();
  await expect(page.locator('.ao-detail-copy a.ao-watch')).toHaveAttribute('href', /\/watch\/1\/1\/dub\/embed/);
  await expect(page.locator('.ao-episode-grid a').first()).toHaveAttribute('href', /\/watch\/1\/1\/dub\/embed/);
});


test('watch page prioritizes AniEmbed and keeps broken API embeds hidden', async ({ page }) => {
  await page.route('**/anime/playback/4242?episode=7**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'AnimeEmbed', provider: 'animeembed', url: 'https://animeembed.com/embed/ani/4242/7?track=sub' },
      { name: 'AniEmbed', provider: 'aniembed', url: 'https://aniembed.se/e/4242/7?lang=sub' },
      { name: 'Vidy', provider: 'vidy', url: 'https://www.vidy.st/anime/4242/7?color=9b87ff' },
      { name: 'Aanikoto API', provider: 'anikoto-api', url: 'https://anikototv.to/embed/4242/7' },
      { name: 'VidSrc', url: 'https://vidsrc.mov/embed/tv/5/2/7' },
      { name: 'VidLink', url: 'https://vidlink.pro/tv/5/2/7' },
      { name: '2Embed', url: 'https://www.2embed.cc/embedtv/5&s=2&e=7' },
      { name: 'VidCore', url: 'https://vidcore.org/embed/tv/5/2/7' }
    ] })
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/episodes/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      reanime: { episodes: { sub: [{ id: 'watch/reanime/4242/sub/reanime-7', number: 7 }], dub: [] } }
    })
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/watch/reanime/4242/sub/reanime-7', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ streams: [{ url: 'https://streams.example.test/aot-7.m3u8', type: 'hls', server: 'ReAnime' }] })
  }));
  await page.route('https://api.aniskip.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ found: false, results: [] })
  }));
  await page.goto('/movie-site/#/watch/4242/7/sub/embed?title=Player%20Safety%20Test');
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  await expect(page.locator('.ao-player iframe')).toHaveCount(0);
  await expect(page.locator('.ao-server-grid button')).toHaveCount(6);
  await expect(page.locator('.ao-server-grid button').nth(0)).toContainText('AniEmbed');
  await expect(page.locator('.ao-server-grid button').nth(1)).toContainText('VidSrc');
  await expect(page.locator('.ao-server-grid button').nth(2)).toContainText('VidLink');
  await expect(page.locator('.ao-server-grid button').nth(3)).toContainText('2Embed');
  await expect(page.locator('.ao-server-grid button').nth(4)).toContainText('Anivexa');
  await expect(page.locator('.ao-server-grid button').nth(5)).toContainText('VidCore');
  await expect(page.locator('.ao-server-grid')).not.toContainText('AnimeEmbed');
  await expect(page.locator('.ao-server-grid button').nth(4)).toContainText('ReAnime');
  await expect(page.locator('.ao-server-more')).toContainText('Vidy');
  await page.getByLabel('Do not show this warning again').check();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  const frame = page.locator('.ao-player iframe');
  await expect(frame).toBeVisible();
  await expect(frame).not.toHaveAttribute('sandbox');
  await expect(frame).toHaveAttribute('src', 'https://aniembed.se/e/4242/7?lang=sub&autoplay=1');
  await page.getByRole('button', { name: /VidLink/ }).click();
  await expect(frame).toHaveAttribute('src', /vidlink\.pro\/tv\/5\/2\/7/);
  await page.getByRole('button', { name: /2Embed/ }).click();
  await expect(frame).toHaveAttribute('src', /2embed\.cc\/embedtv\/5&s=2&e=7/);
  await expect(page.locator('.ao-ao-warning')).toHaveCount(0);
});

test('Anivexa is a playback fallback when Kuhi fails', async ({ page }) => {
  await page.route('**/anime/playback/99001?episode=1**', route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ detail: 'Kuhi unavailable' })
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/episodes/**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      reanime: { episodes: { sub: [{ id: 'watch/reanime/99001/sub/reanime-1', number: 1 }], dub: [] } }
    })
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/watch/reanime/99001/sub/reanime-1', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ stream_url: 'https://streams.example.test/fallback.m3u8', streams: [] })
  }));
  await page.goto('/movie-site/#/watch/99001/1/sub/embed?title=Anivexa%20Fallback');
  await expect(page.locator('.ao-server-grid button').first()).toContainText('AniEmbed');
  await expect(page.locator('.ao-server-grid button').filter({ hasText: 'Anivexa' })).toBeVisible();
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.getByRole('button', { name: /Anivexa/ }).click();
  await expect(page.locator('.ao-direct-player video')).toBeVisible();
  await expect(page.locator('.ao-player iframe')).toHaveCount(0);
});

test('site visits warm both APIs once per 5-minute window', async ({ page }) => {
  let kuhiPings = 0;
  let anivexaPings = 0;
  await page.route('https://anime-api-jqpp.onrender.com/docs', route => {
    kuhiPings += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>docs</title>' });
  });
  await page.route('https://anivexa-api-ypbr.onrender.com/', route => {
    anivexaPings += 1;
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Anivexa</title>' });
  });
  await page.goto(pagePath);
  await expect.poll(() => kuhiPings).toBe(1);
  await expect.poll(() => anivexaPings).toBe(1);
  await page.reload();
  await page.waitForTimeout(100);
  expect(kuhiPings).toBe(1);
  expect(anivexaPings).toBe(1);
  await page.evaluate(() => localStorage.setItem('aniorbit-api-warmup-v1', String(Date.now() - 6 * 60 * 1000)));
  await page.reload();
  await expect.poll(() => kuhiPings).toBe(2);
  await expect.poll(() => anivexaPings).toBe(2);
});
test('switching servers after acknowledging the player warning does not reopen it', async ({ page }) => {
  await page.route('**/anime/playback/4243?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'AniEmbed', provider: 'aniembed', url: 'https://aniembed.se/e/4243/1?lang=sub' },
      { name: 'Vidy', provider: 'vidy', url: 'https://www.vidy.st/anime/4243/1?color=9b87ff' }
    ] })
  }));
  await page.route('https://api.aniskip.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ found: false, results: [] })
  }));
  await page.goto('/movie-site/#/watch/4243/1/sub/embed?title=Warning%20Repeat%20Test');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toBeVisible();
  await page.getByRole('button', { name: 'Vidy' }).click();
  await expect(page.locator('.ao-ao-warning')).toHaveCount(0);
  await expect(page.locator('.ao-player iframe')).toHaveAttribute('src', /vidy\.st\/anime\/4243\/1/);
});


test('anime tracking status is saved and can be managed from the tracking page', async ({ page }) => {
  await page.route('**/anime/episodes/1', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: { test: { episodes: { sub: [{ number: 1 }, { number: 2 }], dub: [] } } } })
  }));
  await page.route('**/anime/dub-finder/1?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'no_listings', providers: [] })
  }));

  await page.goto('/movie-site/#/anime/1');
  await expect(page.getByLabel('My anime status')).toBeVisible();
  await page.getByLabel('My anime status').selectOption('Watching');
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.tracking?.['1']?.status || '';
  })).toBe('Watching');

  await page.goto('/movie-site/#/tracking');
  await expect(page.getByRole('heading', { name: 'Anime tracking' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Safe Test Anime' })).toBeVisible();
  await expect(page.getByLabel('Status for Safe Test Anime')).toHaveValue('Watching');
  await page.getByLabel('Status for Safe Test Anime').selectOption('Completed');
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.tracking?.['1']?.status || '';
  })).toBe('Completed');
});

test('embedded player saves an explicitly manual checkpoint without claiming automatic progress', async ({ page }) => {
  await page.route('**/anime/playback/8080?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Checkpoint Embed', provider: 'test-embed', url: 'https://embed.example.test/8080/1' }] })
  }));
  await page.goto('/movie-site/#/watch/8080/1/sub/embed?title=Checkpoint%20Test');
  await expect(page.getByRole('heading', { name: /Checkpoint Test - Episode 1/ })).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Manual embedded playback checkpoint' })).toBeVisible();
  await page.getByLabel('Manual episode progress').fill('45');
  await page.getByRole('button', { name: 'Save checkpoint' }).click();
  await expect(page.getByText(/Checkpoint saved on this device/)).toBeVisible();
  await expect(page.getByText(/45% saved on this device · manual embed checkpoint/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.episodeProgress?.['8080:1:sub']?.percent || 0;
  })).toBe(45);
  expect(await page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.episodeProgress?.['8080:1:sub']?.manual;
  })).toBe(true);
});

test('direct video playback automatically stores its current progress', async ({ page }) => {
  await page.route('**/anime/playback/8081?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Direct video', type: 'video/mp4', url: 'https://media.example.test/episode.mp4' }] })
  }));
  await page.route('https://media.example.test/episode.mp4', route => route.fulfill({
    status: 200, contentType: 'video/mp4', body: Buffer.from([])
  }));
  await page.goto('/movie-site/#/watch/8081/1/sub/embed?title=Progress%20Test');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'Direct video' }).click();
  const video = page.locator('.ao-direct-player video');
  await expect(video).toBeVisible();
  await page.evaluate(() => {
    const element = document.querySelector('.ao-direct-player video');
    Object.defineProperty(element, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(element, 'currentTime', { configurable: true, writable: true, value: 37 });
    element.dispatchEvent(new Event('timeupdate', { bubbles: true }));
  });
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return Math.round(library.episodeProgress?.['8081:1:sub']?.percent || 0);
  })).toBe(37);
  await expect(page.getByText(/37% saved on this device · automatic video progress/)).toBeVisible();
});

test('hide watched preference filters the episode list and persists', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('animedex-library-v1', JSON.stringify({
      watchlist: [], history: [], watchedEpisodes: { '8082': [1, 2] }, notifiedEpisodes: [], tracking: {}, episodeProgress: {}
    }));
  });
  await page.route('**/anime/info/8082', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ id: 8082, title: { english: 'Hide Watched Test' }, episodes: 3, format: 'TV', genres: ['Action'], coverImage: { large: '' } })
  }));
  await page.route('**/anime/episodes/8082', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ providers: { test: { episodes: { sub: [{ number: 1 }, { number: 2 }, { number: 3 }], dub: [] } } } })
  }));
  await page.route('**/anime/dub-finder/8082?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ status: 'no_listings', providers: [] })
  }));
  await page.goto('/movie-site/#/anime/8082');
  await expect(page.locator('.ao-episode-grid a')).toHaveCount(3);
  await page.getByRole('checkbox', { name: 'Hide watched' }).check();
  await expect(page.locator('.ao-episode-grid a')).toHaveCount(1);
  await expect(page.locator('.ao-episode-grid a').first()).toContainText('EP 3');
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Hide watched' })).toBeChecked();
  await expect(page.locator('.ao-episode-grid a')).toHaveCount(1);
});


test('direct video detects and offers a verified ending skip', async ({ page }) => {
  await page.route('**/anime/playback/9002?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Direct video', type: 'video/mp4', url: 'https://media.example.test/ending.mp4' }] })
  }));
  await page.route('https://media.example.test/ending.mp4', route => route.fulfill({
    status: 200, contentType: 'video/mp4', body: Buffer.from([])
  }));
  await page.route('https://api.aniskip.com/v2/skip-times/9002/1?**', route => {
    const requestUrl = new URL(route.request().url());
    const type = requestUrl.searchParams.get('types[]');
    const results = type === 'ed'
      ? [{ skipType: 'ed', interval: { start: 300, end: 320 } }]
      : [];
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ found: results.length > 0, results })
    });
  });

  await page.addInitScript(() => localStorage.setItem('animedex-auto-skip-intro', 'false'));
  await page.goto('/movie-site/#/watch/9002/1/sub/embed?mal=9002&title=Ending%20Skip%20Test');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'Direct video' }).click();
  const video = page.locator('.ao-direct-player video');
  await expect(video).toBeVisible();
  await page.evaluate(() => {
    const element = document.querySelector('.ao-direct-player video');
    Object.defineProperty(element, 'currentTime', { configurable: true, writable: true, value: 300 });
    element.dispatchEvent(new Event('timeupdate', { bubbles: true }));
  });
  await expect(page.getByRole('button', { name: /Skip outro · 5:00–5:20/ })).toBeVisible();
  await page.getByRole('button', { name: /Skip outro/ }).click();
  await expect.poll(() => video.evaluate(element => element.currentTime)).toBe(320);
});


test('preferred playback server is remembered but an unreliable report takes priority', async ({ page }) => {
  await page.route('**/anime/playback/9100?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'VidSrc', provider: 'vidsrc', url: 'https://vidsrc.example.test/9100/1' },
      { name: 'VidLink', provider: 'vidlink', url: 'https://vidlink.example.test/9100/1' }
    ] })
  }));
  await page.goto('/movie-site/#/watch/9100/1/sub/embed?title=Server%20Preference%20Test');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'VidLink' }).click();
  await expect(page.locator('.ao-ao-warning')).toHaveCount(0);
  await expect(page.locator('.ao-player iframe')).toHaveAttribute('src', /vidlink\.example\.test/);
  await page.getByRole('button', { name: 'Use as preferred server' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aniorbit-preferred-servers-v1') || '{}').sub)).toBe('vidlink');

  await page.reload();
  await expect(page.locator('.ao-server-grid button.active')).toContainText('VidLink');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.getByRole('button', { name: 'Mark as not working' }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('aniorbit-unreliable-servers-v1') || '[]'))).toContain('vidlink');

  await page.reload();
  await expect(page.locator('.ao-server-grid button.active')).toContainText('AniEmbed');
});

test('direct video auto-next advances to the next episode when enabled', async ({ page }) => {
  await page.route('**/anime/playback/9101?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Direct video', type: 'video/mp4', url: 'https://media.example.test/auto-next-1.mp4' }] })
  }));
  await page.route('**/anime/playback/9101?episode=2**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [{ name: 'Direct video', type: 'video/mp4', url: 'https://media.example.test/auto-next-2.mp4' }] })
  }));
  await page.route('https://media.example.test/auto-next-*.mp4', route => route.fulfill({
    status: 200, contentType: 'video/mp4', body: Buffer.from([])
  }));
  await page.goto('/movie-site/#/watch/9101/1/sub/embed?title=Auto%20Next%20Test');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'Direct video' }).click();
  const video = page.locator('.ao-direct-player video');
  await expect(video).toBeVisible();
  await page.evaluate(() => {
    const element = document.querySelector('.ao-direct-player video');
    Object.defineProperty(element, 'duration', { configurable: true, value: 100 });
    Object.defineProperty(element, 'currentTime', { configurable: true, writable: true, value: 100 });
    element.dispatchEvent(new Event('ended', { bubbles: true }));
  });
  await expect(page).toHaveURL(/#\/watch\/9101\/2\/sub\/embed/);
  await expect(page.getByRole('heading', { name: 'Auto Next Test - Episode 2' })).toBeVisible();
});


test('anime detail page loads and locally searches characters and voice actors', async ({ page }) => {
  await page.route('**/anime/episodes/8084', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ providers: {} })
  }));
  await page.route('**/anime/dub-finder/8084?**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_listings', providers: [] })
  }));
  await page.route('**/anime/anime/8084/characters?**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ characters: [
      {
        role: 'MAIN',
        node: { id: 51, name: { full: 'Mina Ashido' }, image: { large: 'https://images.example.test/mina.jpg' } },
        voiceActors: [{ id: 52, name: { full: 'Megumi Hayashibara' }, languageV2: 'Japanese' }]
      },
      {
        role: 'SUPPORTING',
        node: { id: 53, name: { full: 'Kirishima Eijiro' }, image: {} },
        voiceActors: [{ id: 54, name: { full: 'Toshiki Masuda' }, languageV2: 'Japanese' }]
      }
    ] })
  }));

  await page.goto('/movie-site/#/anime/8084');
  await expect(page.getByRole('heading', { name: 'Characters & voice actors' })).toBeVisible();
  await expect(page.locator('.ao-character-card')).toHaveCount(2);
  await expect(page.locator('.ao-character-card').first()).toContainText('Mina Ashido');
  await expect(page.locator('.ao-character-card').first()).toContainText('Megumi Hayashibara');
  await page.getByLabel('Search characters and voice actors').fill('Megumi Hayashibara');
  await expect(page.locator('.ao-character-card')).toHaveCount(1);
  await expect(page.locator('.ao-character-card').first()).toContainText('Mina Ashido');
  await page.getByLabel('Search characters and voice actors').fill('Nobody Here');
  await expect(page.getByText(/No characters or voice actors match/)).toBeVisible();
});


test('data saver disables autoplay trailers and stays enabled after refresh', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      popular: [{
        id: 88101, title: { english: 'Data Saver Trailer Test' }, format: 'TV',
        coverImage: { large: '' }, trailer: { id: 'abcDEF12345', site: 'youtube' }
      }],
      recent: []
    })
  }));

  await page.goto(pagePath);
  await expect(page.locator('.ao-hero-trailer')).toBeVisible();
  await page.getByRole('button', { name: 'Open settings' }).click();
  const dataSaver = page.getByLabel('Reduce data use (disable autoplay trailers and heavy effects)');
  await dataSaver.check();
  await expect(page.locator('.ao-hero-trailer')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('data-data-saver', 'true');

  await page.reload();
  await page.getByRole('button', { name: 'Open settings' }).click();
  await expect(page.getByLabel('Reduce data use (disable autoplay trailers and heavy effects)')).toBeChecked();
  await expect(page.locator('.ao-hero-trailer')).toHaveCount(0);
});

test('direct playback automatically tries another healthy direct server after a media error', async ({ page }) => {
  await page.route('**/anime/playback/88102?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'Primary Direct', provider: 'direct-primary', type: 'video/mp4', url: 'https://streams.example.test/failing.mp4' },
      { name: 'Backup Direct', provider: 'direct-backup', type: 'video/mp4', url: 'https://streams.example.test/backup.mp4' }
    ] })
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/episodes/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({})
  }));
  await page.route('https://api.aniskip.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ found: false, results: [] })
  }));
  await page.route('https://streams.example.test/failing.mp4', route => route.abort());
  await page.route('https://streams.example.test/backup.mp4', route => route.fulfill({
    status: 200, contentType: 'video/mp4', body: ''
  }));

  await page.goto('/movie-site/#/watch/88102/1/sub/embed?title=Automatic%20Server%20Recovery');
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'Primary Direct' }).click();

  const video = page.locator('.ao-direct-player video');
  await expect(video).toHaveAttribute('src', /backup\.mp4/);
  await expect(page.locator('.ao-server-grid button.active')).toContainText('Backup Direct');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aniorbit-unreliable-servers-v1') || '[]')))
    .toContain('direct-primary');
});

test('watch page server controls fit a narrow mobile screen without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/anime/playback/88103?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'Mobile Server One', provider: 'mobile-one', url: 'https://player.example.test/one' },
      { name: 'Mobile Server Two', provider: 'mobile-two', url: 'https://player.example.test/two' }
    ] })
  }));
  await page.route('https://anivexa-api-ypbr.onrender.com/episodes/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({})
  }));
  await page.route('https://api.aniskip.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ found: false, results: [] })
  }));

  await page.goto('/movie-site/#/watch/88103/1/sub/embed?title=Mobile%20Layout');
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const columns = await page.locator('.ao-server-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
});


test('fully watched series are removed from Continue Watching automatically', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ popular: [], recent: [] })
  }));

  await page.goto(pagePath);
  await page.evaluate(() => {
    const library = {
      watchlist: [],
      history: [{
        id: 88104,
        title: { english: 'Finished Series Test' },
        episodes: 3,
        lastEpisode: 3,
        audio: 'sub'
      }],
      watchedEpisodes: { '88104': [1, 2, 3] },
      notifiedEpisodes: [],
      tracking: {},
      episodeProgress: {}
    };
    localStorage.setItem('animedex-library-v1', JSON.stringify(library));
  });
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Continue Watching' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Recently Viewed' })).toBeVisible();
});


test('statistics and yearly recap render from the existing local library without changing saved data', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const year = now.getFullYear();
    localStorage.setItem('animedex-library-v1', JSON.stringify({
      watchlist: [
        { id: 99101, title: { english: 'Saved Anime' }, genres: ['Action'] },
        { id: 99102, title: { english: 'Another Saved Anime' }, genres: ['Comedy'] }
      ],
      history: [{ id: 99101, title: { english: 'Saved Anime' }, genres: ['Action', 'Drama'], viewedAt: new Date(year, 2, 12).getTime() }],
      watchedEpisodes: { '99101': [1, 2], '99102': [1] },
      tracking: { '99101': { status: 'Watching', anime: { id: 99101 } } }
    }));
    localStorage.setItem('aniorbit-custom-lists-v1', JSON.stringify([{ id: 'test-list', name: 'Favourites', items: [] }]));
  });
  await page.goto('/movie-site/#/stats');
  await expect(page.getByRole('heading', { name: 'Statistics & yearly recap' })).toBeVisible();
  await expect(page.getByText('Episodes marked watched', { exact: true })).toBeVisible();
  await expect(page.locator('.ao-stats-grid')).toContainText('3');
  await expect(page.getByRole('heading', { name: 'Top genres in recent history' })).toBeVisible();
  await expect(page.locator('.ao-genre-ranking')).toContainText('Action');
  await expect(page.getByRole('heading', { name: 'Most episodes marked watched' })).toBeVisible();
  await expect(page.locator('.ao-stats-columns > .ao-stats-panel').nth(1).locator('.ao-stats-anime')).toContainText('Another Saved Anime');
  await expect(page.getByRole('heading', { name: 'Achievements' })).toBeVisible();
  await expect(page.locator('.ao-achievement-card.unlocked')).toContainText('First episode');
  await expect(page.getByText(/Monthly activity uses the dates stored/)).toBeVisible();
});


test('shared collections page explains sign-in requirement to guests', async ({ page }) => {
  await page.goto('/movie-site/#/shared-lists');
  await expect(page.getByRole('heading', { name: 'Shared collections' })).toBeVisible();
  await expect(page.getByText(/Sign in to create, view and manage shared anime collections/)).toBeVisible();
});


test('starts the main playback lookup while anime maturity verification is still running', async ({ page }) => {
  let metadataResolved = false;
  let playbackStartedBeforeMetadata = false;
  await page.route('**/anime/info/7310', async route => {
    await new Promise(resolve => setTimeout(resolve, 800));
    metadataResolved = true;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ id: 7310, isAdult: false, genres: ['Action'], title: { english: 'Parallel Playback Test' } })
    });
  });
  await page.route('**/anime/playback/7310?episode=1**', route => {
    playbackStartedBeforeMetadata = !metadataResolved;
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sources: [{ name: 'Fast test server', url: 'https://player.example.test/parallel/7310' }] })
    });
  });
  await page.goto('/movie-site/#/watch/7310/1/sub/embed?title=Parallel%20Playback%20Test');
  await expect(page.locator('.ao-ao-warning')).toBeVisible();
  expect(playbackStartedBeforeMetadata).toBe(true);
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await expect(page.locator('.ao-player iframe')).toBeVisible();
});

test('offers a quick next-server action after 15 seconds when an embedded player keeps loading', async ({ page }) => {
  await page.route('**/anime/playback/7311?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ sources: [
      { name: 'Slow embed', url: 'https://player.example.test/slow/7311' },
      { name: 'Backup embed', url: 'https://player.example.test/backup/7311' }
    ] })
  }));
  await page.route('https://api.aniskip.com/**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ found: false, results: [] })
  }));
  await page.goto('/movie-site/#/watch/7311/1/sub/embed?title=Slow%20Embed%20Test');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  await page.locator('.ao-server-grid button').filter({ hasText: 'Slow embed' }).click();
  await expect(page.locator('.ao-player iframe')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try next server' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Try next server' }).click();
  await expect(page.locator('.ao-player iframe')).toHaveAttribute('src', 'https://player.example.test/backup/7311');
});



test('ani.pm next-episode message updates AniOrbit route and watch history', async ({ page }) => {
  await page.route('https://ani.pm/api/partner/v1/series/99003', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ data: { episodeList: [
      { number: 1, available: { sub: true }, embed: { sub: 'https://ani.pm/embed/99003-1' } },
      { number: 2, available: { sub: true }, embed: { sub: 'https://ani.pm/embed/99003-2' } }
    ] } })
  }));
  await page.route('https://ani.pm/embed/99003-1', route => route.fulfill({
    status: 200, contentType: 'text/html',
    body: '<!doctype html><button id="next">Ani.pm next episode</button><script>document.getElementById("next").addEventListener("click",()=>parent.postMessage({type:"nextEpisode",episode:2},"*"));</script>'
  }));
  await page.route('https://ani.pm/embed/99003-2', route => route.fulfill({
    status: 200, contentType: 'text/html', body: '<!doctype html><title>Episode 2</title>'
  }));
  await page.route('**/anime/playback/99003?episode=1**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ sources: [] })
  }));

  await page.goto('/movie-site/#/watch/99003/1/sub/embed?title=Ani.pm%20Next%20Sync');
  await page.getByRole('button', { name: 'Continue to video' }).click();
  const player = page.frameLocator('.ao-player iframe');
  await expect(player.getByRole('button', { name: 'Ani.pm next episode' })).toBeVisible();
  await player.getByRole('button', { name: 'Ani.pm next episode' }).click();

  await expect(page).toHaveURL(/#\/watch\/99003\/2\/sub\/embed/);
  await expect(page.getByRole('heading', { name: 'Ani.pm Next Sync - Episode 2' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.watchedEpisodes?.['99003'] || [];
  })).toContain(1);
  await expect.poll(() => page.evaluate(() => {
    const library = JSON.parse(localStorage.getItem('animedex-library-v1') || '{}');
    return library.history?.find(item => String(item.id) === '99003')?.lastEpisode;
  })).toBe(2);
});


test('OLED TV layout uses the available landscape screen for the player', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      popular: [{ id: 99011, title: { english: 'OLED TV Layout Check' }, format: 'TV', genres: ['Action'], coverImage: { large: '' } }],
      recent: []
    })
  }));
  await page.goto(pagePath);
  await expect(page.locator('.ao-tile').first()).toBeVisible();

  const dimensions = await page.evaluate(() => {
    const watch = document.createElement('main');
    watch.className = 'ao-watch-page';
    watch.innerHTML = '<h1>Screen size test</h1><div class="ao-player"><video></video></div>';
    document.body.appendChild(watch);
    const watchRect = watch.getBoundingClientRect();
    const playerRect = watch.querySelector('.ao-player').getBoundingClientRect();
    return {
      watchWidth: watchRect.width,
      playerWidth: playerRect.width,
      playerHeight: playerRect.height,
      playerRatio: playerRect.width / playerRect.height
    };
  });
  expect(dimensions.watchWidth).toBeGreaterThan(1800);
  expect(dimensions.playerWidth).toBeGreaterThan(1500);
  expect(dimensions.playerRatio).toBeCloseTo(16 / 9, 1);
});

test('TV remote arrow keys move the visible focus between anime cards', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      popular: [
        { id: 99021, title: { english: 'TV Remote First' }, format: 'TV', genres: ['Action'], coverImage: { large: '' } },
        { id: 99022, title: { english: 'TV Remote Second' }, format: 'TV', genres: ['Comedy'], coverImage: { large: '' } },
        { id: 99023, title: { english: 'TV Remote Third' }, format: 'TV', genres: ['Drama'], coverImage: { large: '' } }
      ],
      recent: []
    })
  }));
  await page.goto(pagePath);
  const cards = page.locator('.ao-grid .ao-tile');
  await expect(cards.first()).toBeVisible();
  await cards.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(1)).toBeFocused();
  await expect(cards.nth(1)).toHaveClass(/ao-tv-focus/);
  await page.keyboard.press('ArrowRight');
  await expect(cards.nth(2)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(cards.nth(1)).toBeFocused();
});


test('Firefly Wedding is no longer added as a dedicated homepage row', async ({ page }) => {
  let fireflySearchRequests = 0;
  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ popular: [], recent: [] })
  }));
  await page.route('**/anime/search?**', route => {
    const query = new URL(route.request().url()).searchParams.get('query') || '';
    if (/firefly wedding|hotaru no yomeiri/i.test(query)) {
      fireflySearchRequests += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }) });
    }
    return route.continue();
  });

  await page.goto(pagePath);
  await expect(page.locator('.ao-firefly-wedding')).toHaveCount(0);
  await expect(page.locator('.ao-tile').filter({ hasText: 'Firefly Wedding' })).toHaveCount(0);
  expect(fireflySearchRequests).toBe(0);
});


test('homepage shelves scroll horizontally while search results stay in a scan-friendly grid', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      popular: Array.from({ length: 14 }, (_, index) => ({
        id: 8800 + index,
        title: { english: 'Popular Shelf Anime ' + (index + 1) },
        format: 'TV',
        genres: ['Action'],
        coverImage: { large: '' },
        isAdult: false
      })),
      recent: [{ id: 8899, title: { english: 'Recently Updated Shelf' }, format: 'TV', genres: ['Drama'], isAdult: false }]
    })
  }));
  await page.route('**/anime/search?**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ results: [{ id: 8901, title: { english: 'Search Grid Result' }, format: 'TV', genres: ['Mystery'], isAdult: false }] })
  }));

  await page.goto(pagePath);
  const popularRail = page.locator('.ao-section').filter({ has: page.getByRole('heading', { name: 'Most Popular' }) }).locator('.ao-grid-rail');
  await expect(popularRail).toBeVisible();
  await expect(popularRail.locator('.ao-tile')).toHaveCount(14);
  const dimensions = await popularRail.evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    display: getComputedStyle(element).display
  }));
  expect(dimensions.display).toBe('flex');
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  await page.getByRole('button', { name: 'Scroll Most Popular right' }).click();
  await expect.poll(() => popularRail.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);

  await page.locator('.ao-home-search input').fill('Search Grid');
  await page.locator('.ao-home-search button').click();
  await expect(page.getByText('Search Grid Result')).toBeVisible();
  await expect(page.locator('.ao-results .ao-grid')).toBeVisible();
  await expect(page.locator('.ao-results .ao-grid-rail')).toHaveCount(0);
});


test('streaming catalogue UI keeps compact branding, clear navigation and featured discovery', async ({ page }) => {
  await page.route('**/anime/home', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      popular: [{
        id: 9911,
        title: { english: 'Featured UI Test' },
        format: 'TV',
        seasonYear: 2026,
        meanScore: 87,
        genres: ['Action'],
        coverImage: { large: '' },
        isAdult: false
      }],
      recent: []
    })
  }));
  await page.goto(pagePath);
  await expect(page.locator('.ao-topbar')).toBeVisible();
  await expect(page.locator('.ao-home-intro')).toBeVisible();
  await expect(page.locator('.ao-home-intro-brand')).toContainText('AniOrbit');
  await expect(page.locator('.ao-hero')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Featured UI Test' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Discover' })).toBeVisible();
  await page.locator('.ao-nav-more summary').click();
  await expect(page.locator('.ao-nav-menu a', { hasText: 'Tracking' })).toBeVisible();
  await expect(page.locator('.ao-section .ao-card-score').first()).toContainText('8.7');
  const dimensions = await page.locator('.ao-home-intro').evaluate(element => ({
    height: element.getBoundingClientRect().height,
    width: element.getBoundingClientRect().width
  }));
  expect(dimensions.height).toBeLessThan(220);
  expect(dimensions.width).toBeGreaterThan(500);
});


