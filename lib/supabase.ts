import { Platform } from "react-native";
import { createClient, type SupportedStorage } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

const memoryStorage = new Map<string, string>();
const memoryAdapter: SupportedStorage = {
  getItem: (key) => Promise.resolve(memoryStorage.get(key) ?? null),
  setItem: (key, value) => {
    memoryStorage.set(key, value);
    return Promise.resolve();
  },
  removeItem: (key) => {
    memoryStorage.delete(key);
    return Promise.resolve();
  },
};

const secureStoreAdapter: SupportedStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key).then(() => {}),
};

// SecureStore is only available on native. On web we keep a module-level
// fallback so the static web build still works.
const storage: SupportedStorage =
  Platform.OS === "web" ? memoryAdapter : secureStoreAdapter;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage,
  },
});
