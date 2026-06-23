# Mobile app — submission checklist (Expo / EAS)

Status as of this pass: the app **builds + runs in Expo Go** and is wired to
production (`EXPO_PUBLIC_API_BASE_URL=https://app.xyrachat.com` in `eas.json` for
all three profiles). What remains is operator-gated — none of it needs code from
me; it needs your Expo / Apple / Google accounts. Apple review is the longest
pole (~1–3 days), so start it in parallel with Meta.

## Code state (done — no action)
- API base URL → `app.xyrachat.com` (eas.json: development/preview/production).
- Tauri desktop `frontendDist` → `app.xyrachat.com`.
- Sending text, AI Assist, Suggest-reply (with no-grounded-answer handling),
  templates, team chat, realtime, push registration — all implemented.
- All server domain refs are env-driven; setting `NEXT_PUBLIC_APP_URL` in Vercel
  switches them (see launch-checklist / domain switch).

## Operator steps (you)

### 1. Expo project + push
- [ ] `cd mobile && npx eas login`
- [ ] `npx eas init` — writes `extra.eas.projectId` into app.json. **Until this
      runs, push notifications no-op** (the client skips token registration
      without a projectId — by design, the rest of the app works).
- [ ] Confirm push works end-to-end once a dev build is installed.

### 2. SDK bump (before real builds)
- Currently pinned to **Expo SDK 54** so the test iPhone's stock Expo Go can open
  it. For store builds, bump to latest:
  - [ ] `cd mobile && npm install expo@latest && npx expo install --fix`
  - [ ] Re-test on device (the pin exists precisely because new SDKs change
        native modules — don't ship the bump untested).
  - [ ] Re-add `expo-image` to app.json `plugins` only if the new SDK supports
        its config plugin (it must NOT be there on SDK 54).

### 3. Store accounts + assets
- [ ] Apple Developer Program account ($99/yr) + App Store Connect app record
      (bundle `com.xyrachat.app`).
- [ ] Google Play Console account ($25 once) + app record (package
      `com.xyrachat.app`).
- [ ] App icon (1024×1024), adaptive icon, splash — brand assets exist in repo;
      confirm they meet each store's spec.
- [ ] Screenshots per device class (iPhone 6.7"/6.5", iPad if supported; Android
      phone/tablet). Capture from a real build.
- [ ] Store listing copy: name, subtitle, description, keywords, privacy policy
      URL (`app.xyrachat.com/privacy`), support URL.
- [ ] App privacy questionnaire (data collected: account info, messages — be
      accurate; we don't sell data).

### 4. Build + submit
- [ ] `eas build --platform ios --profile production`
- [ ] `eas build --platform android --profile production`
- [ ] `eas submit -p ios` / `eas submit -p android`
- [ ] Respond to review feedback (Apple often asks for a demo account — provide
      a seeded login + note the channels are connected).

## Deferred code (needs a device to verify — do when you have a dev build)
- **Send photos/files from mobile**: `expo-image-picker` is installed and the web
  `/api/channels/{provider}/send-media` routes accept the mobile JWT, but RN
  multipart upload + the routes' magic-byte validation must be tested on a real
  device before shipping — I won't push it blind. The composer attach button
  currently shows a "coming soon" alert.
- **Biometric login**: needs `expo-local-authentication` (not yet a dependency);
  a quick add once SDK is bumped — gate the persisted session behind FaceID/
  fingerprint on cold start.
