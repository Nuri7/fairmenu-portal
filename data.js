import { hasSupabase, supabase } from './supabase.js';

// The FairMenu database is the single source of truth. The former baked
// directory and menu copies duplicated production data and made each portal
// deployment hundreds of megabytes larger.
export async function loadShops() {
  if (!hasSupabase) {
    console.error('[FairMenu] Supabase configuration is missing');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('slug, name, address, city, status, category, lat, lng, discount_pct, menu_items(count)')
      .in('status', ['active', 'unclaimed', 'pending'])
      .limit(1000);

    if (error) throw error;

    return (data || []).map((tenant) => {
      const live = tenant.status === 'active';
      const menuCount = Array.isArray(tenant.menu_items) && tenant.menu_items[0]
        ? (tenant.menu_items[0].count ?? 0)
        : 0;

      return {
        id: tenant.slug,
        name: tenant.name,
        address: tenant.address ?? '',
        location: tenant.city ?? '',
        category: tenant.category ?? 'Cafés',
        lat: tenant.lat,
        lng: tenant.lng,
        hasMenu: menuCount > 0,
        comingSoon: tenant.status === 'unclaimed',
        pendingClaim: tenant.status === 'pending',
        verified: live,
        discountPct: live ? (tenant.discount_pct ?? 0) : 0,
      };
    });
  } catch (error) {
    console.error('[FairMenu] Kon zaken niet laden', error);
    return [];
  }
}
