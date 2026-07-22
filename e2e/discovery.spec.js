import { test, expect } from '@playwright/test';
import { installPortalStubs, testUser, venue } from './support/portal-fixture.js';

test.beforeEach(async ({ page }) => {
  await installPortalStubs(page);
  await page.goto('/');
});

test('loads venues, searches, filters and clears the result', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'FairMenu' })).toBeVisible();
  await expect(page.locator('#placeCount')).toHaveText('1 zaak');

  const search = page.getByPlaceholder('Zoek café of buurt in Amsterdam...');
  await search.fill('niet bestaand');
  await expect(page.locator('#placeCount')).toHaveText('0 zaken');

  await page.getByRole('button', { name: 'Wissen' }).click();
  await expect(page.locator('#placeCount')).toHaveText('1 zaak');

  const verified = page.getByRole('button', { name: 'Verified' });
  await verified.click();
  await expect(verified).toHaveAttribute('aria-pressed', 'true');

  const discount = page.getByRole('button', { name: 'Met korting' });
  await discount.click();
  await expect(discount).toHaveAttribute('aria-pressed', 'true');
  // The verified unclaimed menu remains discoverable, but discounts only
  // become active after the venue is claimed.
  await expect(page.locator('#placeCount')).toHaveText('0 zaken');
});

test('opens a venue menu and maintains the cart total', async ({ page }) => {
  await page.getByPlaceholder('Zoek café of buurt in Amsterdam...').fill(venue.name);
  await expect(page.locator('#placeCount')).toHaveText('1 zaak');

  await page.locator('.leaflet-marker-icon:visible').click();
  const popup = page.locator('.leaflet-popup:visible .fm-popup').last();
  await expect(popup).toContainText(venue.name);
  await expect(popup.getByRole('button')).toHaveText(['Open menu', 'Claim deze zaak']);
  await popup.getByRole('button', { name: /Bekijk menu|Open menu/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Cappuccino');
  await dialog.getByRole('button', { name: '+ Toevoegen' }).click();
  await expect(page.locator('.d-cartbar__n')).toHaveText('1');
  await expect(page.locator('.d-cartbar__total')).toContainText('€ 3,50');

  await page.locator('.d-cartbar').click();
  await expect(dialog.getByRole('heading', { name: 'Mijn bestelling' })).toBeVisible();
  await expect(dialog).toContainText('Korting van de zaak 10%');
  await expect(dialog).toContainText('€ 3,15');
});

test('favorite action is protected by the profile gate', async ({ page }) => {
  await page.getByPlaceholder('Zoek café of buurt in Amsterdam...').fill(venue.name);
  await page.locator('.leaflet-marker-icon:visible').click();
  await page.locator('.leaflet-popup:visible .fm-popup').last()
    .getByRole('button', { name: /Bekijk menu|Open menu/ }).click();
  await page.getByRole('button', { name: 'Favoriet' }).click();

  await expect(page.getByRole('dialog').last()).toContainText('Maak een profiel');
  await expect(page.getByRole('button', { name: 'Account aanmaken' })).toBeVisible();
  await expect(page.getByPlaceholder('je@email.nl')).toBeVisible();
});

test('shows a useful error when geolocation is denied', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition(_ok, fail) {
          queueMicrotask(() => fail({ code: 1, message: 'Toegang tot je locatie is geweigerd.' }));
        },
        watchPosition(_ok, fail) {
          queueMicrotask(() => fail({ code: 1, message: 'Toegang tot je locatie is geweigerd.' }));
          return 1;
        },
        clearWatch() {},
      },
    });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Zoek zaken in mijn buurt' }).click();
  await expect(page.getByRole('status')).toContainText(/toestemming|locatie/i);
});

test('authenticated profile shows wallet balance and starts a stubbed top-up', async ({ page }) => {
  const session = {
    access_token: 'portal-e2e-access-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'portal-e2e-refresh-token',
    user: testUser,
  };
  await page.evaluate((value) => {
    localStorage.setItem('sb-fairmenu-e2e-auth-token', JSON.stringify(value));
  }, session);
  await page.reload();

  await page.getByRole('link', { name: 'Profiel' }).click();
  const profile = page.getByRole('dialog');
  await expect(profile).toContainText('€ 25,00');
  await profile.getByRole('button', { name: 'Tegoed opwaarderen' }).click();
  await profile.locator('.pf-tile:not(.is-off)').first().click();
  await profile.getByRole('button', { name: 'Opwaarderen met iDEAL' }).click();
  await expect(page).toHaveURL(/\?e2e=topup$/);
});
