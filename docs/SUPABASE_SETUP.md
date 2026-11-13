# Connect Supabase to AniOrbit

## 1. Add the public build variables to GitHub

Open the repository settings:

https://github.com/adeyemoadeteju-eng/movie-site/settings/variables/actions

Create these two **Actions variables** (not secrets):

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://uuvwwthkrkkrqjroitbh.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's `sb_publishable_...` key |

These are browser-facing values. Supabase publishable keys are designed to be public, but they are only safe when Row Level Security (RLS) is enabled and policies are correct.

Never add a `sb_secret_...` key or service-role key to GitHub Actions variables, frontend code, or the browser.

For local development, copy `.env.example` to `.env` and fill in the same two public values.

## 2. Create the initial database schema

1. Open the Supabase project: https://supabase.com/dashboard/project/uuvwwthkrkkrqjroitbh
2. Open **SQL Editor**.
3. Open the repository file `supabase/migrations/202611130001_aniorbit_community.sql`.
4. Copy the full SQL into a new SQL query and run it once.
5. Confirm the `profiles`, `anime_comments`, and `comment_likes` tables appear in Table Editor.

The migration enables RLS, creates a pseudonymous profile automatically after signup, and creates a private avatar bucket with a 2 MB limit for JPEG, PNG, and WebP files.

## 3. Configure authentication URLs

In Supabase, open **Authentication → URL Configuration**.

Set the Site URL to the live GitHub Pages origin:
`https://adeyemoadeteju-eng.github.io`

Add these Redirect URLs:
- `https://adeyemoadeteju-eng.github.io/movie-site/`
- `http://localhost:5173/**`

If the site later moves to a custom domain, update these URLs then.

## 4. What is and isn't active yet

The frontend Supabase client and database foundation are being added on the AniOrbit feature branch. This does not turn on registration or comments by itself. The next implementation step is the actual sign-up/login UI, profile editor, avatar upload flow, and community components, followed by tests of RLS with separate test accounts.
