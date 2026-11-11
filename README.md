# AnimeDex-style anime catalogue

A React + Vite recreation inspired by the public AnimeDexLite v3 interface, connected to this project's existing Kuhi-compatible anime API and playback routes.

## Features
- AnimeDex-inspired red gradient header, spotlight hero, poster grid, and dark catalogue styling.
- Popular and recent anime rows, search results, anime information, episode listings, and watch pages.
- Existing API-backed catalogue and playback integration.
- Responsive desktop and mobile layouts.

## Data and playback
- Catalogue data is supplied by the backend API. The frontend reads `VITE_KUHI_API_URL`, then `VITE_ANIME_API_URL`, and falls back to the current Render API URL.
- Playback uses the backend `/anime/playback/{id}` route and the configured HTTPS embed fallback.
- AnimeDexLite's original APIs and domains are discontinued; this project does not depend on them.

## Development
Use Node.js 20 or newer:

```bash
npm install
npm run dev
npm run test:e2e
```

## Reference and rights
This is an independent implementation inspired by the layout of [TechShreyash/AnimeDexLite](https://github.com/TechShreyash/AnimeDexLite). That repository does not declare an open-source licence, so this project does not copy its source files or original branding assets. The original project is discontinued and this project is not affiliated with its author.
