import { createClient } from "@supabase/supabase-js";

const metaEnv = import.meta.env;
const supabaseUrl =
  (metaEnv.VITE_SUPABASE_URL as string | undefined) ??
  "https://hulquvtadftsezwjthni.supabase.co";

// Publishable keys are designed to be shipped to browsers. Never put a secret/service-role key here.
const supabasePublishableKey =
  (metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
  (metaEnv.VITE_SUPABASE_ANON_KEY as string | undefined) ??
  "sb_publishable__I2Zi5gFYb4pUwG3IdMhTg_pOgHXS1j";

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey);

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 20
    }
  }
});
