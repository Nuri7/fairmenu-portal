// auth.js — accounts + favorites.
//
// Two backends behind one interface:
//   • Supabase (when VITE_SUPABASE_* are set): real email/password accounts,
//     favorites synced to the DB, cross-device.
//   • localStorage fallback: a device-local profile (no password).
//
// Callers use a synchronous interface (isLoggedIn / getFavorites / isFavorite),
// so for Supabase we keep an in-memory cache hydrated from the session and
// refreshed on every auth change.

import { hasSupabase, supabase } from './supabase.js';

export const usesAccounts = hasSupabase; // true → real email/password accounts

const listeners = new Set();
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn()); }

// ---------------------------------------------------------------------------
// In-memory cache (source of truth for the sync getters)
let profile = null;            // { id, name, email } | null
let favorites = new Set();     // Set<shopId>
let wallet = null;             // { balanceCents, headroomCents, pendingCents, frozen } | null

export function getProfile() { return profile; }
export function isLoggedIn() { return !!profile; }
export function getFavorites() { return [...favorites]; }
export function isFavorite(id) { return favorites.has(id); }
export function getWallet() { return wallet; }

// ===========================================================================
// localStorage backend
// ===========================================================================
const PROFILE_KEY = 'cm_profile';
const FAV_KEY = 'cm_favorites';

function localHydrate() {
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { profile = null; }
  try { favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY)) || []); } catch { favorites = new Set(); }
}
function localSaveFavs() { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); }

// ===========================================================================
// Supabase backend
// ===========================================================================
async function sbLoadFavorites() {
  const { data } = await supabase.from('favorites').select('shop_id');
  favorites = new Set((data || []).map((r) => r.shop_id));
}

// Het toegangstoken van de huidige sessie — de tegoed-routes op fairmenu.app
// autoriseren daarop (cross-origin, dus geen cookie).
export async function getAccessToken() {
  if (!hasSupabase) return '';
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
}

// NIET het favorieten-patroon kopiëren (optimistisch vanuit de browser schrijven):
// het grootboek is definer-only, de browser leest alleen.
async function sbLoadWallet() {
  try {
    const token = await getAccessToken();
    if (!token) { wallet = null; return; }
    const r = await fetch('https://fairmenu.app/api/wallet/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    wallet = r.ok ? await r.json() : null;
  } catch {
    wallet = null;
  }
}

export async function refreshWallet() {
  if (!hasSupabase || !profile) { wallet = null; emit(); return; }
  await sbLoadWallet();
  emit();
}

async function sbHydrateFromSession(session) {
  if (session?.user) {
    const u = session.user;
    profile = { id: u.id, name: u.user_metadata?.name || u.email?.split('@')[0] || 'Profiel', email: u.email };
    await Promise.all([sbLoadFavorites(), sbLoadWallet()]);
  } else {
    profile = null;
    favorites = new Set();
    wallet = null;
  }
  emit();
}

// ===========================================================================
// Public init — call once at startup.
// ===========================================================================
export async function initAuth() {
  if (!hasSupabase) { localHydrate(); emit(); return; }
  const { data } = await supabase.auth.getSession();
  await sbHydrateFromSession(data.session);
  supabase.auth.onAuthStateChange((_evt, session) => { sbHydrateFromSession(session); });
}

// ---- Account actions ----

// Supabase: create an account (email + password). Returns { error } | {}.
export async function signUp({ email, password, name }) {
  if (!hasSupabase) { createProfile({ name, email }); return {}; }
  const { error } = await supabase.auth.signUp({
    email, password, options: { data: { name: (name || '').trim() } },
  });
  return { error: error?.message };
}

// Supabase: log in to an existing account. Returns { error } | {}.
export async function signIn({ email, password }) {
  if (!hasSupabase) return { error: 'Inloggen vereist een account-backend.' };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message };
}

// localStorage: create a device-local profile (no password).
export function createProfile({ name, email }) {
  profile = { name: (name || '').trim(), email: (email || '').trim() || null, createdAt: Date.now() };
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  emit();
  return profile;
}

export async function logout() {
  if (hasSupabase) { await supabase.auth.signOut(); return; } // onAuthStateChange clears cache
  localStorage.removeItem(PROFILE_KEY);
  profile = null; favorites = new Set(); wallet = null;
  emit();
}

// ---- Favorites ----
// Optimistic: update the cache + emit immediately, persist in the background.
// Returns true if toggled, false if blocked (not logged in).
export function toggleFavorite(id) {
  if (!isLoggedIn()) return false;
  const wasFav = favorites.has(id);
  if (wasFav) favorites.delete(id); else favorites.add(id);
  emit();

  if (hasSupabase) {
    if (wasFav) {
      supabase.from('favorites').delete().eq('shop_id', id).eq('user_id', profile.id).then(() => {});
    } else {
      supabase.from('favorites').insert({ shop_id: id, user_id: profile.id }).then(() => {});
    }
  } else {
    localSaveFavs();
  }
  return true;
}
