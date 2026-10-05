/**
 * Analytics maths for the Analytics screen (pure functions: no database, no React).
 *
 * Two sources are turned into one simple list of "events":
 *   - the Binance finance ledger (admins: the whole business)
 *   - one person's wallet statement (everyone: "my wallet")
 * and the same summary code then works for both.
 *
 * Event: { t, kind: 'in' | 'out' | 'transfer', group, amount, source: { id, name }, people, inr, isDeposit }
 * All amounts are real Binance USDT. Days are the viewer's own calendar days.
 */

const DAY_MS = 86400000;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function keyToDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(fromKey, toKey) {
  return Math.round((keyToDate(toKey) - keyToDate(fromKey)) / DAY_MS) + 1;
}

/** Whole business: what really came into and left Binance. */
export function eventsFromLedger(ledger) {
  if (!ledger) return [];
  const events = [];
  for (const e of ledger.entries || []) {
    const t = new Date(e.date).getTime();
    const source = { id: e.sellerId || e.storeName, name: e.storeName || 'Store' };
    if (e.kind === 'deposit') {
      events.push({
        t,
        kind: 'in',
        group: 'deposit',
        amount: e.usdt,
        source,
        people: (e.shares || []).map((s) => ({ id: String(s.userId), name: s.name, amount: s.amountUSDT })),
        inr: e.inr || 0,
        isDeposit: true,
      });
    } else if (e.kind === 'seller_withdrawal') {
      events.push({ t, kind: 'out', group: 'seller', amount: e.usdt, source, people: [], inr: 0 });
    } else {
      // milestone bonus: money moves between wallets, Binance total stays the same
      events.push({ t, kind: 'transfer', group: 'bonus', amount: e.usdt, source: { id: 'bonus', name: 'Milestone bonus' }, people: [], inr: 0 });
    }
  }
  for (const p of ledger.payouts || []) {
    events.push({
      t: new Date(p.date).getTime(),
      kind: 'out',
      group: 'payout',
      amount: p.amountUSDT,
      source: { id: `person_${p.userId}`, name: p.name },
      people: [],
      inr: 0,
    });
  }
  return events.sort((a, b) => a.t - b.t);
}

/** One person's wallet: what was added to it and what was taken from it. */
export function eventsFromWallet(wallet) {
  if (!wallet) return [];
  const events = [];
  for (const tx of wallet.transactions || []) {
    if ((tx.currency || 'USDT') !== 'USDT') continue;
    const t = new Date(tx.date).getTime();
    const amount = Number(tx.amount) || 0;
    const store = { id: tx.sellerId || tx.storeName || 'store', name: tx.storeName || 'Store' };
    if (tx.category === 'deposit_share') {
      events.push({ t, kind: 'in', group: 'deposit', amount, source: store, people: [], inr: 0, isDeposit: true });
    } else if (tx.category === 'bonus_reward') {
      events.push({ t, kind: 'in', group: 'bonus', amount, source: { id: 'bonus', name: 'Milestone bonus' }, people: [], inr: 0 });
    } else if (tx.category === 'seller_withdrawal_share') {
      events.push({ t, kind: 'out', group: 'seller', amount, source: store, people: [], inr: 0 });
    } else if (tx.category === 'bonus_cost') {
      events.push({ t, kind: 'out', group: 'bonus_cost', amount, source: { id: 'bonus', name: 'Milestone bonus' }, people: [], inr: 0 });
    } else if (tx.category === 'payout_withdrawal') {
      events.push({ t, kind: 'out', group: 'payout', amount, source: { id: 'payout', name: 'Payout' }, people: [], inr: 0 });
    } else if (tx.type === 'credit') {
      events.push({ t, kind: 'in', group: 'other', amount, source: store, people: [], inr: 0 });
    } else if (tx.type === 'debit') {
      events.push({ t, kind: 'out', group: 'other', amount, source: store, people: [], inr: 0 });
    }
  }
  return events.sort((a, b) => a.t - b.t);
}

function emptyTotals() {
  return { in: 0, out: 0, outSeller: 0, outPayout: 0, outOther: 0, net: 0, transfers: 0, deposits: 0, movements: 0, inr: 0, rateUsdt: 0 };
}

function addTo(target, ev) {
  if (ev.kind === 'in') {
    target.in += ev.amount;
    if (ev.isDeposit) target.deposits += 1;
    if (ev.inr > 0 && ev.amount > 0) {
      target.inr += ev.inr;
      target.rateUsdt += ev.amount;
    }
    target.movements += 1;
  } else if (ev.kind === 'out') {
    target.out += ev.amount;
    if (ev.group === 'seller') target.outSeller += ev.amount;
    else if (ev.group === 'payout') target.outPayout += ev.amount;
    else target.outOther += ev.amount;
    target.movements += 1;
  } else {
    target.transfers += ev.amount;
  }
  target.net = target.in - target.out;
}

