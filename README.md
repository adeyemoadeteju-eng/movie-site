# Zoro.to

A React and Vite anime discovery and watch frontend.

## Features

- Browse trending, popular, and top-rated anime.
- Search the AniList catalogue and open anime details.
- View episode lists and switch between Sub and Dub.
- Load playback sources from the configured anime API, with the configured embed as a fallback.
- Responsive dark interface with a compact poster grid.

## Data and playback

- AniList GraphQL provides catalogue, search, and anime metadata.
- Jikan provides supplementary MyAnimeList metadata when an anime has a MAL ID.
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

The home-page layout, search controls, poster cards, modal structure, and related styling are adapted from the MIT-licensed [AniWorld Downloader](https://github.com/phoenixthrush/AniWorld-Downloader) by phoenixthrush, Tmaster055, SiroxCW, and Yezun-hikari. The upstream copyright and full MIT permission notice are retained in [THIRD_PARTY_LICENSES/AniWorld-Downloader-MIT.txt](THIRD_PARTY_LICENSES/AniWorld-Downloader-MIT.txt). This project adapts the interface to its own AniList catalogue and playback API; it does not include the upstream downloader backend.
