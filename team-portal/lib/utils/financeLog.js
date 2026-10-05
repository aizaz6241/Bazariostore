import { connectDB } from '@/lib/db';
import FinanceLog from '@/lib/models/FinanceLog';
import Member from '@/lib/models/Member';
import { samePerson } from '@/lib/utils/approvalRules';

/**
 * Writing to and reading from the finance activity log, and sending the alert for each new line.
 *
 * Lines are written by this portal (logFinance) and by the store admin panel (it inserts into the
 * same collection). Alerts are sent from here for both: flushFinanceAlerts() picks up every line
 * that has not been announced yet and sends a push notification to the partners (not to the one
 * who did the action), plus a Telegram message when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
 */

const sid = (v) => (v ? String(v) : '');

export function actorFromSession(session) {
  if (!session) return { memberId: '', adminId: '', name: 'System', email: '', role: '' };
  return {
    memberId: sid(session._id),
    adminId: sid(session.ecommerceAdminId),
    name: session.name || session.username || '',
    email: session.email || '',
    role: session.role || '',
  };
}

/**
 * Add one line. Never throws: a logging problem must not break the action itself.
 * @returns {Promise<object|null>}
 */
export async function logFinance({
  session = null,
  actor = null,
  action,
  summary = '',
  entity = '',
  entityId = '',
  sellerId = '',
  storeName = '',
  before = null,
  after = null,
  meta = null,
}) {
  try {
    await connectDB();
    const doc = await FinanceLog.create({
      at: new Date(),
      source: 'portal',
      actor: actor || actorFromSession(session),
      action,
      summary: String(summary || '').slice(0, 500),
      entity,
      entityId: sid(entityId),
      sellerId: sid(sellerId),
      storeName: storeName || '',
      before,
      after,
      meta,
      pushed: false,
    });
    return doc;
  } catch (e) {
    console.error('[finance-log] could not write', action, e.message);
    return null;
  }
}

/** Newest first. `before` (ISO date) pages backwards. */
export async function listFinanceLog({ before = null, limit = 50 } = {}) {
  await connectDB();
  const size = Math.min(200, Math.max(1, Number(limit) || 50));
  const filter = {};
  const cut = before ? new Date(before) : null;
  if (cut && !Number.isNaN(cut.getTime())) filter.at = { $lt: cut };
  const rows = await FinanceLog.find(filter).sort({ at: -1 }).limit(size + 1).lean();
  const hasMore = rows.length > size;
  return {
    rows: rows.slice(0, size).map((r) => ({
      id: sid(r._id),
      at: r.at,
      source: r.source || 'portal',
      actor: r.actor || {},
      action: r.action,
      summary: r.summary || '',
      storeName: r.storeName || '',
      before: r.before ?? null,
      after: r.after ?? null,
      meta: r.meta ?? null,
    })),
    hasMore,
  };
}

// ───────────────────────── Alerts ─────────────────────────

const STALE_MS = 6 * 60 * 60 * 1000; // an old line is not announced any more
const MAX_PER_RUN = 15;
const GAP_MS = 8000;

function alertState() {
  if (!global.__financeAlertState) global.__financeAlertState = { at: 0, running: null };
  return global.__financeAlertState;
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = String(process.env.TELEGRAM_CHAT_ID || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!token || chats.length === 0) return;
  await Promise.allSettled(
    chats.map((chat) =>
      fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(4000),
      })
    )
  );
}

async function announce(line, admins) {
  const who = line.actor?.name || 'Someone';
  const title = line.meta?.needsApproval ? '🔐 Approval needed' : '🧾 Finance activity';
  const body = `${who}: ${line.summary || line.action}`;

  const jobs = [sendTelegram(`${title}\n${body}`)];
  try {
    const { sendPushToUser } = await import('@/lib/utils/push');
    for (const a of admins) {
      // the person who did it does not need to be told
      if (samePerson(line.actor, { memberId: sid(a._id), adminId: sid(a.ecommerceAdminId), email: a.email || '' })) continue;
      jobs.push(
        sendPushToUser(a._id, {
          title,
          body,
          url: '/finance',
          type: 'finance',
          tag: `finlog-${sid(line._id)}`,
        })
      );
    }
  } catch (e) {
    console.error('[finance-log] push not available:', e.message);
  }
  await Promise.allSettled(jobs);
}

/**
 * Send the alert for every line that has not been announced yet. Safe to call often and from
 * several server instances: each line is claimed atomically, so it is announced once.
 */
export async function flushFinanceAlerts({ force = false } = {}) {
  const state = alertState();
  if (state.running) return state.running;
  if (!force && Date.now() - state.at < GAP_MS) return 0;
  state.at = Date.now();

  const run = (async () => {
    let sent = 0;
    try {
      await connectDB();
      const col = FinanceLog.collection; // raw driver: only the `pushed` flag is ever touched
      let admins = null;
      for (let i = 0; i < MAX_PER_RUN; i += 1) {
        const claimed = await col.findOneAndUpdate({ pushed: false }, { $set: { pushed: true } }, { sort: { at: 1 }, returnDocument: 'after' });
        const line = claimed && claimed.value !== undefined ? claimed.value : claimed;
        if (!line || !line._id) break;
        if (line.meta?.silent === true) continue;
        if (Date.now() - new Date(line.at).getTime() > STALE_MS) continue;
        if (!admins) admins = await Member.find({ role: 'admin', active: true }).select('_id ecommerceAdminId email').lean();
        await announce(line, admins);
        sent += 1;
      }
    } catch (e) {
      console.error('[finance-log] alert flush failed:', e.message);
    }
    return sent;
  })();

  state.running = run;
  try {
    return await run;
  } finally {
    state.running = null;
  }
}

/** For request handlers: send alerts but never hold the reply for more than a moment. */
export function flushFinanceAlertsSoon(maxWaitMs = 2500) {
  return Promise.race([flushFinanceAlerts({ force: true }), new Promise((resolve) => setTimeout(resolve, maxWaitMs))]).catch(() => 0);
}
