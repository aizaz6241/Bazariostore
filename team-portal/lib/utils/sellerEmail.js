import mongoose from 'mongoose';

/**
 * Seller emails sent from the team portal (Diamond upgrades are approved here, not on the server).
 * Uses the same Resend account as the server: set RESEND_API_KEY (and optionally RESEND_FROM,
 * EMAIL_REPLY_TO, CLIENT_URL) in this Vercel project too. Without the key nothing is sent.
 * Never throws: a failed email never breaks the upgrade. Test accounts get no emails.
 */
const KEY = () => (process.env.RESEND_API_KEY || '').trim();
const FROM = () => process.env.RESEND_FROM || 'Bazario <no-reply@bazariomarketplace.shop>';
const SITE = () => (process.env.CLIENT_URL || 'https://www.bazariomarketplace.shop').replace(/\/+$/, '');
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function send({ to, subject, html, text }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const replyTo = (process.env.EMAIL_REPLY_TO || '').trim();
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(`Resend ${res.status}: ${d?.message || 'send failed'}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

const tile = (label, value, sub) =>
  `<td style="width:33%;padding:4px;vertical-align:top;"><div style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:10px;padding:12px 8px;text-align:center;"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">${label}</div><div style="font-size:22px;font-weight:900;color:#7c3aed;margin-top:4px;">${value}</div><div style="font-size:11.5px;color:#64748b;margin-top:3px;">${sub}</div></div></td>`;

function diamondHtml({ name, storeName, url }) {
  const site = SITE();
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your store is now Diamond</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">35% profit on new orders, 72h to confirm.</div>
<div style="max-width:580px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
  <div style="background:#0f172a;padding:26px 30px;text-align:center;"><span style="font-size:24px;font-weight:900;color:#fff;">BAZARIO<span style="color:#f59e0b;">.</span></span></div>
  <div style="padding:32px 30px;line-height:1.6;font-size:14.5px;color:#334155;">
    <div style="display:inline-block;background:#f5f3ff;color:#7c3aed;border:1px solid #ddd6fe;border-radius:999px;padding:4px 12px;font-size:11.5px;font-weight:800;text-transform:uppercase;margin-bottom:12px;">💎 Diamond seller</div>
    <h2 style="font-size:20px;font-weight:800;color:#7c3aed;margin:0 0 12px;">Welcome to Diamond! 💎</h2>
    <p>Hello <b>${esc(name)}</b>,</p>
    <p>Congratulations! Your store${storeName ? ` <b>"${esc(storeName)}"</b>` : ''} is now a <b>Diamond</b> store — for life.</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;border-collapse:collapse;"><tr>${tile('Profit per order', '35%', 'on new orders')}${tile('Time to confirm', '72h', 'per order')}${tile('Fast delivery', '3–5', 'days')}</tr></table>
    <div style="background:#f5f3ff;border:1.5px solid #ddd6fe;border-left:4px solid #7c3aed;border-radius:8px;padding:14px 16px;margin:18px 0;color:#5b21b6;font-size:13.5px;">
      <b>Your Diamond benefits</b>
      <ul style="margin:6px 0 0;padding-left:18px;"><li>35% profit on every new order.</li><li>72 hours to confirm each order.</li><li>You can remove products from My Store.</li><li>Fast 3–5 day delivery.</li></ul>
    </div>
    <div style="text-align:center;"><a href="${url}" target="_blank" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:13px 26px;border-radius:8px;font-weight:700;font-size:14px;margin:18px 0;">SEE MY DIAMOND PLAN →</a></div>
  </div>
  <div style="background:#f8fafc;padding:20px 30px;text-align:center;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
    <a href="${site}" style="color:#64748b;text-decoration:none;">Storefront</a> • <a href="${site}/seller/login" style="color:#64748b;text-decoration:none;">Seller Central</a><br>© ${new Date().getFullYear()} Bazario Global Commerce. All rights reserved.
    <p style="margin:8px 0 0;font-size:11px;color:#a3aab5;">Please do not reply to this email — this address does not accept replies. For help, use Support chat in Seller Central.</p>
  </div>
</div></body></html>`;
}

/** The store was just upgraded to Diamond (awaited by the caller; never throws). */
export async function emailDiamondUpgrade(sellerId) {
  try {
    if (!KEY()) return;
    const s = await mongoose.connection.db
      .collection('sellers')
      .findOne({ _id: new mongoose.Types.ObjectId(String(sellerId)) }, { projection: { email: 1, ownerName: 1, storeName: 1, isTestAccount: 1, accountType: 1 } });
    if (!s?.email || s.isTestAccount || s.accountType === 'test') return;
    const name = s.ownerName || s.storeName || 'Seller';
    const url = `${SITE()}/seller/diamond`;
    await send({
      to: s.email,
      subject: '[Bazario] 💎 Your store is now Diamond!',
      html: diamondHtml({ name, storeName: s.storeName, url }),
      text: `Hello ${name},\n\nYour store is now Diamond: 35% profit on new orders, 72 hours to confirm, and you can remove products from My Store.\n\n${url}`,
    });
  } catch (e) {
    console.error('[seller-email] diamond:', e.message);
  }
}
