import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// How emails leave the server:
//  1. RESEND_API_KEY set  -> Resend's HTTPS API (works on Render's free plan, which blocks SMTP ports)
//  2. EMAIL_USER/EMAIL_PASS set -> Gmail SMTP (old way, kept as a fallback)
//  3. neither -> nothing is sent; every function logs "skipped" and the app carries on as before
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const hasEmailCreds = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);

const transporter = !RESEND_API_KEY && hasEmailCreds
  ? nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })
  : null;

export const emailEnabled = Boolean(RESEND_API_KEY || transporter);

// With Resend the sender must be on the verified domain, so the old EMAIL_FROM (a Gmail address)
// is not used for it: RESEND_FROM, or no-reply@bazariomarketplace.shop.
const DEFAULT_FROM = RESEND_API_KEY
  ? process.env.RESEND_FROM || 'Bazario <no-reply@bazariomarketplace.shop>'
  : process.env.EMAIL_FROM ||
    (process.env.EMAIL_USER
      ? `"Bazario Support" <${process.env.EMAIL_USER}>`
      : '"Bazario Support" <noreply@bazario.com>');
// Optional: where a seller's "Reply" goes (e.g. support@bazariomarketplace.shop once that inbox exists)
const REPLY_TO = (process.env.EMAIL_REPLY_TO || '').trim();

// Public site address used for links inside emails
const SITE_URL = (process.env.CLIENT_URL || 'https://www.bazariomarketplace.shop').replace(/\/+$/, '');

/** Sends one email through Resend (or SMTP). Throws on failure; callers decide whether that matters. */
async function deliver({ to, subject, html, text, attachments }) {
  if (RESEND_API_KEY) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: DEFAULT_FROM,
          to: [to],
          subject,
          html,
          ...(text ? { text } : {}),
          ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
          // [{ filename, content: Buffer }] -> Resend wants base64 text
          ...(attachments?.length ? { attachments: attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.content).toString('base64') })) } : {}),
        }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`Resend ${res.status}: ${data?.message || data?.name || 'send failed'}`);
      return { messageId: data?.id };
    } finally {
      clearTimeout(timer);
    }
  }
  const info = await transporter.sendMail({ from: DEFAULT_FROM, to, subject, html, ...(text ? { text } : {}), ...(REPLY_TO ? { replyTo: REPLY_TO } : {}), ...(attachments?.length ? { attachments } : {}) });
  return { messageId: info.messageId };
}

/**
 * Base Email Wrapper with Responsive Styling & Professional Branding
 */
