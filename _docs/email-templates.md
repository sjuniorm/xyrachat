# Supabase Auth email templates (branded)

Paste each HTML block into **Supabase Dashboard → Authentication → Emails →
Email Templates** (one tab per template). Set the **Subject** shown above each.
These match the in-app transactional brand (`lib/email/layout.tsx`): dark card,
glow wordmark, gradient button. Supabase Go-template variables (`{{ .ConfirmationURL }}`,
etc.) are left intact — keep them exactly.

> Reset Password is reachable today via `/forgot-password`, so brand it before
> launch. Confirm-signup is OFF in dev; turn it on for production.

---

## Shared notes
- All 4 share the same shell; only the heading + body copy + button label change.
- Email clients require inline styles + a system font stack (no external CSS/fonts).
- Footer links to support@xyrachat.com. Company: Mll Nexus Group SL.

---

## 1) Confirm signup  — Subject: `Confirm your email · Xyra Chat`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;margin:0;padding:32px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;">
      <tr><td style="padding:24px 32px 0;font-size:20px;font-weight:700;">
        <span style="color:#D882FF;">Xyra</span><span style="color:#FFFFFF;"> Chat</span>
      </td></tr>
      <tr><td style="padding:8px 32px 24px;">
        <h1 style="color:#fff;font-size:22px;font-weight:700;margin:8px 0 12px;">Confirm your email</h1>
        <p style="color:#A89BB8;font-size:15px;line-height:23px;margin:0 0 20px;">
          Welcome to Xyra Chat! Confirm your email address to activate your account and set up your workspace.
        </p>
        <a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#9333EA;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:10px;">Confirm email</a>
        <p style="color:#A89BB8;font-size:13px;line-height:20px;margin:20px 0 0;">If you didn't create a Xyra Chat account, you can ignore this email.</p>
      </td></tr>
      <tr><td style="border-top:1px solid rgba(255,255,255,0.08);padding:16px 32px 24px;">
        <p style="margin:0;font-size:12px;color:#A89BB8;line-height:18px;">Need help? Email <a href="mailto:support@xyrachat.com" style="color:#D882FF;">support@xyrachat.com</a>.</p>
        <p style="margin:8px 0 0;font-size:11px;color:#A89BB8;">© Xyra Chat · Mll Nexus Group SL · xyrachat.com</p>
      </td></tr>
    </table>
  </td></tr>
</table>
```

## 2) Magic Link  — Subject: `Your sign-in link · Xyra Chat`

Same shell as #1, with this `<td style="padding:8px 32px 24px;">` body:

```html
<h1 style="color:#fff;font-size:22px;font-weight:700;margin:8px 0 12px;">Your sign-in link</h1>
<p style="color:#A89BB8;font-size:15px;line-height:23px;margin:0 0 20px;">Click below to sign in to Xyra Chat. This link expires shortly and can only be used once.</p>
<a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#9333EA;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:10px;">Sign in to Xyra Chat</a>
<p style="color:#A89BB8;font-size:13px;line-height:20px;margin:20px 0 0;">Didn't request this? You can safely ignore this email.</p>
```

## 3) Reset Password  — Subject: `Reset your password · Xyra Chat`

Same shell, body:

```html
<h1 style="color:#fff;font-size:22px;font-weight:700;margin:8px 0 12px;">Reset your password</h1>
<p style="color:#A89BB8;font-size:15px;line-height:23px;margin:0 0 20px;">We received a request to reset your Xyra Chat password. Click below to choose a new one. This link expires shortly.</p>
<a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#9333EA;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:10px;">Reset password</a>
<p style="color:#A89BB8;font-size:13px;line-height:20px;margin:20px 0 0;">If you didn't request a reset, ignore this email — your password won't change.</p>
```

## 4) Change Email Address  — Subject: `Confirm your new email · Xyra Chat`

Same shell, body:

```html
<h1 style="color:#fff;font-size:22px;font-weight:700;margin:8px 0 12px;">Confirm your new email</h1>
<p style="color:#A89BB8;font-size:15px;line-height:23px;margin:0 0 20px;">Confirm this address to finish changing the email on your Xyra Chat account.</p>
<a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#9333EA;color:#fff;font-size:15px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:10px;">Confirm new email</a>
<p style="color:#A89BB8;font-size:13px;line-height:20px;margin:20px 0 0;">If you didn't request this change, contact support@xyrachat.com immediately.</p>
```

(The Invite-user template was branded in Week 4 — leave it as-is.)
