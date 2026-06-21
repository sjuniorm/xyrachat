# Supabase Auth — branded email templates (copy-paste, all 5 complete)

Paste into **Supabase → Authentication → Emails → Templates** (one per tab). Set
the **Subject**, paste the **HTML** into the message body. Keep `{{ .ConfirmationURL }}`
EXACTLY — that's the action link; changing it breaks auth. The link destination
follows your **Site URL** (set it to https://app.xyrachat.com) + the code's redirectTo.

> Logo served from https://app.xyrachat.com/brand/logo-mark.png (static, 200).
> Note: Supabase's PREVIEW pane sandboxes external images so the logo looks
> broken there — it renders fine in the actually-sent email. Test by sending
> yourself one.

---

## 1) Confirm signup
**Subject:** `Confirm your Xyra Chat account`

```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
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
        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#6F6880;font-size:11px;line-height:1.5;margin:16px 0 0;text-align:center;">
            You're receiving this because someone signed up for Xyra Chat with this email. If it wasn't you, ignore this message.<br>
            Mll Nexus Group SL · Xyra Chat
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

```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;letter-spacing:-0.01em;">Xyra Chat</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Sign in to Xyra Chat</h1>
          <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
            Tap below to sign in. This link works once and expires shortly.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="border-radius:10px;background-image:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Sign in</a>
          </td></tr></table>
          <p style="color:#8A8398;font-size:12px;line-height:1.6;margin:0 0 8px;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#D882FF;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#6F6880;font-size:11px;line-height:1.5;margin:16px 0 0;text-align:center;">
            You're receiving this because someone requested a sign-in link for this email. If it wasn't you, ignore this message.<br>
            Mll Nexus Group SL · Xyra Chat
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
```

---

## 3) Reset Password
**Subject:** `Reset your Xyra Chat password`

```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;letter-spacing:-0.01em;">Xyra Chat</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Reset your password</h1>
          <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
            We got a request to reset your Xyra Chat password. Tap below to choose a new one. If you didn't ask for this, you can safely ignore this email.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="border-radius:10px;background-image:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Set a new password</a>
          </td></tr></table>
          <p style="color:#8A8398;font-size:12px;line-height:1.6;margin:0 0 8px;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#D882FF;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#6F6880;font-size:11px;line-height:1.5;margin:16px 0 0;text-align:center;">
            You're receiving this because a password reset was requested for this email. If it wasn't you, ignore this message.<br>
            Mll Nexus Group SL · Xyra Chat
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
```

---

## 4) Invite user
**Subject:** `You've been invited to Xyra Chat`

```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;letter-spacing:-0.01em;">Xyra Chat</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">You're invited</h1>
          <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
            A teammate invited you to their Xyra Chat workspace. Tap below to accept and set your password.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="border-radius:10px;background-image:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Accept invite</a>
          </td></tr></table>
          <p style="color:#8A8398;font-size:12px;line-height:1.6;margin:0 0 8px;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#D882FF;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#6F6880;font-size:11px;line-height:1.5;margin:16px 0 0;text-align:center;">
            You're receiving this because someone invited this email to a Xyra Chat workspace. If you weren't expecting it, ignore this message.<br>
            Mll Nexus Group SL · Xyra Chat
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
```

---

## 5) Change Email Address
**Subject:** `Confirm your new Xyra Chat email`

```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
        <tr><td style="padding:28px 32px 8px;text-align:center;">
          <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
          <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;letter-spacing:-0.01em;">Xyra Chat</div>
        </td></tr>
        <tr><td style="padding:8px 32px 0;">
          <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;text-align:center;">Confirm your new email</h1>
          <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 24px;text-align:center;">
            Tap below to confirm this as the new email for your Xyra Chat account. If you didn't request this, contact support@xyrachat.com.
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px;"><tr><td style="border-radius:10px;background-image:linear-gradient(135deg,#9333EA 0%,#EC4899 100%);">
            <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:13px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:10px;">Confirm new email</a>
          </td></tr></table>
          <p style="color:#8A8398;font-size:12px;line-height:1.6;margin:0 0 8px;text-align:center;">
            If the button doesn't work, copy this link:<br>
            <a href="{{ .ConfirmationURL }}" style="color:#D882FF;word-break:break-all;">{{ .ConfirmationURL }}</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);">
          <p style="color:#6F6880;font-size:11px;line-height:1.5;margin:16px 0 0;text-align:center;">
            You're receiving this because an email change was requested on your Xyra Chat account.<br>
            Mll Nexus Group SL · Xyra Chat
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</div>
```

---

## After pasting
1. Authentication → URL Configuration → **Site URL** = `https://app.xyrachat.com`.
2. Send yourself a test (`/forgot-password`) → the branded email should arrive and
   the link should log you into `/reset-password`.
3. (Optional, better deliverability) Authentication → Emails → SMTP → point at your
   Resend SMTP creds so auth emails send from your domain (avoids spam at scale).

---

# Security notification templates (the "Notify users when…" toggles)

Informational alerts — no action button. Paste each where Supabase shows its
editor for that security event. They don't rely on template variables, so they
render correctly regardless of which variables the event exposes.

## Password changed
**Subject:** `Your Xyra Chat password was changed`
```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;">Xyra Chat</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Your password was changed</h1>
        <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 20px;">The password on your Xyra Chat account was just changed. If this was you, no action is needed.</p>
        <p style="color:#8A8398;font-size:13px;line-height:1.6;margin:0 0 8px;">If this <strong>wasn't</strong> you, reset your password immediately at <a href="https://app.xyrachat.com/forgot-password" style="color:#D882FF;">app.xyrachat.com/forgot-password</a> and contact support@xyrachat.com.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#6F6880;font-size:11px;margin:16px 0 0;text-align:center;">Mll Nexus Group SL · Xyra Chat</p></td></tr>
    </table>
  </td></tr></table>
</div>
```

## Email address changed
**Subject:** `Your Xyra Chat email address was changed`
```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;">Xyra Chat</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Your email address was changed</h1>
        <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 20px;">The email address on your Xyra Chat account was just changed. If this was you, no action is needed.</p>
        <p style="color:#8A8398;font-size:13px;line-height:1.6;margin:0 0 8px;">If this <strong>wasn't</strong> you, contact <a href="mailto:support@xyrachat.com" style="color:#D882FF;">support@xyrachat.com</a> immediately.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#6F6880;font-size:11px;margin:16px 0 0;text-align:center;">Mll Nexus Group SL · Xyra Chat</p></td></tr>
    </table>
  </td></tr></table>
</div>
```

## Sign-in method linked
**Subject:** `A new sign-in method was added to your Xyra Chat account`
```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;">Xyra Chat</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">A new sign-in method was added</h1>
        <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 20px;">A new way to sign in (e.g. a social login) was linked to your Xyra Chat account. If this was you, no action is needed.</p>
        <p style="color:#8A8398;font-size:13px;line-height:1.6;margin:0 0 8px;">If this <strong>wasn't</strong> you, reset your password at <a href="https://app.xyrachat.com/forgot-password" style="color:#D882FF;">app.xyrachat.com/forgot-password</a> and contact support@xyrachat.com.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#6F6880;font-size:11px;margin:16px 0 0;text-align:center;">Mll Nexus Group SL · Xyra Chat</p></td></tr>
    </table>
  </td></tr></table>
</div>
```

## Sign-in method removed
**Subject:** `A sign-in method was removed from your Xyra Chat account`
```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;">Xyra Chat</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">A sign-in method was removed</h1>
        <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 20px;">A sign-in method was removed from your Xyra Chat account. If this was you, no action is needed.</p>
        <p style="color:#8A8398;font-size:13px;line-height:1.6;margin:0 0 8px;">If this <strong>wasn't</strong> you, reset your password at <a href="https://app.xyrachat.com/forgot-password" style="color:#D882FF;">app.xyrachat.com/forgot-password</a> and contact support@xyrachat.com.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#6F6880;font-size:11px;margin:16px 0 0;text-align:center;">Mll Nexus Group SL · Xyra Chat</p></td></tr>
    </table>
  </td></tr></table>
</div>
```

## MFA method added
**Subject:** `Two-factor authentication was enabled on your Xyra Chat account`
```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;">Xyra Chat</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Two-factor authentication enabled</h1>
        <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 20px;">2FA was added to your Xyra Chat account — nice, your account is more secure now. If this was you, no action is needed.</p>
        <p style="color:#8A8398;font-size:13px;line-height:1.6;margin:0 0 8px;">If this <strong>wasn't</strong> you, reset your password at <a href="https://app.xyrachat.com/forgot-password" style="color:#D882FF;">app.xyrachat.com/forgot-password</a> and contact support@xyrachat.com.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#6F6880;font-size:11px;margin:16px 0 0;text-align:center;">Mll Nexus Group SL · Xyra Chat</p></td></tr>
    </table>
  </td></tr></table>
</div>
```

## MFA method removed
**Subject:** `Two-factor authentication was removed from your Xyra Chat account`
```html
<div style="margin:0;padding:0;background:#0B0418;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0B0418;padding:32px 0;"><tr><td align="center">
    <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#1F1033;border:1px solid rgba(255,255,255,0.08);border-radius:16px;overflow:hidden;font-family:Inter,Arial,Helvetica,sans-serif;">
      <tr><td style="padding:28px 32px 8px;text-align:center;">
        <img src="https://app.xyrachat.com/brand/logo-mark.png" width="44" height="44" alt="Xyra Chat" style="border-radius:10px;display:inline-block;">
        <div style="color:#ffffff;font-size:18px;font-weight:700;margin-top:10px;">Xyra Chat</div>
      </td></tr>
      <tr><td style="padding:8px 32px 0;text-align:center;">
        <h1 style="color:#ffffff;font-size:22px;font-weight:700;margin:16px 0 8px;">Two-factor authentication removed</h1>
        <p style="color:#C9C2D6;font-size:15px;line-height:1.6;margin:0 0 20px;">2FA was removed from your Xyra Chat account. If this was you, no action is needed.</p>
        <p style="color:#8A8398;font-size:13px;line-height:1.6;margin:0 0 8px;">If this <strong>wasn't</strong> you, reset your password at <a href="https://app.xyrachat.com/forgot-password" style="color:#D882FF;">app.xyrachat.com/forgot-password</a> and contact support@xyrachat.com immediately.</p>
      </td></tr>
      <tr><td style="padding:16px 32px 28px;border-top:1px solid rgba(255,255,255,0.06);"><p style="color:#6F6880;font-size:11px;margin:16px 0 0;text-align:center;">Mll Nexus Group SL · Xyra Chat</p></td></tr>
    </table>
  </td></tr></table>
</div>
```
