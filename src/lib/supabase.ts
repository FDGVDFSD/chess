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

const rememberDeviceKey = "chess-arena-remember-device";
const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
})();
const authStoragePrefix = projectRef ? `sb-${projectRef}-auth-token` : "sb-";

function browserStorageAvailable() {
  return typeof window !== "undefined" && typeof localStorage !== "undefined" && typeof sessionStorage !== "undefined";
}

function hasLegacyPersistentSession() {
  if (!browserStorageAvailable()) return false;
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(authStoragePrefix)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

export function getRememberDevicePreference() {
  if (!browserStorageAvailable()) return false;
  try {
    const saved = localStorage.getItem(rememberDeviceKey);
    if (saved === "1") return true;
    if (saved === "0") return false;

    // Preserve existing v2 users who were signed in before this setting existed.
    if (hasLegacyPersistentSession()) {
      localStorage.setItem(rememberDeviceKey, "1");
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function moveAuthStorage(from: Storage, to: Storage) {
  const keys: string[] = [];
  for (let i = 0; i < from.length; i += 1) {
    const key = from.key(i);
    if (key?.startsWith(authStoragePrefix)) keys.push(key);
  }

  for (const key of keys) {
    const value = from.getItem(key);
    if (value !== null) to.setItem(key, value);
    from.removeItem(key);
  }
}

export function setRememberDevicePreference(remember: boolean) {
  if (!browserStorageAvailable()) return;
  try {
    localStorage.setItem(rememberDeviceKey, remember ? "1" : "0");
    if (remember) moveAuthStorage(sessionStorage, localStorage);
    else moveAuthStorage(localStorage, sessionStorage);
  } catch {
    // If storage is blocked, Supabase can still maintain the in-memory session.
  }
}

export function clearRememberDevicePreference() {
  if (!browserStorageAvailable()) return;
  try {
    localStorage.removeItem(rememberDeviceKey);
  } catch {
    // Ignore browser storage failures.
  }
}

const authStorage = {
  getItem(key: string) {
    if (!browserStorageAvailable()) return null;
    try {
      return getRememberDevicePreference() ? localStorage.getItem(key) : sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    if (!browserStorageAvailable()) return;
    try {
      if (getRememberDevicePreference()) localStorage.setItem(key, value);
      else sessionStorage.setItem(key, value);
    } catch {
      // Ignore storage failures; the active page can still use the live session.
    }
  },
  removeItem(key: string) {
    if (!browserStorageAvailable()) return;
    try {
      // Remove from both stores so an old remembered session cannot reappear.
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Ignore browser storage failures.
    }
  }
};

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authStorage
  },
  realtime: {
    params: {
      eventsPerSecond: 20
    }
  }
});
