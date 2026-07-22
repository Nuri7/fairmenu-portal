export const venue = {
  id: 'test-cafe',
  slug: 'test-cafe',
  name: 'Test Café',
  address: 'Teststraat 1',
  city: 'Amsterdam',
  status: 'unclaimed',
  category: 'Café',
  lat: 52.3702,
  lng: 4.8952,
  discount_pct: 10,
  menu_verified: true,
  menu_items: [{ count: 1 }],
};

const menuVenue = {
  id: 'tenant-test-cafe',
  status: 'active',
  name: venue.name,
  slug: venue.slug,
  menu_verified: true,
  menu_categories: [{ id: 'cat-koffie', name: 'Koffie', sort: 0 }],
  menu_items: [{
    id: 'item-cappuccino',
    category_id: 'cat-koffie',
    name: 'Cappuccino',
    description: 'Dubbele espresso met melkschuim',
    price_cents: 350,
    tags: ['koffie'],
    image_url: null,
    available: true,
    sort: 0,
    menu_item_variants: [],
  }],
};

export const testUser = {
  id: 'portal-e2e-user',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'guest@fairmenu.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { name: 'E2E Gast' },
};

function json(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  });
}

export async function installPortalStubs(page) {
  await page.route('https://fairmenu-e2e.invalid/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/rest/v1/tenants') {
      const select = url.searchParams.get('select') || '';
      return json(route, select.includes('menu_categories') ? menuVenue : [venue]);
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname === '/auth/v1/user') return json(route, testUser);
      return json(route, { user: null, session: null });
    }

    if (url.pathname === '/rest/v1/favorites') return json(route, []);

    return json(route, []);
  });

  await page.route('https://fairmenu.app/api/pay/settings**', (route) => json(route, {
    payPickupEnabled: true,
    discountPct: 10,
    walletEnabled: false,
  }));

  await page.route('https://fairmenu.app/api/wallet/me', (route) => json(route, {
    balanceCents: 2500,
    headroomCents: 7500,
    pendingCents: 0,
    frozen: false,
  }));

  await page.route('https://fairmenu.app/api/wallet/topup', (route) => json(route, {
    checkoutUrl: 'http://127.0.0.1:4173/?e2e=topup',
  }));

  await page.route(/https:\/\/[^/]*tile\.openstreetmap\.org\/.*/, (route) =>
    route.fulfill({ status: 204, body: '' }));
}
