# AniOrbit implementation plan

## Product direction
AniOrbit is an anime discovery and community platform. Keep the existing React/Vite frontend, FastAPI anime API on Render, catalogue integrations, and current playback flow stable while adding community capabilities.

## Phase 1 — Brand foundation (started)
- Replace visible AnimeDex branding with AniOrbit across the app shell, header, footer, loading screen, document title, and metadata.
- Keep existing localStorage keys unchanged so current watchlists, settings, progress, and intro-skip preferences are not lost.
- Use a feature branch and pull request; do not deploy directly to production before checks pass.

## Phase 2 — Supabase project and secure configuration
- Create a Supabase project in a suitable region.
- Configure only the public project URL and anon/publishable key in frontend build variables (for GitHub Pages, GitHub Actions repository variables/secrets as appropriate).
- Never expose a Supabase service-role key, database password, or other privileged secret in frontend code or chat.
- Add the Supabase JS client and a clear configuration check. Until credentials exist, the current catalogue must continue to work without auth.

## Phase 3 — Accounts and profiles
- Supabase Auth: sign up, sign in, sign out, password reset, session restore.
- Profiles table keyed to auth.users: unique pseudonymous username, display name, avatar path, short bio, favourite anime, created/updated timestamps.
- Avatar storage bucket with image MIME/size limits.
- Privacy defaults: no public email, real name, precise location, or watch activity; users control profile visibility.

## Phase 4 — Community
- Anime-level and episode-level comments, replies, likes, spoiler flags, edit/delete-own-comment, report/block controls.
- Pagination and rate limits; validate lengths and sanitize rendered content.
- Spoiler content hidden until deliberately revealed.
- RLS: users can only modify their own profile/content; public reads only for content intended to be public.

## Phase 5 — Presence and activity
- Opt-in pseudonymous online presence using Supabase Realtime Presence.
- Avoid public last-seen history by default; don't expose private watch history.
- Activity feed only for actions a user chooses to share.

## Phase 6 — Moderation and launch readiness
- Community guidelines, report queue, admin/moderator roles, block/mute, spam throttling, and basic abuse monitoring.
- Test auth/RLS with multiple accounts and anonymous sessions before enabling public comments.
- Keep DMs out of the first release; add only after moderation and safety controls are proven.

## Phase 7 — Domain and growth
- Choose and register a custom domain only after checking availability and cost; no purchase is authorized by this plan.
- Configure GitHub Pages custom domain and DNS; keep the Render API hostname separate.
- Launch a small invite beta, gather feedback, publish shareable anime lists/profiles, and promote only in communities that allow it.
- Distribute or embed only content the project has permission to provide; prioritize discovery and links to authorized viewing services.

## Current dependencies / blockers
- Supabase project URL and publishable key have been supplied and documented for GitHub Actions configuration; the owner must add them as repository Actions variables.
- Initial schema migration is committed but must be run in the Supabase SQL Editor. Auth UI is not implemented yet.
- No account, profile, or comment feature should be considered live until the migration is applied, build variables are configured, and RLS policies are tested.
- Custom domain choice and purchase remain undecided.
