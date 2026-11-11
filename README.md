# Zoro.to

A React and Vite anime discovery and watch frontend.

## Features

- Browse trending and popular anime in separate catalogue rows.
- Filter the catalogue by genre and search titles.
- Open anime details in a centered modal and browse the episode list.
- Switch between Sub and Dub, then load playback through the configured anime API with an embed fallback.
- Use the AniWorld Downloader interface layout, poster cards, genre chips, and episode accordion.

## Data and playback

- The Kuhi API proxies AniList catalogue, search, genre, and anime-detail requests. The frontend does not call AniList GraphQL directly.
- The playback API defaults to `https://anime-api-jqpp.onrender.com`. Set `VITE_ANIME_API_URL` to use a different backend.
- The frontend supports iframe embeds and HLS/direct video playback where a provider returns a compatible source.

## GitHub Pages

The project uses `HashRouter` and Vite's relative base path for GitHub Pages routes. The workflow in `.github/workflows/deploy.yml` builds the Vite app and deploys `dist` from `main`.

## Local development

Use Node.js 20 or newer:

```bash
npm install
npm run dev
```

Create a `.env` file to override the backend URL or configured fallback embed values. See `.env.example` for the supported variable names.

## Third-party notices

The interface stylesheet and catalogue layout are adapted directly from the MIT-licensed [AniWorld Downloader](https://github.com/phoenixthrush/AniWorld-Downloader) by phoenixthrush, Tmaster055, SiroxCW, and Yezun-hikari. The upstream copyright and full MIT permission notice are retained in [THIRD_PARTY_LICENSES/AniWorld-Downloader-MIT.txt](THIRD_PARTY_LICENSES/AniWorld-Downloader-MIT.txt). The app-specific catalogue data and playback routes remain powered by this project's AniList-compatible API.
