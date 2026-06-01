import { AppState } from "react-native";
import { createClient } from "@supabase/supabase-js";
import { largeSecureStore } from "./storage";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy mobile/.env.example to mobile/.env and fill them in.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: largeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    // RN has no URL bar — there's no session to detect from a redirect.
    detectSessionInUrl: false,
  },
});

// Supabase recommends pausing/resuming the auto-refresh timer with app focus so
// tokens refresh while the app is foregrounded and don't churn in the
// background. https://supabase.com/docs/guides/auth/quickstarts/react-native
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    void supabase.auth.startAutoRefresh();
  } else {
    void supabase.auth.stopAutoRefresh();
  }
});
