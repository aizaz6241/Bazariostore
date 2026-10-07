/**
 * RESERVE POOL — pure rules (no database, no imports), so they can be tested on their own.
 *
 * The two partners keep some money aside in a reserve pool (same Binance account, counted
 * separately). It is always half one partner's and half the other's.
 *
 *   - The reserve never fills by itself. Money goes in only when the partners move it there
 *     (from their wallets, half each, or from their own pockets), and it can be moved back to
 *     the wallets, half each.
 *   - On a seller withdrawal everybody pays their share from their own wallet first.
 *   - Whoever does not have enough (a member or a partner) is short by the rest: the reserve pays
 *     it, and that person's wallet goes below zero by that amount.
 *   - When the reserve runs out, what is still missing is carried by the partners' wallets.
 *   - When the person who was short earns again, what the reserve paid for them comes back to the
 *     two partners' WALLETS, half each (shown as its own line). It does not refill the reserve.
 *
 * Everything is worked out by replaying all movements in the order they happened.
 */

const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const time = (d) => new Date(d).getTime() || 0;

// Same moment: money in is counted before money out
const ORDER = { deposit: 0, bonus: 1, reserve_add: 2, reserve_take: 3, payout: 4, seller_withdrawal: 5 };

/**
 * @param {object} p
 * @param {Array} p.entries        ledger entries [{ id, kind, date, storeName, shares:[{userId,name,role,amountUSDT}] }]
 * @param {Array} p.payouts        [{ id, userId, amountUSDT, date }]
 * @param {Array} p.reserveMoves   [{ id, type:'add'|'take', source:'wallets'|'pocket', amountUSDT, date, note, by }]
 * @param {Array} p.partners       the two partners [{ id, name }]
 * @param {(id:string)=>string} [p.nameOf]
 */
