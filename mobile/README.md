# Xyra Chat — Mobile (Expo / React Native)

Companion app for agents: respond to conversations on the go. Shares the Xyra
brand + the same Supabase backend and Next.js API as the web app.

- **Stack:** Expo SDK 56, React Native 0.85, React 19, TypeScript, React
  Navigation v7, React Native Paper (themed), Supabase JS.
- **Auth:** Supabase email/password. Session persisted encrypted via
  `LargeSecureStore` (AES key in the device Keychain/Keystore, ciphertext in
  AsyncStorage). Auto-login on launch.
- **Realtime:** conversation list, threads, and the badge all use Supabase
  Realtime (RLS-scoped to the agent's org — multi-tenant safe by construction).
- **Sending:** posts to the web app's `/api/channels/{provider}/send` with the
  Supabase JWT as a Bearer token (the endpoints accept cookie *or* JWT — see
  `lib/supabase/route-auth.ts` on the web side).
- **Push:** Expo push tokens stored in `public.push_tokens`; the web webhook
  handlers wake the assigned agent on new inbound (`lib/push/notify.ts`).

## Run locally

```bash
cd mobile
cp .env.example .env        # fill EXPO_PUBLIC_* (public Supabase values + API URL)
npx expo start
```

Scan the QR with **Expo Go** (iOS/Android) for a quick look. Note:

- **Push notifications + secure store** require a **development build** (Expo Go
  can't issue push tokens on SDK 53+). Build one with EAS (below) or
  `npx expo run:ios` / `npx expo run:android` locally.
- `localhost` is not reachable from a physical phone. For local API testing set
  `EXPO_PUBLIC_API_BASE_URL` to your machine's LAN IP (e.g.
  `http://192.168.1.20:3000`). The default points at the deployed web app, which
  works from anywhere.

## First-time EAS setup

```bash
npm i -g eas-cli
eas login                   # your Expo account
eas init                    # creates the EAS project + writes extra.eas.projectId
```

`eas init` writes the `projectId` into `app.json` → `extra.eas.projectId`, which
`registerForPushNotifications()` needs to mint Expo push tokens. Until then push
registration no-ops gracefully (the rest of the app works).

## Build

```bash
# Internal/dev client (includes push + secure store, installable on devices):
eas build --profile development --platform ios
eas build --profile development --platform android

# Internal preview (release-like, shareable link):
eas build --profile preview --platform all

# Production store builds:
eas build --profile production --platform all
```

Public Supabase config is baked into each profile's `env` in `eas.json`
(publishable anon key + project URL — both are client-public, same values the
web app ships to browsers). The service-role key is **never** in the app.

## Submit to the stores (post-launch — see the project pre-launch checklist)

```bash
eas submit --profile production --platform ios       # App Store Connect
eas submit --profile production --platform android   # Google Play
```

Before submitting you'll need:

- **iOS:** Apple Developer account, an App Store Connect app record
  (bundle id `com.xyrachat.app`), and a push key (APNs) — EAS manages
  credentials interactively.
- **Android:** Google Play Console account, a service-account JSON for
  `eas submit`, and a Firebase project for FCM v1 (upload the FCM key to
  `expo.dev` → project → Credentials so Expo can deliver Android push).
- Real **app icon + splash** (replace the placeholders in `assets/`), store
  listing copy, screenshots, and the privacy policy URL (`/privacy` on web).

> Week 13 scope = app builds locally + EAS configured. The actual store
> submission + review prep lives in the post-launch roadmap.

## Project layout

```
App.tsx                     # providers (gesture-handler, safe-area, Paper, Auth,
                            #   NavigationContainer) + notification-tap deep link
src/
  theme.ts                  # Xyra brand tokens → Paper + Navigation themes
  lib/
    supabase.ts             # Supabase client (encrypted session, focus refresh)
    storage.ts              # LargeSecureStore (AES + Keychain + AsyncStorage)
    api.ts                  # sendMessage() → web /api/channels/*/send (JWT auth)
    push.ts                 # register/unregister Expo push token
    format.ts               # channel labels/icons, timeAgo, message previews
  auth/AuthContext.tsx      # session + profile + signIn/out + availability
  hooks/                    # useConversations, useThread, useMyAssigned (realtime)
  navigation/               # MainTabs + Inbox/Contacts stacks + nav ref
  screens/                  # Login, ConversationList, ChatDetail, Contacts,
                            #   ContactProfile, Notifications, Settings
  components/                # Avatar, ChannelBadge, ConversationRow,
                            #   MessageBubble, Skeleton, GradientButton
```