// Names and store names are typed by visitors: written into an email as plain text, never as
// HTML (otherwise a "name" could put a fake link or button into an email sent from this store).
const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function getEmailLayout({ title, preheader, bodyContent }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; color: #0f172a; }
    .email-container { max-width: 580px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; }
    .email-header { background: #0f172a; padding: 26px 30px; text-align: center; }
    .brand-logo { font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: -0.5px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
    .brand-accent { color: #f59e0b; }
    .brand-tag { font-size: 11px; background: rgba(255,255,255,0.15); color: #94a3b8; padding: 3px 8px; border-radius: 20px; font-weight: 700; text-transform: uppercase; margin-left: 8px; letter-spacing: 0.5px; }
    .email-body { padding: 32px 30px; line-height: 1.6; font-size: 14.5px; color: #334155; }
    .email-heading { font-size: 20px; font-weight: 800; color: #0f172a; margin-top: 0; margin-bottom: 12px; }
    .otp-card { background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%); border: 2px dashed #cbd5e1; border-radius: 10px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', monospace; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #0f172a; margin: 6px 0; display: inline-block; padding: 4px 12px; background: #ffffff; border-radius: 6px; border: 1px solid #e2e8f0; }
    .otp-expiry { font-size: 12px; color: #64748b; font-weight: 600; margin-top: 6px; }
    .btn-action { display: inline-block; background: #0f172a; color: #ffffff !important; text-decoration: none; padding: 13px 26px; border-radius: 8px; font-weight: 700; font-size: 14px; margin: 18px 0; }
    .btn-action:hover { background: #1e293b; }
    .security-notice { background: #fffbeb; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 6px; margin: 24px 0 10px; font-size: 12.5px; color: #92400e; line-height: 1.5; }
    .email-footer { background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; line-height: 1.5; }
    .footer-links { margin-bottom: 8px; }
    .footer-links a { color: #64748b; text-decoration: none; margin: 0 6px; }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${preheader || title}
  </div>
  <div class="email-container">
    <div class="email-header">
      <div class="brand-logo">
        BAZARIO<span class="brand-accent">.</span>
        <span class="brand-tag">E-Commerce Ecosystem</span>
      </div>
    </div>
    <div class="email-body">
      ${bodyContent}
    </div>
    <div class="email-footer">
      <div class="footer-links">
        <a href="${SITE_URL}">Storefront</a> •
        <a href="${SITE_URL}/seller/login">Seller Central</a> •
        <a href="${SITE_URL}/page/privacy">Privacy Policy</a>
      </div>
      <p style="margin: 0;">© ${new Date().getFullYear()} Bazario Global Commerce. All rights reserved.</p>
      <p style="margin: 8px 0 0; font-size: 11px; color: #a3aab5;">Please do not reply to this email — this address does not accept replies. For help, use Support chat in Seller Central.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * 1. Send 6-Digit Email Verification OTP (Customer or Seller Registration)
 */
export async function sendVerificationOtpEmail({ to, name = 'User', otp, role = 'Customer' }) {
  if (!emailEnabled) {
    console.warn(`[Email-Service] Skipped sending verification OTP to ${to} (RESEND_API_KEY not set).`);
    return { success: false, skipped: true };
  }
  try {
    const roleLabel = role === 'seller' ? 'Seller Merchant Hub' : 'Customer Account';
    const bodyContent = `
      <h2 class="email-heading">Verify Your Email Address 🔐</h2>
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>Thank you for signing up on Bazario ${roleLabel}. To complete your email verification, please enter the one-time verification code (OTP) below:</p>
      
      <div class="otp-card">
        <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">One-Time Verification Code</span>
        <div class="otp-code">${otp}</div>
        <div class="otp-expiry">⏱️ Valid for 10 minutes (Single Use)</div>
      </div>

      <div class="security-notice">
        <b>⚠️ Security Notice:</b> Never share this OTP with anyone, including Bazario support agents. Our team will never ask for your verification code.
      </div>
      
      <p style="font-size: 13px; color: #64748b; margin-top: 20px;">If you did not request this registration, please ignore this email.</p>
    `;

    const html = getEmailLayout({
      title: `Bazario Verification Code: ${otp}`,
      preheader: `Your verification code is ${otp}. Valid for 10 minutes.`,
      bodyContent,
    });

    const info = await deliver({
      to,
      subject: `[Bazario] ${otp} is your verification code`,
      html,
    });

    console.log(`[Email-Sent] Verification OTP to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email-Error] Failed to send verification OTP to ${to}:`, error);
    throw error;
  }
}

/**
 * 2. Send Password Reset Email (Direct Link + 6-Digit OTP)
 */
export async function sendPasswordResetEmail({ to, name = 'User', resetUrl, otp, role = 'user' }) {
  if (!emailEnabled) {
    console.warn(`[Email-Service] Skipped sending password reset to ${to} (RESEND_API_KEY not set).`);
    return { success: false, skipped: true };
  }
  try {
    const roleLabel = role === 'seller' ? 'Merchant Store' : role === 'admin' ? 'Super Admin' : 'Customer Account';
    const bodyContent = `
      <h2 class="email-heading">Password Reset Request 🔑</h2>
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>We received a request to reset the password for your Bazario ${roleLabel} (<code>${esc(to)}</code>).</p>
      
      <p style="margin-bottom: 6px;">You can reset your password directly using the secure link below:</p>
      
      <div style="text-align: center;">
        <a href="${resetUrl}" class="btn-action" target="_blank">RESET MY PASSWORD →</a>
      </div>

      ${otp ? `
      <div class="otp-card">
        <span style="font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; display: block;">Or Enter 6-Digit Reset Code</span>
        <div class="otp-code">${otp}</div>
        <div class="otp-expiry">⏱️ Code expires in 20 minutes</div>
      </div>
      ` : ''}

      <div class="security-notice">
        <b>🔒 Security Tip:</b> If you did not initiate this password recovery request, your account is still secure. You can safely disregard this email or update your password if you suspect unauthorized access.
      </div>
    `;

    const html = getEmailLayout({
      title: `Reset your Bazario Password`,
      preheader: `Click here to reset your Bazario account password.`,
      bodyContent,
    });

    const info = await deliver({
      to,
      subject: `[Bazario] Password Reset Request`,
      html,
    });

    console.log(`[Email-Sent] Password reset to ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email-Error] Failed to send password reset email to ${to}:`, error);
    throw error;
  }
}

/**
 * 3. Send Welcome Email Upon Successful Verification
 */
export async function sendWelcomeEmail({ to, name = 'User', role = 'Customer' }) {
  if (!emailEnabled) {
    console.warn(`[Email-Service] Skipped sending welcome email to ${to} (RESEND_API_KEY not set).`);
    return { success: false, skipped: true };
  }
  try {
    const isSeller = role === 'seller';
    const bodyContent = `
      <h2 class="email-heading">Welcome to Bazario! 🎉</h2>
      <p>Hello <b>${esc(name)}</b>,</p>
      ${isSeller ? `
      <p>Thank you for registering your store on Bazario. Your seller application has been received and is now under review.</p>
      <p>We will email you as soon as your store is approved. You can log in to Seller Central at any time to check your status or talk to Support.</p>
      <div style="text-align: center;">
        <a href="${SITE_URL}/seller/login" class="btn-action">GO TO SELLER HUB →</a>
      </div>
      ` : `
      <p>Your email has been successfully verified! We are excited to have you on the Bazario platform.</p>
      <p>You can now browse thousands of products, enjoy real-time order tracking, and experience instant checkout.</p>
      <div style="text-align: center;">
        <a href="${SITE_URL}/shop" class="btn-action">START SHOPPING →</a>
      </div>
      `}
    `;

    const html = getEmailLayout({
      title: `Welcome to Bazario!`,
      preheader: `Your account is ready. Welcome to Bazario!`,
      bodyContent,
    });

    await deliver({
      to,
      subject: isSeller ? `[Bazario] We received your seller application` : `[Bazario] Welcome aboard, ${name}! 🎉`,
      html,
    });
  } catch (error) {
    console.error(`[Email-Error] Failed to send welcome email to ${to}:`, error);
  }
}

/**
 * 4. Send Seller Approval Email Notification
 */
export async function sendSellerApprovalEmail({ to, name, storeName }) {
  if (!emailEnabled) {
    console.warn(`[Email-Service] Skipped sending seller approval email to ${to} (RESEND_API_KEY not set).`);
    return { success: false, skipped: true };
  }
  try {
    const bodyContent = `
      <h2 class="email-heading" style="color: #16a34a;">Congratulations! Your Merchant Store is Approved 🚀</h2>
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>Great news! Your merchant store <b>"${esc(storeName)}"</b> has been reviewed and approved by our team.</p>
      
      <div style="background: #f0fdf4; border: 1.5px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 18px 0;">
        <b style="color: #166534; display: block; margin-bottom: 6px;">✨ What's Next?</b>
        <ul style="margin: 0; padding-left: 18px; color: #166534; font-size: 13.5px;">
          <li>Log in to your Seller Central portal.</li>
          <li>Fund your merchant wallet to start locking wholesale order costs.</li>
          <li>Fulfill orders and earn automatic 20% profit margins on customer delivery.</li>
        </ul>
      </div>

      <div style="text-align: center;">
        <a href="${SITE_URL}/seller/login" class="btn-action" style="background: #16a34a;">LOG IN TO SELLER CENTRAL →</a>
      </div>
    `;

    const html = getEmailLayout({
      title: `Merchant Store Approved: ${esc(storeName)}`,
      preheader: `Your seller application has been approved. Start selling now!`,
      bodyContent,
    });

    await deliver({
      to,
      subject: `[Bazario] Your Merchant Store "${storeName}" is Approved! 🚀`,
      html,
    });
  } catch (error) {
    console.error(`[Email-Error] Failed to send seller approval email to ${to}:`, error);
  }
}

/* ───────────────────────── Seller emails: shared building blocks ───────────────────────── */

const TONES = {
  success: { main: '#16a34a', soft: '#f0fdf4', line: '#bbf7d0', text: '#166534' },
  warning: { main: '#d97706', soft: '#fffbeb', line: '#fde68a', text: '#92400e' },
  danger: { main: '#dc2626', soft: '#fef2f2', line: '#fecaca', text: '#991b1b' },
  diamond: { main: '#7c3aed', soft: '#f5f3ff', line: '#ddd6fe', text: '#5b21b6' },
  info: { main: '#0f172a', soft: '#f8fafc', line: '#e2e8f0', text: '#334155' },
};
const toneOf = (title = '') => {
  const t = String(title).trim();
  if (/^(✅|🎉|🚀|🏆|🔓)/u.test(t)) return 'success';
  if (/^(❌|⛔|🚫)/u.test(t)) return 'danger';
  if (/^⚠️/u.test(t)) return 'warning';
  if (/^💎/u.test(t)) return 'diamond';
  return 'info';
};
const money = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const d = Number.isInteger(v) ? 0 : 2;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};
/** Sellers are in India: deadlines are shown in IST. */
export const fmtIST = (d) =>
  `${new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })} IST`;
const sellerUrl = (link = '/seller') => `${SITE_URL}${String(link || '').startsWith('/') ? link : '/seller'}`;

const badge = (tone, label) => {
  const c = TONES[tone] || TONES.info;
  return `<div style="display:inline-block;background:${c.soft};color:${c.main};border:1px solid ${c.line};border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;margin-bottom:12px;">${label}</div>`;
};
const heading = (tone, text) => `<h2 class="email-heading" style="color:${(TONES[tone] || TONES.info).main === '#0f172a' ? '#0f172a' : (TONES[tone] || TONES.info).main};">${text}</h2>`;
const button = (tone, label, url) => {
  const c = TONES[tone] || TONES.info;
  return `<div style="text-align:center;"><a href="${url}" class="btn-action" target="_blank" style="background:${c.main};">${label}</a></div>`;
};
const callout = (tone, html) => {
  const c = TONES[tone] || TONES.info;
  return `<div style="background:${c.soft};border:1.5px solid ${c.line};border-left:4px solid ${c.main};border-radius:8px;padding:14px 16px;margin:18px 0;color:${c.text};font-size:13.5px;line-height:1.55;">${html}</div>`;
};
const list = (items) => `<ul style="margin:6px 0 0;padding-left:18px;">${items.filter(Boolean).map((i) => `<li style="margin:4px 0;">${i}</li>`).join('')}</ul>`;
/** Up to 3 number tiles in a row (a table, so every email app shows them side by side). */
const stats = (items) => {
  const cells = items
    .filter(Boolean)
    .map((it) => {
      const c = TONES[it.tone] || TONES.info;
      return `<td style="width:${Math.floor(100 / items.filter(Boolean).length)}%;padding:4px;vertical-align:top;"><div style="background:${c.soft};border:1px solid ${c.line};border-radius:10px;padding:12px 8px;text-align:center;"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.3px;">${it.label}</div><div style="font-size:22px;font-weight:900;color:${c.main};margin-top:4px;line-height:1.2;">${it.value}</div>${it.sub ? `<div style="font-size:11.5px;color:#64748b;margin-top:3px;">${it.sub}</div>` : ''}</div></td>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border-collapse:collapse;"><tr>${cells}</tr></table>`;
};
/** A progress bar (perfect-health bonus week). */
const progress = (tone, pct) => {
  const c = TONES[tone] || TONES.info;
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 2px;border-collapse:collapse;"><tr><td style="background:#e2e8f0;border-radius:999px;height:10px;padding:0;"><div style="width:${w}%;background:${c.main};height:10px;border-radius:999px;"></div></td></tr></table>`;
};
const rows = (pairs) =>
  `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0;border-collapse:collapse;font-size:13.5px;">${pairs
    .filter(Boolean)
    .map(([k, v]) => `<tr><td style="padding:8px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">${k}</td><td style="padding:8px 0;text-align:right;font-weight:700;color:#0f172a;border-bottom:1px solid #f1f5f9;">${v}</td></tr>`)
    .join('')}</table>`;

/** Wraps a seller email, sends it, never throws (a failed email must not break anything). */
async function sendSellerEmail({ to, subject, preheader, bodyContent, text, attachments }) {
  if (!emailEnabled) return { success: false, skipped: true };
  try {
    const html = getEmailLayout({ title: esc(subject), preheader: esc(preheader || subject), bodyContent });
    const info = await deliver({ to, subject: `[Bazario] ${subject}`, html, text, attachments });
    console.log(`[Email-Sent] ${subject} -> ${to} (MessageId: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[Email-Error] "${subject}" to ${to} failed:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 5. Seller notification email — the same title / text the seller gets in the app
 *    (deposit / withdrawal result, official warning …). Colour follows the title's symbol.
 */
export async function sendSellerNotificationEmail({ to, name = 'Seller', title, body = '', link = '/seller' }) {
  const tone = toneOf(title);
  const cleanTitle = String(title || 'Bazario update').replace(/\s+/g, ' ').trim();
  const paragraphs = String(body || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${esc(l)}</p>`)
    .join('');
  const bodyContent = `
      ${heading(tone, esc(cleanTitle))}
      <p>Hello <b>${esc(name)}</b>,</p>
      ${tone === 'info' ? paragraphs : callout(tone, paragraphs.replace(/<p>/g, '<p style="margin:4px 0;">'))}
      ${button(tone, 'OPEN SELLER CENTRAL →', sellerUrl(link))}`;
  const text = `Hello ${name},\n\n${cleanTitle}\n\n${String(body || '').trim()}\n\nOpen Seller Central: ${sellerUrl(link)}`;
  return sendSellerEmail({ to, subject: cleanTitle, preheader: String(body || cleanTitle).slice(0, 140), bodyContent, text });
}

/** 6. Registration: the application was received and will be reviewed within 24 hours. */
export async function sendSellerApplicationEmail({ to, name = 'Seller', storeName = '' }) {
  const bodyContent = `
      ${badge('info', '📋 Application received')}
      ${heading('info', 'Thank you for applying to sell on Bazario!')}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>We have received the seller application for your store${storeName ? ` <b>"${esc(storeName)}"</b>` : ''}. Our team will review your details and documents <b>within 24 hours</b>.</p>
      ${callout('info', `<b>What happens next?</b>${list([
        'We review your application and documents.',
        'As soon as your store is approved, we will send you an email.',
        'You can then log in to Seller Central and start selling.',
      ])}`)}
      <p>You can log in to Seller Central at any time to check your status or talk to our Support team.</p>
      ${button('info', 'GO TO SELLER CENTRAL →', `${SITE_URL}/seller/login`)}`;
  const text = `Hello ${name},\n\nWe have received your seller application${storeName ? ` for "${storeName}"` : ''}. Our team will review it within 24 hours and email you as soon as your store is approved.\n\nSeller Central: ${SITE_URL}/seller/login`;
  return sendSellerEmail({ to, subject: 'We received your seller application', preheader: 'Your store will be reviewed within 24 hours.', bodyContent, text });
}

/** 7. Store approved — straight to the Seller Central login. */
export async function sendSellerApprovedEmail({ to, name = 'Seller', storeName = '', profitRate = 20, confirmHours = 48, bonus = null }) {
  const loginUrl = `${SITE_URL}/seller/login`;
  const bodyContent = `
      ${badge('success', '✅ Approved')}
      ${heading('success', 'Your store is approved! 🚀')}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>Great news! Your store${storeName ? ` <b>"${esc(storeName)}"</b>` : ''} has been reviewed and approved. You can log in to Seller Central now and start selling.</p>
      ${stats([
        { label: 'Profit per order', value: `${profitRate}%`, tone: 'success', sub: 'on every order' },
        { label: 'Time to confirm', value: `${confirmHours}h`, tone: 'info', sub: 'per order' },
        bonus?.amount > 0 ? { label: 'Weekly bonus', value: money(bonus.amount), tone: 'success', sub: `${bonus.days} days at 100/100` } : null,
      ])}
      ${callout('success', `<b>Get started in 3 steps</b>${list([
        'Log in to Seller Central.',
        'Deposit to your wallet so you can confirm orders.',
        `Confirm every new order within ${confirmHours} hours to keep your account health at 100.`,
      ])}`)}
      ${button('success', 'LOG IN TO SELLER CENTRAL →', loginUrl)}`;
  const text = `Hello ${name},\n\nYour store${storeName ? ` "${storeName}"` : ''} is approved. Log in to Seller Central: ${loginUrl}\n\nProfit per order: ${profitRate}%. Confirm every order within ${confirmHours} hours.`;
  return sendSellerEmail({ to, subject: 'Your store is approved! Log in to Seller Central', preheader: 'Your store is approved. Log in and start selling.', bodyContent, text });
}

/**
 * 8. Order confirmation warning — orders past their warning time, what is at stake
 *    (health score, freeze, the running bonus week, the level, wallet shortfall).
 *    `stake` is healthEngine.atStake().
 */
export async function sendOrderWarningEmail({ to, name = 'Seller', stake }) {
  const orders = (stake?.orders || []).filter((o) => o.stage === 'warning');
  if (!orders.length) return { success: false, skipped: true };
  const first = orders.reduce((a, o) => (new Date(o.deadlineAt) < new Date(a.deadlineAt) ? o : a), orders[0]);
  const hoursLeft = Math.max(1, Math.round((new Date(first.deadlineAt).getTime() - Date.now()) / 3600000));
  const many = orders.length > 1;
  const b = stake.bonus;
  const lv = stake.level;

  const orderRows = rows(orders.map((o) => [`Order #${esc(o.orderNumber)}`, `${money(o.value)} · confirm by ${fmtIST(o.deadlineAt)}`]));
  const atRisk = [
    `Your account health drops from <b>${stake.score}/100</b> to about <b>${stake.scoreIfMissed}/100</b> (${stake.pointsAtRisk} points).`,
    stake.freeze ? '<b>Your store will be frozen</b> — no withdrawals and no store changes until Support unfreezes it.' : '',
    b ? `Your <b>${money(b.amount)} perfect-health bonus</b> week restarts from day 1.` : '',
    lv ? `Your level <b>${esc(lv.icon)} ${esc(lv.label)}</b> drops${lv.dropTo ? ` to <b>${esc(lv.dropTo.icon)} ${esc(lv.dropTo.label)}</b>` : ''}.` : '',
  ];
  const bonusBox = b
    ? callout('success', `<b>🏆 Your ${money(b.amount)} bonus is on its way</b><br>Day <b>${b.day} of ${b.days}</b> at 100/100 — ${Math.max(0, b.days - b.day)} day${b.days - b.day === 1 ? '' : 's'} to go (${fmtIST(b.endsAt)}).${progress('success', (b.day / b.days) * 100)}<span style="font-size:12px;">Confirm on time and keep it!</span>`)
    : '';
  const walletBox =
    stake.shortBy > 0
      ? callout('danger', `<b>💳 Your wallet is short by ${money(stake.shortBy)}</b><br>These orders need ${money(stake.value)}, your balance is ${money(stake.balance)}${stake.waitingDeposits > 0 ? ` (+ ${money(stake.waitingDeposits)} deposit waiting)` : ''}. Deposit now so you can confirm in time.`)
      : '';
  const bodyContent = `
      ${badge('warning', `⏰ ${hoursLeft} hour${hoursLeft === 1 ? '' : 's'} left`)}
      ${heading('warning', many ? `${orders.length} orders are waiting for your confirmation` : `Order #${esc(first.orderNumber)} is waiting for your confirmation`)}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>${many ? 'These orders have' : 'This order has'} been waiting for more than <b>${stake.warnHours} hours</b>. Please confirm ${many ? 'them' : 'it'} before <b>${fmtIST(first.deadlineAt)}</b>.</p>
      ${orderRows}
      ${stats([
        { label: 'Health now', value: `${stake.score}`, tone: stake.score >= 75 ? 'success' : stake.score >= 60 ? 'warning' : 'danger', sub: 'out of 100' },
        { label: 'If you miss it', value: `${stake.scoreIfMissed}`, tone: 'danger', sub: `${stake.pointsAtRisk} points` },
        { label: 'Time left', value: `${hoursLeft}h`, tone: 'warning', sub: 'to confirm' },
      ])}
      ${walletBox}
      ${bonusBox}
      ${callout('danger', `<b>If ${many ? 'they are' : 'it is'} not confirmed in time:</b>${list(atRisk)}`)}
      ${button('warning', 'CONFIRM MY ORDERS NOW →', sellerUrl('/seller/orders'))}`;
  const text = `Hello ${name},\n\n${orders.map((o) => `Order #${o.orderNumber} (${money(o.value)}) — confirm by ${fmtIST(o.deadlineAt)}`).join('\n')}\n\nIf not confirmed in time: health ${stake.score}/100 -> about ${stake.scoreIfMissed}/100${stake.freeze ? ', and your store will be frozen' : ''}.${b ? ` Your ${money(b.amount)} bonus week (day ${b.day} of ${b.days}) restarts.` : ''}${stake.shortBy > 0 ? `\nYour wallet is short by ${money(stake.shortBy)} — deposit now.` : ''}\n\nConfirm now: ${sellerUrl('/seller/orders')}`;
  return sendSellerEmail({
    to,
    subject: many ? `⚠️ ${orders.length} orders need confirmation — ${hoursLeft}h left` : `⚠️ Order #${first.orderNumber} needs confirmation — ${hoursLeft}h left`,
    preheader: `Confirm before ${fmtIST(first.deadlineAt)} to avoid a health penalty and a store freeze.`,
    bodyContent,
    text,
  });
}

/** 9. Store frozen automatically (an order was not confirmed by its deadline). */
export async function sendStoreFrozenEmail({ to, name = 'Seller', orderNumber, confirmHours, scoreBefore, score, points, bonusLost = null, levelChange = null }) {
  const bodyContent = `
      ${badge('danger', '🚫 Store frozen')}
      ${heading('danger', 'Your store has been frozen')}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>Order <b>#${esc(orderNumber)}</b> was not confirmed within <b>${confirmHours} hours</b>, so our monitoring system has frozen your store.</p>
      ${stats([
        Number.isFinite(scoreBefore) ? { label: 'Health before', value: `${scoreBefore}`, tone: 'info', sub: 'out of 100' } : null,
        { label: 'Health now', value: `${score}`, tone: 'danger', sub: 'out of 100' },
        Number.isFinite(points) ? { label: 'Penalty', value: `${points}`, tone: 'danger', sub: 'points' } : null,
      ])}
      ${callout('danger', `<b>While your store is frozen:</b>${list([
        'You can still log in, see your orders and wallet.',
        'You can still deposit and confirm pending orders.',
        'You cannot withdraw or change products, coupons, shipping or store settings.',
        bonusLost ? `Your ${money(bonusLost.amount)} perfect-health bonus week (day ${bonusLost.day} of ${bonusLost.days}) has restarted.` : '',
        levelChange ? esc(levelChange) : '',
      ])}`)}
      ${callout('info', `<b>What to do now</b>${list(['Confirm your waiting orders right away (deposit first if your wallet is short).', 'Then contact Support in Seller Central to review your store.'])}`)}
      ${button('danger', 'CONTACT SUPPORT →', sellerUrl('/seller/support'))}`;
  const text = `Hello ${name},\n\nYour store has been frozen because order #${orderNumber} was not confirmed within ${confirmHours} hours. Account health is now ${score}/100.\nConfirm your waiting orders and contact Support: ${sellerUrl('/seller/support')}`;
  return sendSellerEmail({ to, subject: '🚫 Your store has been frozen', preheader: `Order #${orderNumber} was not confirmed within ${confirmHours} hours.`, bodyContent, text });
}

/** 10. Store frozen / suspended / back to active by the team. */
export async function sendAccountStatusEmail({ to, name = 'Seller', status, reason = '' }) {
  const reasonBox = reason ? `<p style="margin:0 0 6px;"><b>Reason:</b> ${esc(reason)}</p>` : '';
  let tone, badgeText, title, intro, points, cta, subject;
  if (status === 'suspended') {
    tone = 'danger';
    badgeText = '⛔ Account suspended';
    title = 'Your store has been suspended';
    subject = '⛔ Your store has been suspended';
    intro = 'Your store has been suspended after an account review.';
    points = ['You can still log in.', 'Everything is closed except the Support chat.', 'Please contact Support to resolve this.'];
    cta = ['CONTACT SUPPORT →', '/seller/support'];
  } else if (status === 'frozen') {
    tone = 'danger';
    badgeText = '🚫 Store frozen';
    title = 'Your store has been frozen';
    subject = '🚫 Your store has been frozen';
    intro = 'Your store has been frozen after an account review.';
    points = [
      'You can still log in, see your orders and wallet.',
      'You can still deposit and confirm pending orders.',
      'You cannot withdraw or change products, coupons, shipping or store settings.',
      'Please contact Support to resolve this.',
    ];
    cta = ['CONTACT SUPPORT →', '/seller/support'];
  } else {
    tone = 'success';
    badgeText = '✅ Store active';
    title = 'Your store is active again';
    subject = '✅ Your store is active again';
    intro = 'Good news! All restrictions on your store have been removed.';
    points = ['You can withdraw and manage your store again.', 'Keep confirming orders on time to keep your account health high.'];
    cta = ['OPEN SELLER CENTRAL →', '/seller'];
  }
  const bodyContent = `
      ${badge(tone, badgeText)}
      ${heading(tone, title)}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>${intro}</p>
      ${callout(tone, `${tone === 'danger' ? reasonBox : ''}${list(points)}`)}
      ${button(tone, cta[0], sellerUrl(cta[1]))}`;
  const text = `Hello ${name},\n\n${intro}${reason && tone === 'danger' ? `\nReason: ${reason}` : ''}\n\n${points.join('\n')}\n\n${sellerUrl(cta[1])}`;
  return sendSellerEmail({ to, subject, preheader: intro, bodyContent, text });
}

/** 11. Diamond upgrade. */
export async function sendDiamondEmail({ to, name = 'Seller', storeName = '', profitRate = 35, confirmHours = 72, deliveryDays = '3–5' }) {
  const bodyContent = `
      ${badge('diamond', '💎 Diamond seller')}
      ${heading('diamond', 'Welcome to Diamond! 💎')}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>Congratulations! Your store${storeName ? ` <b>"${esc(storeName)}"</b>` : ''} is now a <b>Diamond</b> store — for life.</p>
      ${stats([
        { label: 'Profit per order', value: `${profitRate}%`, tone: 'diamond', sub: 'on new orders' },
        { label: 'Time to confirm', value: `${confirmHours}h`, tone: 'diamond', sub: 'per order' },
        deliveryDays ? { label: 'Fast delivery', value: `${esc(deliveryDays)}`, tone: 'diamond', sub: 'days' } : null,
      ])}
      ${callout('diamond', `<b>Your Diamond benefits</b>${list([
        `${profitRate}% profit on every new order.`,
        `${confirmHours} hours to confirm each order.`,
        'You can remove products from My Store.',
        deliveryDays ? `Fast ${esc(deliveryDays)} day delivery.` : '',
      ])}`)}
      ${button('diamond', 'SEE MY DIAMOND PLAN →', sellerUrl('/seller/diamond'))}`;
  const text = `Hello ${name},\n\nYour store is now Diamond: ${profitRate}% profit on new orders, ${confirmHours} hours to confirm, and you can remove products from My Store.\n\n${sellerUrl('/seller/diamond')}`;
  return sendSellerEmail({ to, subject: '💎 Your store is now Diamond!', preheader: `${profitRate}% profit on new orders, ${confirmHours}h to confirm.`, bodyContent, text });
}

/**
 * 12. Deposit / withdrawal approved — with the Bazario receipt (PDF) attached.
 *     `r` is the wallet line, `pdf` the receipt Buffer (services/receipt.js).
 */
export async function sendWalletReceiptEmail({ to, name = 'Seller', r, receiptNo, methodText = '', payoutTo = '', pdf }) {
  const isDep = r.type === 'deposit';
  const requested = Math.abs(Number(r.amount) || 0);
  const final = Math.abs(Number(r.approvedAmount != null ? r.approvedAmount : r.amount) || 0);
  const title = isDep ? `Deposit approved — ${money(final)} added to your wallet` : `Withdrawal approved — ${money(final)} sent`;
  const bodyContent = `
      ${badge('success', isDep ? '✅ Deposit approved' : '✅ Withdrawal approved')}
      ${heading('success', isDep ? 'Your deposit is approved' : 'Your withdrawal is approved')}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>${isDep ? `<b>${money(final)}</b> has been added to your Bazario wallet.` : `<b>${money(final)}</b> has been sent to you.`} Your receipt is attached to this email as a PDF.</p>
      ${stats([
        { label: isDep ? 'Credited' : 'Paid out', value: money(final), tone: 'success' },
        r.balanceAfter != null ? { label: 'Wallet balance', value: money(r.balanceAfter), tone: 'info' } : null,
      ])}
      ${rows([
        ['Receipt no.', esc(receiptNo)],
        ['Requested amount', money(requested)],
        !isDep && final < requested ? ['Returned to your balance', money(requested - final)] : null,
        ['Method', esc(methodText || '—')],
        !isDep && payoutTo ? ['Paid to', esc(payoutTo)] : null,
        isDep && r.depositRef ? ['Your reference (UTR)', esc(r.depositRef)] : null,
        !isDep && r.transactionRef ? ['Payout reference (UTR)', esc(r.transactionRef)] : null,
        ['Approved on', fmtIST(r.processedAt || r.updatedAt || Date.now())],
      ])}
      ${callout('info', '📎 <b>Receipt attached.</b> You can also download it any time from <b>Wallet → Transactions</b> in Seller Central.')}
      ${button('success', 'OPEN MY WALLET →', sellerUrl('/seller/wallet'))}`;
  const text = `Hello ${name},\n\n${title}.\nReceipt no. ${receiptNo}\nRequested: ${money(requested)}\n${isDep ? 'Credited' : 'Paid'}: ${money(final)}\n\nYour receipt is attached. You can also download it from Wallet -> Transactions in Seller Central: ${sellerUrl('/seller/wallet')}`;
  return sendSellerEmail({
    to,
    subject: title,
    preheader: `Receipt ${receiptNo} attached.`,
    bodyContent,
    text,
    attachments: pdf ? [{ filename: `Bazario-Receipt-${receiptNo}.pdf`, content: pdf }] : undefined,
  });
}

/**
 * 13. Diamond offer — a store earned a discount (or the reminder 24 hours before it ends).
 *     `offer` is a DiamondOffer record: { title, price, regular, endsAt }.
 */
export async function sendDiamondOfferEmail({ to, name = 'Seller', offer, reminder = false }) {
  const regular = Number(offer.regular) || 1500;
  const price = Number(offer.price) || regular;
  const save = Math.round((regular - price) * 100) / 100;
  const ends = fmtIST(offer.endsAt);
  const hoursLeft = Math.max(1, Math.round((new Date(offer.endsAt).getTime() - Date.now()) / 3600000));
  const subject = reminder ? `⏳ Your Diamond offer ends tomorrow — ${money(price)} instead of ${money(regular)}` : `💎 You earned ${money(save)} off Diamond`;
  const bodyContent = `
      ${badge('diamond', reminder ? '⏳ Ends soon' : '🏆 You earned it')}
      ${heading('diamond', reminder ? 'Your Diamond offer ends soon' : `${money(save)} off Diamond — just for you`)}
      <p>Hello <b>${esc(name)}</b>,</p>
      <p>${reminder ? 'This is a friendly reminder: your Diamond offer is still waiting for you.' : `${esc(offer.title || 'Your reward for great work')}: you kept your store in great shape, so Diamond is now cheaper for you.`}</p>
      <div style="text-align:center;margin:18px 0 6px;">
        <span style="font-size:18px;color:#94a3b8;text-decoration:line-through;margin-right:10px;">${money(regular)}</span>
        <span style="font-size:34px;font-weight:900;color:#5b21b6;">${money(price)}</span>
      </div>
      <p style="text-align:center;margin:0 0 14px;font-size:13px;color:#64748b;">Offer ends <b>${ends}</b> · about ${hoursLeft} hours left</p>
      ${callout('diamond', `<b>What you get — one time, for life</b>${list([
        '35% profit on every new order (instead of 20%)',
        'Fast 3–5 day shipping on every order — arranged by us',
        'We cover the cost when a customer is unhappy about a late order',
        '72 hours to confirm orders (instead of 48)',
        'Remove products from My Store anytime',
      ])}`)}
      ${button('diamond', `GET DIAMOND FOR ${money(price)} →`, sellerUrl('/seller/diamond'))}`;
  const text = `Hello ${name},\n\n${reminder ? 'Your Diamond offer ends soon.' : `You earned ${money(save)} off Diamond.`}\nDiamond for ${money(price)} instead of ${money(regular)} — offer ends ${ends}.\n\n${sellerUrl('/seller/diamond')}`;
  return sendSellerEmail({ to, subject, preheader: `Diamond for ${money(price)} instead of ${money(regular)} — ends ${ends}.`, bodyContent, text });
}

export default {
  transporter,
  sendVerificationOtpEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendSellerApprovalEmail,
  sendSellerNotificationEmail,
  sendSellerApplicationEmail,
  sendSellerApprovedEmail,
  sendOrderWarningEmail,
  sendStoreFrozenEmail,
  sendAccountStatusEmail,
  sendDiamondEmail,
  sendWalletReceiptEmail,
  sendDiamondOfferEmail,
  emailEnabled,
};
