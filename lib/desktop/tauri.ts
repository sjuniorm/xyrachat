/**
 * Bridge to the Tauri desktop shell.
 *
 * The web app is loaded UNCHANGED inside the Tauri window — these helpers just
 * detect whether we're running in the desktop shell (via the `window.__TAURI__`
 * global, exposed because tauri.conf.json sets `app.withGlobalTauri: true`) and,
 * if so, route notifications through the native OS + set the dock/taskbar badge.
 * In a normal browser every function no-ops or falls back, so the web + mobile
 * experience is untouched.
 */

type TauriNotification = {
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<"granted" | "denied" | "default">;
  sendNotification: (opts: {
    title: string;
    body?: string;
    icon?: string;
  }) => void;
};

type TauriGlobal = {
  core?: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  notification?: TauriNotification;
};

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** True when running inside the Tauri desktop shell. */
export function isDesktop(): boolean {
  return tauri() !== null;
}

/**
 * Ensure we can post notifications, on whichever platform. Returns whether
 * permission is granted. Safe to call from a user gesture.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const n = tauri()?.notification;
  if (n) {
    if (await n.isPermissionGranted()) return true;
    return (await n.requestPermission()) === "granted";
  }
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "default") {
      try {
        return (await Notification.requestPermission()) === "granted";
      } catch {
        return false;
      }
    }
  }
  return false;
}

/**
 * Show a native notification through Tauri. Returns true if it was handled by
 * the desktop shell; false means "not in Tauri — caller should fall back to the
 * browser Notification API".
 */
export function desktopNotify(title: string, body: string): boolean {
  const n = tauri()?.notification;
  if (!n) return false;
  try {
    n.sendNotification({ title, body, icon: "/icon.png" });
  } catch {
    /* ignore */
  }
  return true;
}

/** Set the dock (macOS) / taskbar (Windows) unread badge. No-op in a browser. */
export function setUnreadBadge(count: number): void {
  const core = tauri()?.core;
  if (core) void core.invoke("set_unread", { count }).catch(() => {});
}
