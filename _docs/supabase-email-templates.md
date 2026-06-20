# Supabase Auth — branded email templates

Paste these into **Supabase → Authentication → Emails → Templates**. One per tab.
Set the **Subject** + paste the **HTML** into the message body. Keep the
`{{ .ConfirmationURL }}` token EXACTLY — that's the action link; changing it
breaks auth. The link's destination is governed by your **Site URL** + the
`redirectTo` in code, so once Site URL = https://app.xyrachat.com all links point
to the app automatically.

> Logo: served from https://app.xyrachat.com/icon.png (already deployed).
> Dark, on-brand. Light fallbacks included for clients that strip backgrounds.

---

## Shared wrapper (the same shell wraps every template)

Each template below is already wrapped — just copy the whole block per template.
If you tweak the style, change it once here and re-apply.

---

## 1) Confirm signup
**Subject:** `Confirm your Xyra Chat account`

```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <img src="https://app.xyrachat.com/icon.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;letter-spacing:-0.01em;">Xyra Chat</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Confirm your email</h1>
          <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
            Welcome to Xyra Chat! Tap the button below to confirm your email and finish setting up your account.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="border-radius:10px;background-image:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Confirm email</a>
          </td></tr></table>
          <p style="color:#8A8398;font-size:12px;line-height:1.6;margin:0 0 8px;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#D882FF;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);margin-top:16px;">
          <p style="color:#6F6880;font-size:11px;line-height:1.5;margin:16px 0 0;text-align:center;">
            You're receiving this because someone signed up for Xyra Chat with this email. If it wasn't you, ignore this message.<br>
            Mll Nexus Group SL · Tenerife, Spain
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
```

---

## 2) Magic Link
**Subject:** `Your Xyra Chat sign-in link`

Same block as above, but swap the heading + paragraph:
```html
<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Sign in to Xyra Chat</h1>
<p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Tap below to sign in. This link works once and expires shortly.
</p>
```
…and button label `Sign in`.

---

## 3) Reset Password (Recovery)
**Subject:** `Reset your Xyra Chat password`

Swap the heading + paragraph + button label:
```html
<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Reset your password</h1>
<p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
  We got a request to reset your Xyra Chat password. Tap below to choose a new one. If you didn't ask for this, you can safely ignore this email.
</p>
```
…and button label `Set a new password`.

---

## 4) Invite user
**Subject:** `You've been invited to Xyra Chat`

Swap:
```html
<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">You're invited</h1>
<p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
  A teammate invited you to their Xyra Chat workspace. Tap below to accept and set your password.
</p>
```
…and button label `Accept invite`.

---

## 5) Change Email Address
**Subject:** `Confirm your new Xyra Chat email`

Swap:
```html
<h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Confirm your new email</h1>
<p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
  Tap below to confirm this as the new email for your Xyra Chat account. If you didn't request this, contact support@xyrachat.com.
</p>
```
…and button label `Confirm new email`.

---

## After pasting
1. Make sure **Site URL** (Authentication → URL Configuration) = `https://app.xyrachat.com`
   so the links resolve to the app.
2. Send yourself a test: trigger `/forgot-password` in the app → confirm the
   branded email arrives and the link logs you into `/reset-password`.
3. (Optional, better deliverability) Authentication → Emails → SMTP: point
   Supabase at your Resend SMTP creds so auth emails send from your domain
   instead of Supabase's shared sender — otherwise they may land in spam at scale.