function ranked(map) {
  return [...map.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

/**
 * Colours must follow the store / person, not today's ranking: the order is taken from ALL time,
 * the first `slots` keep their own colour for good and the rest are shown together as "Other".
 */
function slices(rangeMap, allTimeOrder, slots) {
  const slotOf = new Map(allTimeOrder.slice(0, slots).map((x, i) => [x.id, i]));
  const out = [];
  let other = 0;
  let otherCount = 0;
  for (const item of ranked(rangeMap)) {
    if (!(item.value > 0)) continue;
    if (slotOf.has(item.id)) out.push({ id: item.id, name: item.name, value: r2(item.value), slot: slotOf.get(item.id) });
    else {
      other += item.value;
      otherCount += 1;
    }
  }
  out.sort((a, b) => b.value - a.value);
  if (other > 0) out.push({ id: '__other', name: otherCount === 1 ? '1 other' : `${otherCount} others`, value: r2(other), slot: -1 });
  return out;
}

/**
 * @param events  from eventsFromLedger / eventsFromWallet
 * @param fromKey first day shown (YYYY-MM-DD, viewer's calendar)
 * @param toKey   last day shown
 * @param compare also total the period of the same length just before `fromKey`
 */
export function summarize(events, { fromKey, toKey, compare = true, slots = 5 }) {
  const length = Math.max(1, daysBetween(fromKey, toKey));
  const prevFrom = addDays(fromKey, -length);

  const days = [];
  const index = new Map();
  for (let i = 0; i < length; i++) {
    const key = addDays(fromKey, i);
    index.set(key, i);
    days.push({ key, date: keyToDate(key), ...emptyTotals(), balance: 0 });
  }

  const totals = emptyTotals();
  const previous = emptyTotals();
  let opening = 0;

  const sourcesAll = new Map();
  const peopleAll = new Map();
  const sources = new Map();
  const people = new Map();
  const outSources = new Map();
  const bump = (map, id, name, value) => {
    const cur = map.get(id) || { id, name, value: 0 };
    cur.value += value;
    map.set(id, cur);
  };

  for (const ev of events) {
    const key = dayKey(ev.t);

    if (ev.kind === 'in') {
      bump(sourcesAll, ev.source.id, ev.source.name, ev.amount);
      for (const p of ev.people) bump(peopleAll, p.id, p.name, p.amount);
    }

    if (key < fromKey) {
      if (ev.kind === 'in') opening += ev.amount;
      else if (ev.kind === 'out') opening -= ev.amount;
      if (compare && key >= prevFrom) addTo(previous, ev);
      continue;
    }
    if (key > toKey) continue;

    addTo(days[index.get(key)], ev);
    addTo(totals, ev);
    if (ev.kind === 'in') {
      bump(sources, ev.source.id, ev.source.name, ev.amount);
      for (const p of ev.people) bump(people, p.id, p.name, p.amount);
    } else if (ev.kind === 'out') {
      bump(outSources, ev.source.id, ev.source.name, ev.amount);
    }
  }

  let running = opening;
  let best = null;
  let activeDays = 0;
  for (const d of days) {
    running += d.net;
    d.balance = r2(running);
    d.rate = d.rateUsdt > 0 ? r2(d.inr / d.rateUsdt) : null;
    for (const k of ['in', 'out', 'outSeller', 'outPayout', 'outOther', 'net', 'transfers', 'inr']) d[k] = r2(d[k]);
    if (d.movements > 0) activeDays += 1;
    if (d.in > 0 && (!best || d.in > best.in)) best = d;
  }
  for (const t of [totals, previous]) {
    for (const k of ['in', 'out', 'outSeller', 'outPayout', 'outOther', 'net', 'transfers', 'inr']) t[k] = r2(t[k]);
  }

  return {
    fromKey,
    toKey,
    length,
    days,
    totals,
    previous: compare ? previous : null,
    openingBalance: r2(opening),
    closingBalance: r2(running),
    bestDay: best,
    activeDays,
    avgPerDay: r2(totals.in / length),
    avgDeposit: totals.deposits > 0 ? r2(totals.in / totals.deposits) : 0,
    avgRate: totals.rateUsdt > 0 ? r2(totals.inr / totals.rateUsdt) : null,
    bySource: slices(sources, ranked(sourcesAll), slots),
    byPerson: slices(people, ranked(peopleAll), slots),
    outBySource: ranked(outSources)
      .filter((x) => x.value > 0)
      .map((x) => ({ ...x, value: r2(x.value) })),
  };
}

/** Change against the previous period, or null when there is nothing fair to compare with. */
export function changePct(now, before) {
  if (!(Math.abs(before) > 0.004)) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

/** First day that has any event (viewer's calendar), or null. */
export function firstEventKey(events) {
  return events.length ? dayKey(events[0].t) : null;
}
