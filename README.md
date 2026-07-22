# FairMenu Portal

Discovery PWA deployed at `portal.fairmenu.app`.

The portal is a vanilla JavaScript + Vite application. Supabase is the single
source of truth for venues and menus; static copies of production menu data do
not belong in this repository.

```bash
npm ci --legacy-peer-deps
npm run dev
npm run build
npm run test:e2e
```

Required public environment variables are documented in `.env.example`.

The E2E suite runs deterministic local tests against a stubbed Supabase boundary
and read-only smoke tests against `portal.fairmenu.app`. It never writes to the
production database.
