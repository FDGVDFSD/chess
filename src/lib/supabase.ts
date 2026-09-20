import { createClient } from "@supabase/supabase-js";

const metaEnv = (import.meta as any).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || "https://hulquvtadftsezwjthni.supabase.co";
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY || "placeholder-anon-key";

export const isSupabaseConfigured = Boolean(
  metaEnv.VITE_SUPABASE_URL && (metaEnv.VITE_SUPABASE_ANON_KEY || metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY)
);

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});
