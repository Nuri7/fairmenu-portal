import { test, expect } from '@playwright/test';

test.describe('@live production portal', () => {
  test('renders the discovery map and venue count', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('FairMenu');
    await expect(page.getByRole('heading', { name: 'FairMenu' })).toBeVisible();
    await expect(page.locator('#placeCount')).toHaveText(/^\d+ zaken?$/);
    await expect(page.locator('.leaflet-marker-icon:visible').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Kaart' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Favorieten' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Profiel' })).toBeVisible();
  });

  test('finds Kanarie Club and opens its real menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#placeCount')).toHaveText(/^\d+ zaken?$/);
    await page.getByPlaceholder('Zoek café of buurt in Amsterdam...').fill('Kanarie Club');
    await expect(page.locator('#placeCount')).toHaveText('1 zaak');
    await page.locator('.leaflet-marker-icon:visible').click();
    const popup = page.locator('.leaflet-popup:visible .fm-popup').last();
    await expect(popup).toContainText('Kanarie Club');
    await popup.getByRole('button', { name: /Bekijk menu|Open menu/ }).click();
    await expect(page.getByRole('dialog')).toContainText('Kanarie Club');
    await expect(page.locator('.d-item').first()).toBeVisible();
  });
});
