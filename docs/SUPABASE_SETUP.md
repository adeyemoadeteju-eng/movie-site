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
6. Run `supabase/migrations/202611130002_private_profiles.sql` as a second query. This sets profiles to private by default and updates the signup trigger so new profiles remain private unless a member opts in.
7. Run `supabase/migrations/202611130003_community_safety_presence.sql` as a third query. It adds pseudonymous comment author labels, opt-in online presence, report and block tables, moderator tools, a five-comments-per-five-minutes posting limit, and member-only avatar reads.

The migrations enable RLS, create a pseudonymous profile automatically after signup, and create a private avatar bucket with a 2 MB limit for JPEG, PNG, and WebP files. The discussion posting policy stays closed until a moderator account is appointed.

## 3. Configure authentication URLs

In Supabase, open **Authentication → URL Configuration**.

Set the Site URL to the live GitHub Pages origin:
`https://adeyemoadeteju-eng.github.io`

Add these Redirect URLs:
- `https://adeyemoadeteju-eng.github.io/movie-site/`
- `http://localhost:5173/**`

If the site later moves to a custom domain, update these URLs then.

## 4. Appoint the first moderator before opening discussions

1. Create and confirm your own AniOrbit account using the website. Do not share your password or email with anyone.
2. In Supabase, open **Authentication → Users** and copy the UUID for your account.
3. In SQL Editor, run the query below after replacing the placeholder with that UUID:

```sql
insert into public.community_moderators (user_id)
values ('PASTE-YOUR-ACCOUNT-UUID-HERE')
on conflict (user_id) do nothing;
```

Until at least one moderator is appointed, the database rejects new comments. The moderator can open **Your account → Open moderation queue** to review reports, hide/unhide comments, and close reports.

## 5. What the community features do

- Anime pages have a general discussion; watch pages have episode-specific discussion.
- Signed-in members can post, edit, delete, like, mark spoilers, report comments, and block members.
- Comments display a database-generated username snapshot, not email addresses or private profile fields.
- Reports are private to moderators. Profiles remain private unless members explicitly opt in.
- Avatars accept JPEG, PNG, or WebP images up to 2 MB and are readable only by signed-in members.
- Online presence is an anonymous count. A member must opt in; names and last-seen times are not shown.
- No direct messages or public watch-history feed are included.

Run all three migrations before enabling the new front-end build. After merge, verify account creation, login, profile editing, avatar upload, a comment/like/report/block cycle, the moderator queue, and opt-in presence using test accounts before inviting other people.
