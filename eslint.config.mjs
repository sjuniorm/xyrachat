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
]);

export default eslintConfig;
