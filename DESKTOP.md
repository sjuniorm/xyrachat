# Xyra Chat — Desktop App (Tauri)

A thin native desktop shell (macOS / Windows / Linux) that **wraps the deployed
web app** in a native window with system tray, native notifications, an
unread badge, and auto-update. It does **not** fork the web app — the window
loads `https://xyra-chat.vercel.app` (production) or `http://localhost:3000`
(dev), so the browser + mobile experiences are unchanged.

- **Framework:** Tauri v2 (Rust core + system WebView).
- **Source:** [`src-tauri/`](src-tauri/) — `tauri.conf.json`, `Cargo.toml`,
  `src/lib.rs` (tray + close-to-tray + unread badge + updater), capabilities.
- **Web bridge:** [`lib/desktop/tauri.ts`](lib/desktop/tauri.ts) — detects the
  shell via `window.__TAURI__` and routes notifications + the badge natively,
  falling back to the browser everywhere else. Wired into
  [`components/inbox/notifications-watcher.tsx`](components/inbox/notifications-watcher.tsx).

## What's native
- **System tray** — Open / Check for Updates… / Quit. Closing the window
  **minimises to tray** (doesn't quit); double-click the tray icon (Windows)
  or use **Open** to restore.
- **Notifications** — inbound + assignment alerts use the OS notification
  centre (via `tauri-plugin-notification`).
- **Unread badge** — the inbox count is mirrored to the macOS dock / Windows
  taskbar (the `set_unread` command).
- **Auto-update** — on launch it silently checks GitHub Releases; the tray
  "Check for Updates…" does a manual check with a dialog. Updates download +
  install + relaunch (`tauri-plugin-updater`).
- **Window state** — size/position is remembered between launches.

## Prerequisites (one-time, on the build machine)
1. **Rust** — `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
   (https://tauri.app/start/prerequisites/ for the per-OS system deps:
   Xcode CLT on macOS, WebView2 + MSVC build tools on Windows).
2. The Tauri CLI is already a devDependency — `npm install` pulls it.
3. Icons are already generated in `src-tauri/icons/` (regenerate from a new
   source any time with `npm run tauri icon path/to/icon.png`).

## Run in development
```bash
npm run tauri dev
```
This runs `npm run dev` (Next.js on :3000) and opens the desktop window pointed
at `http://localhost:3000`. Hot-reload works; native features (tray, badge,
notifications) are live.

> First `cargo build` downloads + compiles the Rust crates (a few minutes).
> Because this machine had no Rust toolchain when the project was scaffolded,
> the Rust in `src-tauri/src/lib.rs` hasn't been compiled here — if `cargo`
> flags a version-specific API tweak on the first build, it'll be a one-line
> fix in `lib.rs`.

## Auto-update setup (before the first release)
The updater requires a signing keypair (Tauri refuses unsigned updates).
```bash
npm run tauri signer generate -- -w ~/.tauri/xyrachat.key
```
1. Copy the **public** key it prints into `src-tauri/tauri.conf.json` →
   `plugins.updater.pubkey` (replace `REPLACE_WITH_YOUR_TAURI_UPDATER_PUBLIC_KEY`).
2. Add the **private** key + its password as GitHub repo secrets:
   `TAURI_SIGNING_PRIVATE_KEY` (file contents) and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
3. **Never commit the private key.** If it's lost, existing installs can't be
   updated (they'd need a manual reinstall).

The updater endpoint is already set to
`https://github.com/sjuniorm/xyrachat/releases/latest/download/latest.json`.

## Build locally
```bash
# Updater artifacts are signed, so export the key first (or temporarily set
# bundle.createUpdaterArtifacts=false in tauri.conf.json for an unsigned test build):
export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/xyrachat.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"
npm run tauri build
```
Output: `.dmg` / `.app` (macOS), `.msi` + `.exe` (Windows), `.AppImage`/`.deb`
(Linux) under `src-tauri/target/release/bundle/`.

## Release (CI)
1. Bump `version` in `src-tauri/tauri.conf.json`.
2. Push a tag `desktop-vX.Y.Z` **or** run the **Desktop release** workflow
   manually (Actions tab).
3. [.github/workflows/desktop-release.yml](.github/workflows/desktop-release.yml)
   builds macOS (Apple Silicon + Intel) + Windows via `tauri-apps/tauri-action`,
   signs the updater artifacts, and creates a **draft** GitHub Release with the
   installers + `latest.json`.
4. Review the draft, then **publish** it — `latest.json` at `…/releases/latest/`
   then serves the update to existing installs.

## Code signing (for distribution without OS warnings — launch prep)
- **macOS:** Apple Developer account ($99/yr). Add secrets `APPLE_CERTIFICATE`
  (base64 .p12), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
  `APPLE_ID`, `APPLE_PASSWORD` (app-specific pw), `APPLE_TEAM_ID`. tauri-action
  signs + notarizes automatically when present.
- **Windows:** a code-signing certificate (EV cert avoids SmartScreen warnings).
  Configure `bundle.windows.certificateThumbprint` or Azure Key Vault signing.
- Until these are set, builds still work but produce **unsigned** installers
  (users see an "unidentified developer" / SmartScreen prompt).

## When the custom domain goes live (app.xyrachat.com)
Update in `src-tauri/tauri.conf.json`: `build.frontendDist` → the new URL, and
`src-tauri/capabilities/default.json` → add the new origin to `remote.urls`.
The updater endpoint (GitHub Releases) is unaffected.
