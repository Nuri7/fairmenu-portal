# Supabase accounts — setup

Real cross-device accounts + favorites for the portal. Currently favorites are
stored per-device in localStorage (`auth.js`); this swaps in a real backend.

The frontend is written to **auto-detect** Supabase: if the two env vars below
are present it uses real accounts, otherwise it falls back to localStorage. So
production keeps working until you flip it on.

## One-time setup (~5 min)

1. Create a project at https://supabase.com/dashboard (own org, free tier is fine).
   Region: **Frankfurt (eu-central-1)** for NL latency + GDPR.
2. In the project's **SQL editor**, paste and run [`schema.sql`](./schema.sql).
   (profiles + favorites tables, RLS, signup trigger)
3. **Authentication → Providers → Email**: enable Email. For a friction-free
   demo, turn **"Confirm email" OFF** (users log in immediately). Turn it back
   on before real launch.
4. Copy from **Project Settings → API**:
   - Project URL  → `VITE_SUPABASE_URL`
   - `anon` public key → `VITE_SUPABASE_ANON_KEY`
5. Add both to `portal/.env` (and to the Vercel project's env vars):
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```
   The `anon` key is safe to expose in the frontend — RLS protects the data.

## Then

Tell me it's done (or paste the two values) and I'll wire `auth.js` /
`profile.js` to Supabase, migrate the profile modal to email+password
signup/login, sync favorites to the `favorites` table, and **test the full
flow live** before deploying.

## Faster alternative

Generate a **Supabase Personal Access Token**
(https://supabase.com/dashboard/account/tokens) and share it — then I create the
project, run the schema, and wire everything myself via the Management API, no
manual steps on your side.
