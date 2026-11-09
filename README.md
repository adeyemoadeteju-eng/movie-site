# ZoroClone — AniList catalogue with embed-first playback

## Integrations
- AniList GraphQL powers search, trending, popular, anime details, episode counts and the AniList-to-MAL ID mapping.
- Episode numbers are built locally from AniList metadata, so opening an anime page does not wait for the Kuhi episode extractor.
- Jikan supplies MyAnimeList score, rank and popularity in the background; it does not block the episode list or player.
- Playback loads the configured VidSrc iframe directly. Optional additional HTTPS embed templates can be configured as backups. No Vidy player fallback is included.
- Kuhi is not on the episode-list or playback critical path. It is only pinged occasionally to reduce cold starts for any other API tools that still use it.

## Configure the VidSrc player
The frontend intentionally does not guess a third-party embed URL. Set the exact HTTPS URL template for the VidSrc host you own or are authorized to use:

1. Open **GitHub → movie-site → Settings → Secrets and variables → Actions → Variables**.
2. Create a repository variable named `VITE_VIDSRC_TEMPLATE`.
3. Set its value to your working embed URL and include `{malId}` and `{episode}`. Add `{audio}` if the player accepts a sub/dub parameter.

The Pages workflow passes that variable into the Vite build. The player receives the MAL ID in the episode link, so it does not need to wait for another AniList request before opening.

Optional backups use `VITE_EMBED_TEMPLATE`, `VITE_EMBED_NAME`, `VITE_FALLBACK_EMBED_TEMPLATE`, and `VITE_FALLBACK_EMBED_NAME`. All templates must use HTTPS and contain `{malId}` and `{episode}`.

## GitHub Pages
The included workflow installs dependencies, builds Vite and deploys `dist` on each push to `main`. The app uses HashRouter and Vite's `/movie-site/` base path so deep routes work on GitHub Pages.

## Local development
Install Node.js 20+, then run `npm install` and `npm run dev`. Copy `.env.example` to `.env.local` and set the embed template variables as needed.
