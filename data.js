import { importedShops } from './data-imported.js';

const curatedShops = [
  {
    id: "coffeecompany",
    name: "Coffeecompany Kinker",
    rating: 4.4,
    location: "Oud-West",
    address: "Kinkerstraat 1, 1053 DE Amsterdam",
    description: "Buurtkoffiebar op de Kinkerstraat. Specialty coffee, laptopvriendelijk en altijd druk.",
    category: "Cafes",
    image: "images/coffeecompany_cover.png",
    inPortal: true,
    verified: true
  },
  {
    id: "lot-sixty-one-coffee-roasters",
    name: "Lot Sixty One Coffee Roasters",
    location: "Oud-West",
    description: "Specialty coffee in Oud-West.",
    category: "Cafes",
    image: "images/seed/lot-sixty-one-coffee-roasters.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "coffee-room",
    name: "Coffee Room",
    location: "Oud-West",
    description: "Specialty coffee in Oud-West.",
    category: "Cafes",
    image: "images/seed/coffee-room.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "monks-coffee-roasters",
    name: "Monks Coffee Roasters",
    location: "Oud-West",
    description: "Specialty coffee in Oud-West.",
    category: "Cafes",
    image: "images/seed/monks-coffee-roasters.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "five-ways-west",
    name: "Five Ways West",
    location: "Oud-West",
    description: "Specialty coffee in Oud-West.",
    category: "Cafes",
    image: "images/seed/five-ways-west.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "dak-coffee-roasters",
    name: "DAK Coffee Roasters",
    location: "Oud-West",
    description: "Specialty coffee in Oud-West.",
    category: "Cafes",
    image: "images/seed/dak-coffee-roasters.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "trakteren",
    name: "Trakteren",
    location: "Oud-West",
    description: "Specialty coffee in Oud-West.",
    category: "Cafes",
    image: "images/seed/trakteren.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "scandinavian-embassy",
    name: "Scandinavian Embassy",
    location: "De Pijp",
    description: "Specialty coffee in De Pijp.",
    category: "Cafes",
    image: "images/seed/scandinavian-embassy.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "ct-coffee-and-coconuts",
    name: "CT Coffee & Coconuts",
    location: "De Pijp",
    description: "Specialty coffee in De Pijp.",
    category: "Cafes",
    image: "images/seed/ct-coffee-and-coconuts.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "de-wasserette",
    name: "De Wasserette",
    location: "De Pijp",
    description: "Specialty coffee in De Pijp.",
    category: "Cafes",
    image: "images/seed/de-wasserette.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "bakers-roasters",
    name: "Bakers & Roasters",
    location: "De Pijp",
    description: "Specialty coffee in De Pijp.",
    category: "Cafes",
    image: "images/seed/bakers-roasters.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "badeta-koffiebranders",
    name: "Badeta Koffiebranders",
    location: "De Pijp",
    description: "Specialty coffee in De Pijp.",
    category: "Cafes",
    image: "images/seed/badeta-koffiebranders.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "locals-coffee-locals-jacob",
    name: "Locals Coffee (Locals Jacob)",
    location: "De Pijp",
    description: "Specialty coffee in De Pijp.",
    category: "Cafes",
    image: "images/seed/locals-coffee-locals-jacob.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "toki",
    name: "TOKI",
    location: "Jordaan",
    description: "Specialty coffee in Jordaan.",
    category: "Cafes",
    image: "images/seed/toki.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "kafenion",
    name: "Kafenion Amsterdam",
    location: "Jordaan",
    description: "Specialty coffee in Jordaan.",
    category: "Cafes",
    image: "images/seed/kafenion.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "saint-jean",
    name: "Saint-Jean",
    location: "Jordaan",
    description: "Specialty coffee in Jordaan.",
    category: "Cafes",
    image: "images/seed/saint-jean.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "brunos",
    name: "Bruno's",
    location: "Jordaan",
    description: "Specialty coffee in Jordaan.",
    category: "Cafes",
    image: "images/seed/brunos.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "drupa-coffee-roasters",
    name: "Drupa Coffee Roasters",
    location: "Jordaan",
    description: "Specialty coffee in Jordaan.",
    category: "Cafes",
    image: "images/seed/drupa-coffee-roasters.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "sango",
    name: "Sango Specialty Coffee",
    location: "Jordaan",
    description: "Specialty coffee in Jordaan.",
    category: "Cafes",
    image: "images/seed/sango.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "naked-espresso",
    name: "NAKED espresso",
    location: "De Wallen",
    description: "Specialty coffee in De Wallen.",
    category: "Cafes",
    image: "images/seed/naked-espresso.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "morning-owl-coffee",
    name: "Morning Owl Coffee",
    location: "De Wallen",
    description: "Specialty coffee in De Wallen.",
    category: "Cafes",
    image: "images/seed/morning-owl-coffee.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "de-koffieschenkerij",
    name: "De Koffieschenkerij",
    location: "De Wallen",
    description: "Specialty coffee in De Wallen.",
    category: "Cafes",
    image: "images/seed/de-koffieschenkerij.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "black-gold-amsterdam",
    name: "Black Gold Amsterdam",
    location: "Nieuwmarkt",
    description: "Specialty coffee in Nieuwmarkt.",
    category: "Cafes",
    image: "images/seed/black-gold-amsterdam.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "back-to-black",
    name: "Back to Black",
    location: "Centrum",
    description: "Specialty coffee in Centrum.",
    category: "Cafes",
    image: "images/seed/back-to-black.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "good-beans-coffee",
    name: "Good Beans Coffee",
    location: "Haarlemmerbuurt",
    description: "Specialty coffee in Haarlemmerbuurt.",
    category: "Cafes",
    image: "images/seed/good-beans-coffee.png",
    inPortal: true,
    comingSoon: true
  },
  {
    id: "kyo-klub",
    name: "KYŌ-KLUB",
    rating: 4.7,
    location: "Amsterdam-West",
    description: "Japanese-inspired matcha & specialty drinks aan de Kinkerstraat.",
    category: "Tea Houses",
    image: "images/kyo_cover_1777740417130.png",
    inPortal: true,
    verified: true
  },
  {
    id: "stroopist",
    name: "The Stroopist",
    rating: 4.8,
    location: "De Wallen",
    description: "Artisanal stroopwafels crafted with organic ingredients. Experience the warm, gooey caramel.",
    category: "Dessert",
    image: "images/stroopist_cover_1777740431696.png",
    inPortal: true,
    verified: true
  },
  {
    id: "kanarie",
    name: "Kanarie Club",
    rating: 4.6,
    location: "West",
    description: "Vibrant food hall and cocktail bar in a former tram depot. Perfect for evening drinks.",
    category: "Bars",
    image: "images/kanarie_cover_1777740448056.png",
    inPortal: true,
    verified: true
  }
];

