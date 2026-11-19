/**
 * SEND EMAIL TO A STORE (Support inbox → ✉️ Email)
 *
 *   GET    /api/seller-email/meta            templates (ready + saved), placeholders, buttons, today's count
 *   GET    /api/seller-email/stores?q=       stores to choose from (only stores with an email)
 *   GET    /api/seller-email/stores/:id      one store (opened from its chat)
 *   POST   /api/seller-email/preview         the email as the store will see it (nothing is sent)
 *   POST   /api/seller-email/send            send it now
 *   GET    /api/seller-email/history         emails sent by the team (?sellerId= for one store)
 *   POST   /api/seller-email/templates       save the current email as a template
 *   DELETE /api/seller-email/templates/:id   remove a saved template (ready ones cannot be removed)
 *
 * Full admins with the chat permission only. Team staff logins ("assigned stores only") are refused
 * here AND by the deny-by-default list in utils/staffScope.js. Nothing here touches orders, wallets
 * or finance — it only reads a store's name / email / numbers for {placeholders} and sends one email.
 */
import { Router } from 'express';
import mongoose from 'mongoose';
import Seller from '../models/Seller.js';
import { SellerEmailLog, SellerEmailTemplate } from '../models/SellerEmail.js';
import { authAdmin } from '../middleware/auth.js';
import { audit } from '../utils/audit.js';
import { limit } from '../utils/rateLimit.js';
import { sellerFacts } from '../utils/chatPlaceholders.js';
import { emailEnabled, renderCustomSellerEmail, sendCustomSellerEmail } from '../services/email.service.js';
import {
  MAIL_TEMPLATES,
  MAIL_CATEGORIES,
  MAIL_BUTTONS,
  MAIL_TONES,
  MAIL_PLACEHOLDERS,
  SAMPLE_FACTS,
  fillMail,
  unfilledFields,
} from '../utils/sellerMailTemplates.js';

const router = Router();
const DAILY_LIMIT = Number(process.env.RESEND_DAILY_LIMIT) || 100; // Resend free plan

// full admins only (a team-staff login has a scope)
const fullAdmin = (req, res, next) => (Array.isArray(req.admin?.scope) ? res.status(403).json({ message: 'You do not have permission for this action' }) : next());
const guard = [authAdmin('chat'), fullAdmin];

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const rxText = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const str = (v, max) => (typeof v === 'string' ? v.replace(/\u0000/g, '').trim().slice(0, max) : '');
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || ''));
const adminOf = (req) => ({ id: String(req.admin?.id || ''), name: String(req.admin?.name || '') });

function startOfTodayPKT() {
  // the team works in Pakistan time (UTC+5)
  const now = Date.now() + 5 * 3600000;
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 5 * 3600000);
}

/** Reads and checks the email the admin wrote. Returns { mail } or { error }. */
function readMail(body = {}) {
  const mail = {
    subject: str(body.subject, 150),
    heading: str(body.heading, 150),
    badge: str(body.badge, 40),
    body: str(body.body, 5000),
    note: str(body.note, 1000),
    tone: MAIL_TONES.includes(body.tone) ? body.tone : 'info',
    buttonKey: Object.prototype.hasOwnProperty.call(MAIL_BUTTONS, body.buttonKey) ? body.buttonKey : '',
    buttonLabel: str(body.buttonLabel, 40),
    templateKey: str(body.templateKey, 60),
    templateLabel: str(body.templateLabel, 80),
  };
  return mail;
}
const buttonOf = (mail) => (mail.buttonKey ? { path: MAIL_BUTTONS[mail.buttonKey].path, label: mail.buttonLabel || MAIL_BUTTONS[mail.buttonKey].label } : null);

function filled(mail, facts) {
  return {
    subject: fillMail(mail.subject, facts),
    heading: fillMail(mail.heading || mail.subject, facts),
    badge: mail.badge,
    body: fillMail(mail.body, facts),
    note: fillMail(mail.note, facts),
    tone: mail.tone,
    button: buttonOf(mail),
  };
}

