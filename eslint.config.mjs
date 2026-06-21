import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Expo / React Native app is a separate package with its own toolchain.
    "mobile/**",
    "integrations/**",
    // The Tauri desktop shell (Rust + its own config).
    "src-tauri/**",
  ]),
  {
    rules: {
      // Stylistic-only + high-friction for a copy-heavy product (trips on every
      // apostrophe like "you're"). Quotes/apostrophes in JSX text render fine.
      "react/no-unescaped-entities": "off",
      // React Compiler optimization HINTS (not correctness bugs). They flag
      // idiomatic patterns — reset-state-on-prop-change, hydration catch-up,
      // Date.now() for a display countdown — that work fine. Kept as warnings
      // (visible, fixable incrementally) rather than hard-failing CI or forcing
      // ~20 risky refactors. The compiler still optimizes what it safely can.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);

export default eslintConfig;
