# FairMenu Portal

- Vanilla JavaScript + Vite PWA; do not introduce React patterns.
- Venue and menu data come from Supabase.
- Payments, wallet and interest endpoints live at `fairmenu.app/api/*`.
- Use Nominatim/OpenStreetMap; do not add Google products.
- Install with `npm ci --legacy-peer-deps` and verify with `npm run build`.

## Cursor Cloud specific instructions

- Commands live in `package.json` / `README.md`: `npm run dev` (Vite dev server, defaults to port 5173), `npm run build`, `npm run preview`, `npm run test:e2e`. There is no lint script.
- No `VITE_SUPABASE_*` secrets are configured in this environment. The app still runs without them: the discovery map/search UI loads but shows zero venues (`loadShops()` logs `Supabase configuration is missing` and returns `[]`), and accounts fall back to a device-local, password-less profile. Creating a profile via the "Profiel" tab is a good no-secret smoke test of core UI.
- To exercise real venue/menu/wallet flows without live Supabase, run the Playwright e2e suite — it stubs the Supabase + `fairmenu.app/api/*` boundary at the network layer (`e2e/support/portal-fixture.js`) and never touches production.
- Run local e2e with `npx playwright test --project=local-stubbed` (only needs the chromium browser). Playwright's `webServer` auto-starts `npm run dev` on port 4173 with dummy `VITE_SUPABASE_*` env and reuses an already-running server. The `@live` projects hit `portal.fairmenu.app` and need outbound network.
