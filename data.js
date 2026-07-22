import { hasSupabase, supabase } from './supabase.js';
import reviewCandidateSlugs from './review-candidates.js';

const REVIEW_CANDIDATES = new Set(reviewCandidateSlugs);

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
      // menu_items(count) became a statement-timeout once the review import
      // grew to ~12k rows. menu_source_type is maintained whenever a menu is
      // imported and, together with menu_verified, is the cheap map-level flag.
      .select('slug, name, address, city, status, category, lat, lng, discount_pct, menu_verified, menu_source_type')
      .in('status', ['active', 'unclaimed', 'pending'])
      .limit(1000);

    if (error) throw error;

    return (data || []).map((tenant) => {
      const live = tenant.status === 'active';
      return {
        id: tenant.slug,
        name: tenant.name,
        address: tenant.address ?? '',
        location: tenant.city ?? '',
        category: tenant.category ?? 'Cafés',
        lat: tenant.lat,
        lng: tenant.lng,
        hasMenu: tenant.menu_verified === true || tenant.menu_source_type != null,
        claimed: live,
        comingSoon: tenant.status === 'unclaimed',
        pendingClaim: tenant.status === 'pending',
        // A verified menu is real regardless of whether the venue has claimed
        // its listing. Claim status controls management, not discovery.
        verified: tenant.menu_verified === true,
        // The research archive is a review queue, not proof that a menu is
        // correct. Keep it separate from menu_verified so candidates can be
        // found on the map without presenting them as approved menus.
        needsReview: tenant.menu_verified !== true && REVIEW_CANDIDATES.has(tenant.slug),
        discountPct: live ? (tenant.discount_pct ?? 0) : 0,
      };
    });
  } catch (error) {
    console.error('[FairMenu] Kon zaken niet laden', error);
    return [];
  }
}
