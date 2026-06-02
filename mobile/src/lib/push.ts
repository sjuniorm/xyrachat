import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { supabase } from "./supabase";

// Foreground behaviour: show the banner + play sound even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function projectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  );
}

/**
 * Asks for notification permission, fetches the Expo push token, and stores it
 * in `public.push_tokens` for the signed-in user. Safe to call on every
 * foreground / login — it UPSERTs on (user_id, token). Returns the token or
 * null (simulator, denied permission, or no projectId configured yet).
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    // Push tokens aren't issued on simulators/emulators.
    return null;
  }

  const id = projectId();
  if (!id) {
    // No EAS projectId yet (e.g. Expo Go before `eas init`). Remote push can't
    // work without it, so skip quietly rather than logging a token error.
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Messages",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#9333EA",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== "granted") return null;

  let token: string;
  try {
    const res = await Notifications.getExpoPushTokenAsync({ projectId: id });
    token = res.data;
  } catch (err) {
    console.warn("[push] getExpoPushTokenAsync failed", err);
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return token;

  // org_id is filled server-side by the push_tokens_set_org trigger.
  await supabase.from("push_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform: Platform.OS,
      device_name: Device.deviceName ?? null,
      last_seen_at: new Date().toISOString(),
      deleted_at: null,
    },
    { onConflict: "user_id,token" },
  );

  return token;
}

/** Remove this device's token on logout so we stop pushing to it. */
export async function unregisterPushToken(): Promise<void> {
  try {
    const id = projectId();
    const { data } = await Notifications.getExpoPushTokenAsync(
      id ? { projectId: id } : undefined,
    );
    const token = data;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && token) {
      await supabase
        .from("push_tokens")
        .delete()
        .eq("user_id", user.id)
        .eq("token", token);
    }
  } catch {
    // Best-effort — never block logout on this.
  }
}