async function storeOf(id) {
  if (!isId(id)) return null;
  return Seller.findById(id).select('storeName ownerName email status tier isTestAccount accountType isPreviousStoreSeller').lean();
}
const storeRow = (s) => ({
  _id: s._id,
  storeName: s.storeName || 'Store',
  ownerName: s.ownerName || '',
  email: s.email || '',
  hasEmail: validEmail(s.email),
  status: s.status || 'active',
  tier: s.tier === 'diamond' ? 'diamond' : 'basic',
  isTest: Boolean(s.isTestAccount || s.accountType === 'test'),
});

// GET /meta
router.get('/meta', guard, async (req, res) => {
  try {
    const [saved, today] = await Promise.all([
      SellerEmailTemplate.find().sort({ updatedAt: -1 }).limit(100).lean(),
      SellerEmailLog.countDocuments({ status: 'sent', createdAt: { $gte: startOfTodayPKT() } }),
    ]);
    res.json({
      enabled: emailEnabled,
      dailyLimit: DAILY_LIMIT,
      sentToday: today,
      categories: [...MAIL_CATEGORIES, { key: 'saved', label: 'Saved by team' }],
      templates: [
        ...MAIL_TEMPLATES,
        ...saved.map((t) => ({ key: `saved:${t._id}`, _id: t._id, category: 'saved', savedCategory: t.category, label: t.label, builtIn: false, tone: t.tone, badge: t.badge, subject: t.subject, heading: t.heading, body: t.body, note: t.note, buttonKey: t.buttonKey, createdBy: t.createdBy?.name || '' })),
      ],
      placeholders: Object.entries(MAIL_PLACEHOLDERS).map(([key, label]) => ({ key, label })),
      buttons: Object.entries(MAIL_BUTTONS).map(([key, b]) => ({ key, label: b.label, path: b.path })),
      tones: MAIL_TONES,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /stores?q=
router.get('/stores', guard, async (req, res) => {
  try {
    const q = str(req.query.q, 60);
    const filter = {};
    if (q) {
      const rx = { $regex: rxText(q), $options: 'i' };
      filter.$or = [{ storeName: rx }, { ownerName: rx }, { email: rx }, { phone: rx }];
    }
    const list = await Seller.find(filter)
      .select('storeName ownerName email status tier isTestAccount accountType isPreviousStoreSeller')
      .sort({ updatedAt: -1 })
      .limit(40)
      .lean();
    res.json(list.map(storeRow));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /stores/:id
router.get('/stores/:id', guard, async (req, res) => {
  try {
    const s = await storeOf(req.params.id);
    if (!s) return res.status(404).json({ message: 'Store not found' });
    res.json(storeRow(s));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /preview { sellerId?, ...mail }
router.post('/preview', guard, limit({ name: 'seller-email-preview', max: 240, windowMs: 60000, key: (req) => req.admin?.id || 'x' }), async (req, res) => {
  try {
    const mail = readMail(req.body);
    const s = req.body?.sellerId ? await storeOf(req.body.sellerId) : null;
    const facts = s ? (await sellerFacts(s._id)) || SAMPLE_FACTS : SAMPLE_FACTS;
    const f = filled(mail, facts);
    const out = renderCustomSellerEmail({ name: facts.ownerName || facts.storeName || 'Seller', ...f });
    res.json({
      subject: out.fullSubject,
      html: out.html,
      to: s?.email || '',
      sample: !s,
      missing: unfilledFields(f.subject, f.heading, f.body, f.note),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /send { sellerId, ...mail }
router.post(
  '/send',
  guard,
  limit({ name: 'seller-email-send', max: 40, windowMs: 60 * 60000, key: (req) => req.admin?.id || 'x', message: 'Too many emails in one hour. Please wait a little and try again.' }),
  async (req, res) => {
    try {
      const s = await storeOf(req.body?.sellerId);
      if (!s) return res.status(400).json({ message: 'Choose a store first' });
      if (!validEmail(s.email)) return res.status(400).json({ message: 'This store has no valid email address' });
      const mail = readMail(req.body);
      if (mail.subject.length < 3) return res.status(400).json({ message: 'Write a subject (at least 3 letters)' });
      if (!mail.body) return res.status(400).json({ message: 'Write the message' });
      if (!emailEnabled) return res.status(503).json({ message: 'Email sending is not set up on the server (RESEND_API_KEY missing on Render).' });

      const facts = (await sellerFacts(s._id)) || { ...SAMPLE_FACTS, storeName: s.storeName, ownerName: s.ownerName };
      const f = filled(mail, facts);
      const missing = unfilledFields(f.subject, f.heading, f.body, f.note);
      if (missing.length) return res.status(400).json({ message: `Fill in ${missing.join(', ')} before sending` });

      const today = await SellerEmailLog.countDocuments({ status: 'sent', createdAt: { $gte: startOfTodayPKT() } });
      if (today >= DAILY_LIMIT) return res.status(429).json({ message: `Today's email limit (${DAILY_LIMIT}) has been reached. Try again tomorrow.` });

      const result = await sendCustomSellerEmail({ to: s.email, name: facts.ownerName || s.ownerName || s.storeName || 'Seller', ...f });
      const log = await SellerEmailLog.create({
        seller: s._id,
        storeName: s.storeName || '',
        to: s.email,
        subject: result.subject || f.subject,
        heading: f.heading,
        body: f.body,
        note: f.note,
        tone: f.tone,
        buttonKey: mail.buttonKey,
        templateKey: mail.templateKey,
        templateLabel: mail.templateLabel,
        status: result.success ? 'sent' : 'failed',
        error: result.success ? '' : String(result.error || 'Send failed').slice(0, 300),
        messageId: result.messageId || '',
        sentBy: adminOf(req),
      });
      audit(req, result.success ? 'seller_email_sent' : 'seller_email_failed', 'seller', s._id, { subject: log.subject, to: s.email, template: mail.templateKey || 'custom' });
      if (!result.success) return res.status(502).json({ message: `The email could not be sent: ${log.error}`, log });
      res.json({ ok: true, message: `Email sent to ${s.email}`, log, sentToday: today + 1, dailyLimit: DAILY_LIMIT });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// GET /history?sellerId=&limit=
router.get('/history', guard, async (req, res) => {
  try {
    const filter = {};
    if (req.query.sellerId) {
      if (!isId(req.query.sellerId)) return res.json([]);
      filter.seller = new mongoose.Types.ObjectId(String(req.query.sellerId));
    }
    const n = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const list = await SellerEmailLog.find(filter).sort({ createdAt: -1 }).limit(n).lean();
    res.json(list);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /templates { label, category, ...mail }
router.post('/templates', guard, async (req, res) => {
  try {
    const label = str(req.body?.label, 80);
    if (label.length < 2) return res.status(400).json({ message: 'Give the template a name' });
    const mail = readMail(req.body);
    if (!mail.subject || !mail.body) return res.status(400).json({ message: 'A template needs a subject and a message' });
    if ((await SellerEmailTemplate.estimatedDocumentCount()) >= 100) return res.status(400).json({ message: 'At most 100 saved templates — remove an old one first' });
    const category = MAIL_CATEGORIES.some((c) => c.key === req.body?.category) ? req.body.category : 'general';
    const t = await SellerEmailTemplate.create({ label, category, tone: mail.tone, badge: mail.badge, subject: mail.subject, heading: mail.heading, body: mail.body, note: mail.note, buttonKey: mail.buttonKey, createdBy: adminOf(req) });
    audit(req, 'seller_email_template_saved', 'settings', t._id, { label });
    res.status(201).json(t);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /templates/:id
router.delete('/templates/:id', guard, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(404).json({ message: 'Template not found' });
    const t = await SellerEmailTemplate.findByIdAndDelete(req.params.id);
    if (!t) return res.status(404).json({ message: 'Template not found' });
    audit(req, 'seller_email_template_deleted', 'settings', t._id, { label: t.label });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