export function simulateReserve({ entries = [], payouts = [], reserveMoves = [], partners = [], nameOf = (id) => id }) {
  const bal = new Map(); // wallet of every person, as it moves
  const owed = new Map(); // what the reserve paid for a person and has not come back yet
  const totals = new Map(); // per person: { toReserve, fromReserve, returned }
  const extras = []; // wallet lines that are not a share of a deposit / withdrawal / payout
  const history = []; // everything that happened to the reserve
  const perEntry = new Map(); // seller withdrawal id -> { reserveUsedUSDT, covers: [{ userId, name, amountUSDT }] }
  let reserve = 0;
  let pocketIn = 0;

  const get = (m, k) => m.get(k) || 0;
  const tot = (id) => {
    if (!totals.has(id)) totals.set(id, { toReserveUSDT: 0, fromReserveUSDT: 0, returnedUSDT: 0 });
    return totals.get(id);
  };
  const halves = (amount) => {
    // equal parts; the last partner takes the remainder so the parts add up exactly
    const out = [];
    let used = 0;
    partners.forEach((p, i) => {
      const part = i === partners.length - 1 ? r6(amount - used) : r6(amount / partners.length);
      used = r6(used + part);
      out.push({ id: p.id, name: p.name, amount: part });
    });
    return out;
  };

  // Money arriving in a wallet. If the reserve had paid for this person, that much now goes
  // back to the partners' wallets (which may in turn settle what the reserve paid for THEM).
  function credit(userId, amount, ctx, depth = 0) {
    if (!(amount > 0)) return;
    bal.set(userId, r6(get(bal, userId) + amount));
    const open = get(owed, userId);
    if (!(open > 0) || partners.length === 0 || depth > 40) return;
    const back = r6(Math.min(open, amount));
    if (back < 0.000001) return;
    owed.set(userId, r6(open - back));
    history.push({
      date: ctx.date,
      type: 'returned',
      amountUSDT: back,
      balanceAfterUSDT: r6(reserve),
      userId,
      name: nameOf(userId),
      storeName: ctx.storeName || '',
      entryId: ctx.entryId || '',
      note: 'Went to the partners’ wallets, half each (the reserve is not refilled by itself)',
    });
    for (const part of halves(back)) {
      if (!(part.amount > 0)) continue;
      tot(part.id).returnedUSDT = r6(tot(part.id).returnedUSDT + part.amount);
      extras.push({
        id: `rret_${ctx.entryId || ctx.id || 'x'}_${userId}_${part.id}_${extras.length}`,
        userId: part.id,
        kind: 'reserve_return',
        amountUSDT: part.amount,
        date: ctx.date,
        fromUserId: userId,
        fromName: nameOf(userId),
        storeName: ctx.storeName || '',
        entryId: ctx.entryId || '',
      });
      credit(part.id, part.amount, ctx, depth + 1);
    }
  }

  const debit = (userId, amount) => bal.set(userId, r6(get(bal, userId) - amount));

  const events = [
    ...entries.map((e) => ({ t: time(e.date), k: e.kind, id: String(e.id), e })),
    ...payouts.map((p) => ({ t: time(p.date), k: 'payout', id: String(p.id), p })),
    ...reserveMoves.map((m) => ({ t: time(m.date), k: m.type === 'take' ? 'reserve_take' : 'reserve_add', id: String(m.id), m })),
  ].sort((a, b) => a.t - b.t || (ORDER[a.k] ?? 9) - (ORDER[b.k] ?? 9) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  for (const ev of events) {
    if (ev.k === 'deposit') {
      const ctx = { date: ev.e.date, storeName: ev.e.storeName, entryId: ev.id };
      for (const s of ev.e.shares) credit(String(s.userId), s.amountUSDT, ctx);
    } else if (ev.k === 'bonus') {
      const ctx = { date: ev.e.date, storeName: ev.e.storeName, entryId: ev.id };
      for (const s of ev.e.shares) {
        if (s.role === 'member') credit(String(s.userId), s.amountUSDT, ctx);
        else debit(String(s.userId), s.amountUSDT);
      }
    } else if (ev.k === 'payout') {
      debit(String(ev.p.userId), ev.p.amountUSDT);
    } else if (ev.k === 'seller_withdrawal') {
      const covers = [];
      let used = 0;
      for (const s of ev.e.shares) {
        const userId = String(s.userId);
        const before = get(bal, userId);
        debit(userId, s.amountUSDT);
        const short = r6(s.amountUSDT - Math.max(before, 0));
        if (!(short > 0) || !(reserve > 0)) continue;
        const cover = r6(Math.min(short, reserve));
        reserve = r6(reserve - cover);
        owed.set(userId, r6(get(owed, userId) + cover));
        used = r6(used + cover);
        covers.push({ userId, name: s.name || nameOf(userId), amountUSDT: cover, shortUSDT: short });
        history.push({
          date: ev.e.date,
          type: 'used',
          amountUSDT: cover,
          balanceAfterUSDT: reserve,
          userId,
          name: s.name || nameOf(userId),
          storeName: ev.e.storeName || '',
          entryId: ev.id,
          note: cover < short ? `Short by ${short}: the reserve had only ${cover}; the rest is carried by the partners’ wallets` : '',
        });
      }
      if (covers.length > 0) perEntry.set(ev.id, { reserveUsedUSDT: used, covers });
    } else if (ev.k === 'reserve_add') {
      const amount = r6(ev.m.amountUSDT);
      if (!(amount > 0)) continue;
      const fromPocket = ev.m.source === 'pocket';
      if (fromPocket) {
        pocketIn = r6(pocketIn + amount);
      } else {
        for (const part of halves(amount)) {
          debit(part.id, part.amount);
          tot(part.id).toReserveUSDT = r6(tot(part.id).toReserveUSDT + part.amount);
          extras.push({ id: `rmove_${ev.id}_${part.id}`, userId: part.id, kind: 'reserve_to', amountUSDT: part.amount, date: ev.m.date, moveId: ev.id, note: ev.m.note || '' });
        }
      }
      reserve = r6(reserve + amount);
      history.push({ date: ev.m.date, type: fromPocket ? 'add_pocket' : 'add_wallets', amountUSDT: amount, balanceAfterUSDT: reserve, moveId: ev.id, note: ev.m.note || '', by: ev.m.by || '' });
    } else if (ev.k === 'reserve_take') {
      // never more than the reserve holds at that moment
      const amount = r6(Math.min(ev.m.amountUSDT, reserve));
      if (!(amount > 0)) continue;
      reserve = r6(reserve - amount);
      history.push({ date: ev.m.date, type: 'take', amountUSDT: amount, balanceAfterUSDT: reserve, moveId: ev.id, note: ev.m.note || '', by: ev.m.by || '' });
      const ctx = { date: ev.m.date, id: ev.id };
      for (const part of halves(amount)) {
        tot(part.id).fromReserveUSDT = r6(tot(part.id).fromReserveUSDT + part.amount);
        extras.push({ id: `rmove_${ev.id}_${part.id}`, userId: part.id, kind: 'reserve_from', amountUSDT: part.amount, date: ev.m.date, moveId: ev.id, note: ev.m.note || '' });
        credit(part.id, part.amount, ctx);
      }
    }
  }

  const owedList = [...owed.entries()]
    .filter(([, v]) => v > 0.000001)
    .map(([userId, v]) => ({ userId, name: nameOf(userId), amountUSDT: r6(v) }));

  return {
    balances: bal,
    totals,
    extras,
    perEntry,
    pocketInUSDT: pocketIn,
    reserve: {
      balanceUSDT: r6(reserve),
      owed: owedList,
      owedUSDT: r6(owedList.reduce((s, x) => s + x.amountUSDT, 0)),
      history,
    },
  };
}

/**
 * What each partner can really take out today.
 * Someone below zero owes that money; the part the reserve did not pay is not in Binance, and
 * the partners carry it: equally, but never more than a partner has (the other one carries
 * what is left).
 * @param {Array<{userId:string, balanceUSDT:number}>} partnerWallets
 * @param {number} uncoveredUSDT  total below zero that the reserve did not pay
 * @returns {Map<string, number>} userId -> amount carried
 */
export function carryUncovered(partnerWallets, uncoveredUSDT) {
  const carried = new Map(partnerWallets.map((w) => [w.userId, 0]));
  let left = r6(uncoveredUSDT);
  let able = partnerWallets.filter((w) => w.balanceUSDT > 0).map((w) => ({ id: w.userId, room: r6(w.balanceUSDT) }));
  for (let round = 0; round < 6 && left > 0.000001 && able.length > 0; round++) {
    const each = r6(left / able.length);
    let given = 0;
    able.forEach((a, i) => {
      const want = i === able.length - 1 ? r6(left - given) : each;
      const take = r6(Math.min(want, a.room));
      a.room = r6(a.room - take);
      carried.set(a.id, r6(carried.get(a.id) + take));
      given = r6(given + take);
    });
    left = r6(left - given);
    able = able.filter((a) => a.room > 0.000001);
  }
  return carried;
}
