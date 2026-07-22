import { defineConfig, devices } from '@playwright/test';

const LOCAL_URL = 'http://127.0.0.1:4173';
const LIVE_URL = process.env.PLAYWRIGHT_LIVE_URL || 'https://portal.fairmenu.app';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173',
    url: LOCAL_URL,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_SUPABASE_URL: 'https://fairmenu-e2e.invalid',
      VITE_SUPABASE_ANON_KEY: 'fairmenu-e2e-anon-key',
    },
  },
  use: {
    trace: 'retain-on-failure',
    locale: 'nl-NL',
  },
  projects: [
    {
      name: 'local-stubbed',
      grepInvert: /@live/,
      use: { ...devices['Desktop Chrome'], baseURL: LOCAL_URL },
    },
    {
      name: 'live-desktop',
      grep: /@live/,
      use: { ...devices['Desktop Chrome'], baseURL: LIVE_URL },
    },
    {
      name: 'live-mobile',
      grep: /@live/,
      use: { ...devices['iPhone 13'], baseURL: LIVE_URL },
    },
  ],
});
