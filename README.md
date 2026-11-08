# ZoroClone — original visual rebuild with AniList + Kuhi

This package is based on the original public `fiskryeziu/zoroClone` repository's visual structure, colours, layout and artwork references. The frontend keeps the Zoro-style navigation, lime accent, spotlight hero, trending strip, anime shelves, sidebar ranking/genres and footer. The original repository's image files are referenced from its `raw.githubusercontent.com` paths rather than duplicated into this ZIP.

## Integrations
- AniList GraphQL powers search, spotlight, trending, popularity, catalogue cards, anime details and metadata.
- Kuhi API (`https://anime-api-jqpp.onrender.com`) supplies episodes, provider choices and stream extraction.
- Playback supports provider iframe embeds, HLS and direct video streams. Some providers block iframe embedding; choose another returned server if that happens.
- Render free services can sleep after inactivity. The watch page waits up to 75–90 seconds for API responses; it does not run background keep-alive pings.
- Catalogue results are cached in localStorage for 12 minutes.

## GitHub Pages
1. Upload the ZIP contents to the root of your repository on `main`.
2. Open **Settings → Pages** and select **GitHub Actions** as the deployment source.
3. The included workflow installs dependencies, builds Vite and deploys `dist` on each push.

The app uses HashRouter and Vite's relative base path so deep routes work on GitHub Pages.

## Local development
Install Node.js 20+, then run `npm install` and `npm run dev`. The default Kuhi API URL is already configured; `.env.example` shows how to override it.