// Curated vendors first (with menus), then auto-imported café stubs.
// Kept as the OFFLINE/ERROR FALLBACK — the live list comes from the FairMenu
// database via loadShops().
export const shops = [...curatedShops, ...importedShops];

import { supabase, hasSupabase } from './supabase.js';
import { coords } from './coords.js';

// Live shops from the FairMenu tenants table. Active tenants become
// "verified" (red pins, "Alleen echte menu's") and link straight to their
// own zaak.fairmenu.app menu; unclaimed listings keep the claim overlay.
// Falls back to the baked list when offline or on any error.
export async function loadShops() {
  if (!hasSupabase) return shops;
  try {
    const { data, error } = await supabase
      .from('tenants')
      .select('slug, name, city, status, category, lat, lng, discount_pct, menu_items(count)')
      .in('status', ['active', 'unclaimed', 'pending'])
      .limit(1000);
    if (error || !data || data.length === 0) return shops;
    return data.map((t) => {
      if (t.lat != null && t.lng != null) coords[t.slug] = [t.lat, t.lng];
      const live = t.status === 'active';
      const menuCount = Array.isArray(t.menu_items) && t.menu_items[0] ? (t.menu_items[0].count ?? 0) : 0;
      return {
        id: t.slug,
        name: t.name,
        location: t.city ?? '',
        category: t.category ?? 'Cafes',
        description: '',
        image: null,
        hasMenu: menuCount > 0, // we've added a menu → consumers can "Open menu"
        comingSoon: t.status === 'unclaimed',
        pendingClaim: t.status === 'pending',
        verified: live,
        // Alleen voor actieve zaken: de query haalt bewust ook unclaimed/pending
        // op, en die kunnen geen bestelling aannemen. De admin zet discount_pct
        // op 0 zodra Betalen & afhalen uitgaat, dus > 0 impliceert bestelbaar.
        discountPct: live ? (t.discount_pct ?? 0) : 0,
        inPortal: live, // menu opens in-app, fed by the tenant-admin data
      };
    });
  } catch {
    return shops;
  }
}
