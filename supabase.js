// supabase.js — the client, created only if env vars are present. When absent,
// the app falls back to device-local profiles (see auth.js). The anon key is
// safe in the frontend; Row Level Security protects the data.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anon);
export const supabase = hasSupabase ? createClient(url, anon) : null;
