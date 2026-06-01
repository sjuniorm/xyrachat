import { MD3DarkTheme } from "react-native-paper";
import { DarkTheme as NavDarkTheme } from "@react-navigation/native";

/**
 * Xyra brand tokens — kept in sync with the web app's app/globals.css.
 * Source of truth for both is CLAUDE.md › "Brand tokens".
 */
export const colors = {
  bg: "#0B0418", // app background (dark)
  surface: "#1F1033", // cards / sidebar / sheets
  surfaceAlt: "#2A1745", // raised surface (inputs, pressed rows)
  border: "#36215A",
  purple: "#9333EA", // primary accent
  pink: "#EC4899", // secondary accent
  glow: "#D882FF", // focus rings / halos
  text: "#F5F0FB",
  textMuted: "#A78BB5",
  textFaint: "#7A6592",
  online: "#22C55E",
  away: "#F59E0B",
  offline: "#6B7280",
  danger: "#EF4444",
  bubbleOut: "#7C2BD6", // outbound bubble (toward purple)
  bubbleIn: "#241338", // inbound bubble
  white: "#FFFFFF",
} as const;

/** Channel → accent color, mirrors components/ui/channel-icon on web. */
export const channelColor: Record<string, string> = {
  whatsapp: "#25D366",
  instagram: "#E1306C",
  telegram: "#229ED9",
  email: "#A78BB5",
  facebook: "#0866FF",
};

export const gradient = ["#9333EA", "#EC4899"] as const;

export const paperTheme = {
  ...MD3DarkTheme,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    primary: colors.purple,
    onPrimary: colors.white,
    secondary: colors.pink,
    background: colors.bg,
    surface: colors.surface,
    surfaceVariant: colors.surfaceAlt,
    onSurface: colors.text,
    onSurfaceVariant: colors.textMuted,
    outline: colors.border,
    error: colors.danger,
    elevation: {
      ...MD3DarkTheme.colors.elevation,
      level0: "transparent",
      level1: colors.surface,
      level2: colors.surfaceAlt,
      level3: colors.surfaceAlt,
    },
  },
};

export const navTheme = {
  ...NavDarkTheme,
  colors: {
    ...NavDarkTheme.colors,
    primary: colors.purple,
    background: colors.bg,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.pink,
  },
};
