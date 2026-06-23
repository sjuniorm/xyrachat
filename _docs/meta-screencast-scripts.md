# Meta App Review — screencast scripts (record these, then submit)

Shot-by-shot scripts for each permission. Meta reviewers must SEE the full
round-trip: a real customer messages the connected business account → it arrives
in Xyra Chat → an agent replies → the customer receives it. "Just the UI" gets
rejected. Keep each clip 60–120s.

## Universal recording rules
- Record at 1280×720+; screen + the test phone (or a second window) both visible.
- **Show the browser URL bar = `https://app.xyrachat.com`** at the start — proves it's the live app you submitted.
- Add short on-screen captions for each step (most reviewers watch muted).
- Use REAL accounts: the business account is connected in Xyra Chat; the
  "customer" is a second phone/account you control.
- Do the connect step on camera where possible (proves your app obtains the
  permission legitimately), or show the already-connected channel in Settings.
- Keep test data clean — no unrelated PII on screen.

---

## 1) `whatsapp_business_messaging`  (app: "Xyra Chat")
**What the reviewer must see:** receive a WhatsApp message from a customer, show it in the inbox, reply, customer receives it, + the STOP opt-out.

**Scenes**
1. (0:00) Browser on `app.xyrachat.com` → **Settings → Channels** → show the connected WhatsApp number (name + phone-number-id visible). Caption: "Business connects its own WhatsApp number."
2. (0:10) Split to the phone: from a personal WhatsApp, send "Hi, do you have this in size M?" to the business number.
3. (0:18) Back to Xyra Chat **Inbox** → the message appears in real time in the conversation list + thread. Caption: "Inbound WhatsApp message arrives in the unified inbox."
4. (0:30) Agent types a reply in the composer ("Yes! We have size M in stock 🙂") → Send.
5. (0:38) Phone shows the reply delivered in WhatsApp. Caption: "Agent reply delivered to the customer."
6. (0:50) From the phone, send **"STOP"**. Show Xyra Chat auto-sends the opt-out confirmation + the contact is flagged opted-out. Caption: "STOP opt-out handled automatically."
7. (1:05) (Optional) Send "START" to show re-subscribe. End.

---

## 2) `whatsapp_business_management`  (app: "Xyra Chat")
**What the reviewer must see:** create + submit a WhatsApp message template and read its status (the management API in use).

**Scenes**
1. (0:00) `app.xyrachat.com` → **Templates** → "New template".
2. (0:08) Build a UTILITY template: name `order_update`, category UTILITY, a body like "Hi {{1}}, your order {{2}} has shipped." → add example values → **Submit**.
3. (0:25) Show it appear in the Templates list as **"Pending review"**. Caption: "Template submitted to Meta via the management API."
4. (0:35) Click **"Sync from Meta"** → show the status field refresh from Meta (Pending/Approved). Caption: "We read template status back from Meta."
5. (0:45) (If available) show the connect flow reading the WABA's phone numbers. End.

---

## 3) `pages_messaging`  (Messenger — app: "Xyra Chat")
**What the reviewer must see:** receive a Facebook Page message, show it, reply, customer receives.

**Scenes**
1. (0:00) `app.xyrachat.com` → **Settings → Channels → Add channel → Messenger** → connect the Page (Facebook Login page-picker, or paste the Page token) → show "subscribed" success. Caption: "Business connects its Facebook Page."
2. (0:15) From a second Facebook account, message the Page ("Hi, are you open today?").
3. (0:25) Xyra Chat inbox shows it arrive. Caption: "Page message in the unified inbox."
4. (0:35) Agent replies → Send.
5. (0:43) Messenger shows the reply delivered. Caption: "Reply delivered via the Page." End.

---

## 4) `instagram_business_manage_messages` (+ `instagram_business_basic`)  (app: "Xyra Chat-IG")
**What the reviewer must see:** connect an IG professional account, receive a DM, reply, + (nice) a story reply / reaction.

**Scenes**
1. (0:00) `app.xyrachat.com` → **Settings → Channels → Add channel → Instagram** → "Continue with Instagram" → Instagram Business Login → authorize → show the connected account (username + avatar). Caption: "Business connects its Instagram professional account (instagram_business_basic reads id/username/avatar)."
2. (0:18) From a second Instagram account, DM the business account ("Hey, what are your prices?").
3. (0:28) Xyra Chat inbox shows the DM. Caption: "Instagram DM in the unified inbox."
4. (0:38) Agent replies → Send → IG shows it delivered.
5. (0:50) (Nice-to-have) reply to one of the business's stories from the customer account → show the story-reply context render in Xyra Chat; tap 👍 reaction → show the reaction chip. End.

---

## After recording
- Upload each clip in the matching permission's App Review request.
- Paste the justification text from `_docs/meta-app-review-submission.md` (§2–4) into each "How will you use this permission?" box.
- Put demo creds + the connected test number/account in the "Notes for reviewer" box.
- Flip each app to **Live mode** before final submit.
- Submit "Xyra Chat" (WA + Messenger perms) and "Xyra Chat-IG" (IG perms) separately.
