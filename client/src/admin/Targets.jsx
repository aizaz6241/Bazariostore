import { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell } from 'recharts';
import { api, money, fmtDate } from '../api.js';
import { ErrorBox } from './ui.jsx';
import Ic from '../components/Icons.jsx';
import {
  Hero, MetaChip, Kpi, KpiGrid, Card, ChartGrid, Seg, Meter, Badge, Avatar, RankList, SplitBar, ChartTip,
  Toolbar, SearchBox, Empty, SERIES, STATUS, GRID, AXIS, legendText, pctOf,
} from './insights.jsx';

const DAY = 86400000;
// suggestions only — the admin can type any numbers
const PRESETS = {
  orders: [
    { goal: 10, bonus: 50, days: 30 },
    { goal: 25, bonus: 150, days: 45 },
    { goal: 50, bonus: 350, days: 60 },
    { goal: 100, bonus: 800, days: 90 },
  ],
  // milestones of the store's whole-life delivered orders
  total: [
    { goal: 100, bonus: 50, days: 60 },
    { goal: 200, bonus: 100, days: 60 },
    { goal: 500, bonus: 250, days: 90 },
    { goal: 1000, bonus: 500, days: 120 },
  ],
  sales: [
    { goal: 1000, bonus: 30, days: 30 },
    { goal: 2500, bonus: 90, days: 30 },
    { goal: 5000, bonus: 200, days: 45 },
    { goal: 10000, bonus: 450, days: 60 },
  ],
};
// one hue, lighter → darker as a target gets closer to done
const PROGRESS_STEPS = ['#9ec5f4', '#6da7ec', '#3987e5', '#1c5cab'];
// above this a bonus is asked once more before it is saved (it is paid automatically)
const BIG_BONUS = 500;

const usd = (n) => {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
const goalWords = (f) =>
  f.metric === 'sales'
    ? `Deliver ${usd(f.targetAmount)} in orders`
    : f.metric === 'total'
      ? `Reach ${Number(f.targetOrderCount) || 0} delivered orders`
      : `Deliver ${Number(f.targetOrderCount) || 0} orders`;
const autoTitle = (f) => goalWords(f);
const autoDescription = (f) =>
  `${goalWords(f)}${f.metric === 'total' ? ' in total' : ''}${f.durationDays ? ` within ${f.durationDays} days` : ''} to receive a ${usd(f.bonusAmount)} cash bonus, credited straight to your wallet.`;
// the three kinds of target, as the admin picks them
const KINDS = [
  { value: 'orders', icon: '📦', label: 'New orders', example: 'e.g. deliver 20 more orders from today' },
  { value: 'total', icon: '🏁', label: 'Total delivered', example: 'e.g. at 100 now → reach 200 in total' },
  { value: 'sales', icon: '💵', label: 'Sales amount', example: 'e.g. deliver $2,000 of orders' },
];
const blankForm = () => {
  const f = { sellerIds: [], metric: 'orders', targetOrderCount: 10, targetAmount: 1000, bonusAmount: 50, durationDays: 30, titleTouched: false, descTouched: false };
  f.title = autoTitle(f);
  f.description = autoDescription(f);
  return f;
};

// one state for a target, used everywhere on the page
function stateOf(t) {
  if (t.status === 'completed' || t.status === 'claimed') return 'completed';
  if (t.status === 'cancelled') return 'cancelled';
  if (t.status === 'expired') return 'expired';
  if (t.expiresAt && new Date(t.expiresAt).getTime() < Date.now()) return 'expired';
  return 'active';
}
const STATE_META = {
  active: { label: 'In progress', tone: 'info', icon: '⚡' },
  completed: { label: 'Completed', tone: 'good', icon: '🏆' },
  expired: { label: 'Expired', tone: 'neutral', icon: '⌛' },
  cancelled: { label: 'Cancelled', tone: 'neutral', icon: '✕' },
};
const isSales = (t) => t.metric === 'sales';
const isTotal = (t) => t.metric === 'total';
function progressOf(t) {
  const cur = isSales(t) ? Number(t.currentAmount) || 0 : (isTotal(t) ? Number(t.baseOrders) || 0 : 0) + (Number(t.currentOrders) || 0);
  const goal = isSales(t) ? Number(t.targetAmount) || 0 : Number(t.targetOrders) || 0;
  const pct = goal > 0 ? Math.min(100, Math.floor((cur / goal) * 100)) : 0;
  return { cur, goal, pct, left: Math.max(0, goal - cur) };
}
const progressText = (t) => {
  const p = progressOf(t);
  if (isSales(t)) return `${usd(p.cur)} / ${usd(p.goal)} delivered`;
  if (isTotal(t)) return `${p.cur} / ${p.goal} total delivered`;
  return `${p.cur} / ${p.goal} delivered`;
};
const goalShort = (t) => (isSales(t) ? `${usd(t.targetAmount)} in orders` : isTotal(t) ? `reach ${t.targetOrders} total (was ${t.baseOrders || 0})` : `${t.targetOrders} new orders`);

function daysLeft(t) {
  if (!t.expiresAt) return null;
  return Math.ceil((new Date(t.expiresAt).getTime() - Date.now()) / DAY);
}
const dateInput = (d) => {
  if (!d) return '';
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
const endOfDay = (v) => (v ? new Date(`${v}T23:59:59`).toISOString() : null);

// Monday-start week buckets, oldest → newest
function weekBuckets(n) {
  const now = new Date();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * DAY);
    out.push({ start: start.getTime(), end: start.getTime() + 7 * DAY, label: start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), assigned: 0, completed: 0, bonus: 0 });
  }
  return out;
}

export default function Targets() {
  const [allTargets, setAllTargets] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [scope, setScope] = useState('client'); // 'client' = test stores left out of everything
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(blankForm);
  const [sellerQ, setSellerQ] = useState('');
  const [pickTest, setPickTest] = useState(false);
  const [totals, setTotals] = useState(null); // sellerId → orders delivered in its whole life
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [edit, setEdit] = useState(null); // { t, title, goal, bonus, deadline, note }
  const [cancel, setCancel] = useState(null); // { t, reason, tell }
  const [sideError, setSideError] = useState('');

  const loadData = () => {
    setLoading(true);
    setError('');
    Promise.all([api('/sellers/targets/all'), api('/sellers').catch(() => [])])
      .then(([tgtRes, sellersRes]) => {
        setAllTargets(Array.isArray(tgtRes?.targets) ? tgtRes.targets : Array.isArray(tgtRes) ? tgtRes : []);
        const sList = Array.isArray(sellersRes) ? sellersRes : sellersRes?.sellers || [];
        // only approved, active stores can work towards a target
        setSellers(sList.filter((s) => s.status === 'active').sort((a, b) => (a.storeName || '').localeCompare(b.storeName || '')));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const flash = (m) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 6000);
  };

  const setF = (patch) =>
    setForm((prev) => {
      const next = { ...prev, ...patch };
      // the title follows the goal until the admin writes their own title (it used to stay
      // "Deliver 10 orders" when the goal was changed to 8, and the seller saw both numbers)
      if (!next.titleTouched && patch.title === undefined) next.title = autoTitle(next);
      if (!next.descTouched) next.description = autoDescription(next);
      return next;
    });

  const openModal = (sellerIds = []) => {
    setForm({ ...blankForm(), sellerIds });
    setSellerQ('');
    setPickTest(false);
    setFormError('');
    setModalOpen(true);
    api('/sellers/targets/delivered-totals')
      .then((r) => setTotals(r?.totals || {}))
      .catch(() => setTotals({}));
  };

  const isTestStore = (s) => Boolean(s.isTestAccount || s.accountType === 'test');
  const activeBySeller = useMemo(() => {
    const m = new Map();
    allTargets.forEach((t) => {
      if (stateOf(t) === 'active') m.set(String(t.sellerId), (m.get(String(t.sellerId)) || 0) + 1);
    });
    return m;
  }, [allTargets]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    const ids = form.sellerIds;
    if (!ids.length) return setFormError('Choose at least one store.');
    const sales = form.metric === 'sales';
    if (sales) {
      if (!(Number(form.targetAmount) >= 1)) return setFormError('Sales goal must be at least $1.');
    } else {
      if (!(Number(form.targetOrderCount) >= 1)) return setFormError('Target orders must be at least 1.');
      if (!Number.isInteger(Number(form.targetOrderCount))) return setFormError('Target orders must be a whole number.');
      // the title must not name another number of orders than the goal
      // (only a number written as "N orders" counts: "Diwali 2026 sprint" is fine)
      const named = [...form.title.matchAll(/(\d+)\s*(?:delivered\s+)?orders?\b/gi)].map((m) => Number(m[1]));
      if (named.length && !named.includes(Number(form.targetOrderCount))) {
        return setFormError(`The title mentions ${named.join(', ')} but the goal is ${Number(form.targetOrderCount)} delivered orders. Make them match.`);
      }
    }
    if (!(Number(form.bonusAmount) > 0)) return setFormError('Bonus must be more than $0.');
    const bonus = Number(form.bonusAmount);
    if (form.metric === 'total' && totals) {
      const past = ids.filter((id) => (totals[id] || 0) >= Number(form.targetOrderCount));
      if (past.length === ids.length) return setFormError(`${ids.length === 1 ? 'This store has' : 'All chosen stores have'} already delivered ${Number(form.targetOrderCount)} or more orders. Choose a higher total.`);
      if (past.length && !window.confirm(`${past.length} of the chosen stores already delivered ${Number(form.targetOrderCount)} or more orders. They will be skipped. Continue?`)) return;
    }
    const most = bonus * ids.length;
    if ((bonus > BIG_BONUS || ids.length > 1) &&
      !window.confirm(
        `${ids.length > 1 ? `${ids.length} stores × ${usd(bonus)} = up to ${usd(most)} in bonuses.\n\n` : `The bonus is ${usd(bonus)}.\n\n`}It is paid into the wallet automatically when a store reaches the goal. Give this target?`
      )) return;
    setSaving(true);
    const body = {
      title: form.title.trim(),
      metric: form.metric,
      targetOrders: sales ? undefined : Number(form.targetOrderCount),
      targetAmount: sales ? Number(form.targetAmount) : undefined,
      bonusAmount: bonus,
      durationDays: form.durationDays ? Number(form.durationDays) : null,
      description: form.description.trim(),
    };
    try {
      if (ids.length === 1) {
        await api(`/sellers/${ids[0]}/targets`, { method: 'POST', body });
        flash('🎯 Target given. The store got a chat message and a notification.');
      } else {
        const r = await api('/sellers/targets/bulk', { method: 'POST', body: { ...body, sellerIds: ids } });
        flash(`${r.message}${r.skipped?.length ? ` Skipped: ${r.skipped.map((s) => `${s.storeName || 'store'} (${s.reason})`).join(', ')}` : ''}`);
      }
      setModalOpen(false);
      loadData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (t) => {
    setSideError('');
    setEdit({ t, title: t.title, goal: isSales(t) ? t.targetAmount : t.targetOrders, bonus: t.bonusAmount, deadline: dateInput(t.expiresAt), note: t.adminNote || '' });
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    const { t } = edit;
    setSideError('');
    const p = progressOf(t);
    const goal = Number(edit.goal);
    if (!(goal > p.cur)) return setSideError(`The store is already at ${isSales(t) ? usd(p.cur) : p.cur}. The goal must be more than that.`);
    if (!isSales(t) && !Number.isInteger(goal)) return setSideError('Target orders must be a whole number.');
    if (!(Number(edit.bonus) > 0)) return setSideError('Bonus must be more than $0.');
    if (Number(edit.bonus) < Number(t.bonusAmount) && !window.confirm(`Lower the bonus from ${usd(t.bonusAmount)} to ${usd(edit.bonus)}? The store is told about the change.`)) return;
    const body = {
      title: edit.title.trim(),
      bonusAmount: Number(edit.bonus),
      description: edit.note.trim(),
      expiresAt: edit.deadline ? endOfDay(edit.deadline) : null,
    };
    if (isSales(t)) body.targetAmount = goal;
    else body.targetOrders = goal;
    setBusy(t._id);
    try {
      const r = await api(`/sellers/${t.sellerId}/targets/${t._id}`, { method: 'PATCH', body });
      setEdit(null);
      flash(r.unchanged ? 'Nothing changed.' : `Target updated: ${r.changed.join('; ')}`);
      loadData();
    } catch (err) {
      setSideError(err.message);
    } finally {
      setBusy('');
    }
  };

  const saveCancel = async (e) => {
    e.preventDefault();
    const { t } = cancel;
    setBusy(t._id);
    setSideError('');
    try {
      await api(`/sellers/${t.sellerId}/targets/${t._id}/cancel`, { method: 'POST', body: { reason: cancel.reason.trim(), notifySeller: cancel.tell } });
      setCancel(null);
      flash(`"${t.title}" cancelled for ${t.storeName}. Its record is kept.`);
      loadData();
    } catch (err) {
      setSideError(err.message);
    } finally {
      setBusy('');
    }
  };

  const remove = async (t) => {
    if (!window.confirm(`Remove the ${stateOf(t)} target "${t.title}" of ${t.storeName} from the list?`)) return;
    setBusy(t._id);
    try {
      await api(`/sellers/${t.sellerId}/targets/${t._id}`, { method: 'DELETE' });
      setAllTargets((prev) => prev.filter((x) => x._id !== t._id));
    } catch (err) {
      alert('Could not remove the target: ' + err.message);
    } finally {
      setBusy('');
    }
  };

  // what the page counts: client stores only, unless "Include test" is on
  const scoped = useMemo(() => (scope === 'client' ? allTargets.filter((t) => !t.isTestAccount) : allTargets), [allTargets, scope]);
  const testCount = allTargets.length - allTargets.filter((t) => !t.isTestAccount).length;

  // ── Analytics
  const stats = useMemo(() => {
    const out = { active: 0, completed: 0, expired: 0, cancelled: 0, bonusPaid: 0, bonusHeld: 0, bonusOpen: 0, progressSum: 0, expiringSoon: 0, salesDone: 0, bonusOnSales: 0, merchants: new Set() };
    const progress = [
      { label: '0–24%', count: 0 },
      { label: '25–49%', count: 0 },
      { label: '50–74%', count: 0 },
      { label: '75–99%', count: 0 },
    ];
    const weeks = weekBuckets(12);
    const earners = new Map();
    scoped.forEach((t) => {
      const s = stateOf(t);
      out[s] += 1;
      out.merchants.add(String(t.sellerId));
      const { pct } = progressOf(t);
      if (s === 'active') {
        out.bonusOpen += t.bonusAmount || 0;
        out.progressSum += pct;
        progress[Math.min(3, Math.floor(pct / 25))].count += 1;
        const dl = daysLeft(t);
        if (dl !== null && dl <= 7) out.expiringSoon += 1;
      }
      if (s === 'completed') {
        const paid = t.paidAmount || t.bonusAmount || 0;
        out.bonusPaid += paid;
        if (t.paidTo === 'frozen') out.bonusHeld += paid;
        // order value is counted for targets made since this update (older ones have none)
        if (t.currentAmount > 0) {
          out.salesDone += t.currentAmount;
          out.bonusOnSales += paid;
        }
        const e = earners.get(String(t.sellerId)) || { key: String(t.sellerId), label: t.storeName || 'Store', value: 0, n: 0 };
        e.value += paid;
        e.n += 1;
        earners.set(e.key, e);
      }
      const created = new Date(t.createdAt).getTime();
      const wkA = weeks.find((w) => created >= w.start && created < w.end);
      if (wkA) wkA.assigned += 1;
      if (s === 'completed' && t.completedAt) {
        const done = new Date(t.completedAt).getTime();
        const wkC = weeks.find((w) => done >= w.start && done < w.end);
        if (wkC) {
          wkC.completed += 1;
          wkC.bonus += t.bonusAmount || 0;
        }
      }
    });
    const closed = out.completed + out.expired;
    return {
      ...out,
      merchants: out.merchants.size,
      avgProgress: out.active ? Math.round(out.progressSum / out.active) : 0,
      successRate: closed ? pctOf(out.completed, closed) : null,
      costPct: out.salesDone > 0 ? pctOf(out.bonusOnSales, out.salesDone) : null,
      progress,
      weeks,
      earners: [...earners.values()].sort((a, b) => b.value - a.value).slice(0, 6).map((e) => ({ ...e, sub: `${e.n} target${e.n === 1 ? '' : 's'} completed` })),
      closest: scoped
        .filter((t) => stateOf(t) === 'active')
        .map((t) => ({ t, pct: progressOf(t).pct }))
        .sort((a, b) => b.pct - a.pct)
        .slice(0, 5),
    };
  }, [scoped]);

  const filtered = scoped.filter((t) => {
    const s = stateOf(t);
    if (filterStatus !== 'all' && s !== filterStatus) return false;
    if (!q.trim()) return true;
    const needle = q.trim().toLowerCase();
    return [t.storeName, t.ownerName, t.title, t.email].some((v) => String(v || '').toLowerCase().includes(needle));
  });

  const pickable = sellers.filter((s) => pickTest || !isTestStore(s));
  const sellerOptions = pickable.filter((s) => {
    if (!sellerQ.trim()) return true;
    const needle = sellerQ.trim().toLowerCase();
    return [s.storeName, s.ownerName, s.email].some((v) => String(v || '').toLowerCase().includes(needle));
  });
  const chosen = new Set(form.sellerIds);
  const toggleSeller = (id) => setForm((p) => ({ ...p, sellerIds: chosen.has(id) ? p.sellerIds.filter((x) => x !== id) : [...p.sellerIds, id] }));
  const allShownChosen = sellerOptions.length > 0 && sellerOptions.every((s) => chosen.has(s._id));
  const chooseShown = () =>
    setForm((p) => ({
      ...p,
      sellerIds: allShownChosen ? p.sellerIds.filter((id) => !sellerOptions.some((s) => s._id === id)) : [...new Set([...p.sellerIds, ...sellerOptions.map((s) => s._id)])],
    }));
  const chosenBusy = form.sellerIds.filter((id) => activeBySeller.get(id)).length;
  const hasWeeks = stats.weeks.some((w) => w.assigned || w.completed);
  const fSales = form.metric === 'sales';
  const fTotal = form.metric === 'total';
  const goalNum = fSales ? Number(form.targetAmount) || 0 : Number(form.targetOrderCount) || 0;
  const doneOf = (id) => (totals ? totals[id] || 0 : null);
  const oneStore = form.sellerIds.length === 1 ? sellers.find((x) => x._id === form.sellerIds[0]) : null;
  const oneDone = oneStore ? doneOf(oneStore._id) : null;
  const chosenDone = totals ? form.sellerIds.map((id) => totals[id] || 0) : [];
  const pastGoal = fTotal && totals ? form.sellerIds.filter((id) => (totals[id] || 0) >= goalNum).length : 0;
  // "Total delivered" for one store: when the goal is not above what it already did, start at +50
  // (only when the store or the type changes — never while the admin is typing)
  const totalKey = `${form.metric}|${form.sellerIds.join(',')}|${totals ? 1 : 0}`;
  useEffect(() => {
    if (fTotal && oneDone !== null && goalNum <= oneDone) setF({ targetOrderCount: oneDone + 50 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalKey]);

  const actionsFor = (t, small = true) => {
    const s = stateOf(t);
    const cls = `ins-btn${small ? ' ins-btn-sm' : ''}`;
    if (s === 'active') {
      return (
        <>
          <button type="button" className={cls} onClick={() => openEdit(t)} disabled={busy === t._id} title="Change goal, bonus or deadline (progress is kept)">
            Edit
          </button>
          <button type="button" className={`${cls} ins-btn-bad`} onClick={() => { setSideError(''); setCancel({ t, reason: '', tell: true }); }} disabled={busy === t._id} title="Stop this target (the record is kept)">
            Cancel
          </button>
        </>
      );
    }
    if (s === 'expired' || s === 'cancelled') {
      return (
        <button type="button" className={`${cls} ins-btn-bad`} onClick={() => remove(t)} disabled={busy === t._id} title="Remove from the list">
          {busy === t._id ? 'Removing…' : 'Remove'}
        </button>
      );
    }
    return null;
  };

  const timelineOf = (t) => {
    const s = stateOf(t);
    const dl = daysLeft(t);
    if (s === 'completed' && t.completedAt) return `Reached ${fmtDate(t.completedAt)}`;
    if (s === 'cancelled') return `Cancelled ${t.cancelledAt ? fmtDate(t.cancelledAt) : ''}`;
    if (!t.expiresAt) return 'No deadline';
    if (s === 'expired') return `Ended ${fmtDate(t.expiresAt)}`;
    if (dl <= 0) return 'Ends today';
    return <span style={{ color: dl <= 7 ? '#a5461f' : undefined, fontWeight: dl <= 7 ? 700 : 400 }}>{dl} day{dl === 1 ? '' : 's'} left</span>;
  };

  return (
    <div className="ins-page">
      <Hero
        icon="sparkle"
        tone="amber"
        title="Targets & Bonuses"
        subtitle="Give stores a goal — a number of delivered orders or an amount of delivered sales — and a cash reward. Only deliveries after the target is given count, and the bonus is paid into the wallet automatically the moment the goal is reached."
        actions={
          <>
            <button type="button" className="ins-btn" onClick={loadData} disabled={loading}>
              <Ic name="refresh" size={14} /> {loading ? 'Loading…' : 'Refresh'}
            </button>
            <button type="button" className="ins-btn ins-btn-primary" onClick={() => openModal()}>
              <Ic name="plus" size={15} /> New target
            </button>
          </>
        }
      >
        <MetaChip>{scoped.length} targets</MetaChip>
        <MetaChip>{stats.merchants} stores enrolled</MetaChip>
        {stats.expiringSoon > 0 && <MetaChip>⌛ {stats.expiringSoon} ending within 7 days</MetaChip>}
        {testCount > 0 && (
          <Seg
            small
            label="Which stores"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'client', label: 'Client stores' },
              { value: 'all', label: `+ test (${testCount})` },
            ]}
          />
        )}
      </Hero>

      <ErrorBox error={error} />
      {notice && (
        <div className="ins-callout ins-callout-good" role="status">
          <span aria-hidden="true">✅</span>
          <span>{notice}</span>
        </div>
      )}

      <KpiGrid dim={loading && allTargets.length > 0}>
        <Kpi icon="refresh" tone="blue" label="In progress" value={stats.active} sub={`Average progress ${stats.avgProgress}%`} onClick={() => setFilterStatus('active')} active={filterStatus === 'active'} />
        <Kpi icon="checkCircle" tone="green" label="Completed" value={stats.completed} sub={stats.successRate === null ? 'None closed yet' : `${stats.successRate}% of finished targets were reached`} onClick={() => setFilterStatus('completed')} active={filterStatus === 'completed'} />
        <Kpi icon="banknote" tone="aqua" label="Bonus paid out" value={money(stats.bonusPaid)} sub={stats.bonusHeld > 0 ? `${money(stats.bonusHeld)} of it held (store frozen)` : 'Credited to seller wallets'} />
        <Kpi icon="wallet" tone="orange" label="Bonus still on offer" value={money(stats.bonusOpen)} sub="Due if every open target is reached" />
        <Kpi
          icon="trend"
          tone="slate"
          label="Bonus cost vs sales"
          value={stats.costPct === null ? '—' : `${stats.costPct}%`}
          sub={stats.costPct === null ? 'Shown once new targets are reached' : `${money(stats.bonusOnSales)} bonus on ${money(stats.salesDone)} delivered`}
          title="Bonus paid ÷ order value delivered for those completed targets (targets given before this update have no order value)"
        />
        <Kpi icon="clock" tone="slate" label="Expired" value={stats.expired} sub="Deadline passed before the goal" onClick={() => setFilterStatus('expired')} active={filterStatus === 'expired'} />
      </KpiGrid>

      {scoped.length > 0 && (
        <ChartGrid dim={loading}>
          <Card title="Targets over the last 12 weeks" hint="Assigned vs completed, per week" wide empty={!hasWeeks && 'No targets assigned or completed in the last 12 weeks'}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stats.weeks} margin={{ top: 6, right: 8, left: -18, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} minTickGap={12} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip labelFmt={(l) => `Week of ${l}`} />} />
                <Legend iconType="square" formatter={legendText} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="assigned" name="Assigned" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={16} />
                <Bar dataKey="completed" name="Completed" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Where targets stand" hint={`${scoped.length} targets in total`}>
            <SplitBar
              height={14}
              parts={[
                { label: '⚡ In progress', value: stats.active, color: SERIES[0] },
                { label: '🏆 Completed', value: stats.completed, color: STATUS.good },
                { label: '⌛ Expired', value: stats.expired, color: STATUS.neutral },
                { label: '✕ Cancelled', value: stats.cancelled, color: '#cbd5e1' },
              ]}
            />
          </Card>

          <Card title="How far open targets are" hint="Progress of every target still running" empty={!stats.active && 'No target in progress'}>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.progress} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} content={<ChartTip />} />
                <Bar dataKey="count" name="Targets" radius={[4, 4, 0, 0]} maxBarSize={38}>
                  {stats.progress.map((p, i) => (
                    <Cell key={p.label} fill={PROGRESS_STEPS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Closest to the finish line" hint="Worth a nudge in the seller chat">
            {stats.closest.length === 0 ? (
              <Empty text="No target in progress" />
            ) : (
              <ul className="ins-stats">
                {stats.closest.map(({ t, pct }) => (
                  <li key={t._id}>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="ins-strong ins-clip" style={{ display: 'block' }}>{t.storeName}</span>
                      <span className="ins-sub">
                        {progressText(t)} · {money(t.bonusAmount)}
                      </span>
                      <Meter value={pct} color={PROGRESS_STEPS[Math.min(3, Math.floor(pct / 25))]} height={5} label={`${pct}% done`} />
                    </span>
                    <b>{pct}%</b>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Top bonus earners">
            <RankList rows={stats.earners} color={STATUS.good} empty="No bonus paid yet" />
          </Card>
        </ChartGrid>
      )}

      <div className="ins-table-card">
        <div className="ins-table-head">
          <div>
            <h3>🎯 All targets</h3>
            <span className="ins-card-hint">{filtered.length} shown · newest first</span>
          </div>
          <Toolbar>
            <Seg
              label="Filter by status"
              value={filterStatus}
              onChange={setFilterStatus}
              options={[
                { value: 'all', label: 'All', count: scoped.length },
                { value: 'active', label: 'In progress', count: stats.active },
                { value: 'completed', label: 'Completed', count: stats.completed },
                { value: 'expired', label: 'Expired', count: stats.expired },
                ...(stats.cancelled ? [{ value: 'cancelled', label: 'Cancelled', count: stats.cancelled }] : []),
              ]}
            />
            <SearchBox value={q} onChange={setQ} placeholder="Search store, owner or title…" />
          </Toolbar>
        </div>

        <div className="ins-table-scroll ins-hide-mobile">
          <table className="ins-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Target</th>
                <th style={{ minWidth: 180 }}>Progress</th>
                <th className="num">Bonus</th>
                <th>Status</th>
                <th>Timeline</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && allTargets.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j}><span className="ins-skel" style={{ width: `${50 + ((i + j) % 4) * 12}%` }} /></td>
                    ))}
                  </tr>
                ))}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7}>
                    <Empty icon="🎯" text={scoped.length ? 'No target matches this filter.' : 'No targets yet. Create the first one to motivate your stores.'}>
                      {!scoped.length && (
                        <button type="button" className="ins-btn ins-btn-primary ins-btn-sm" onClick={() => openModal()}>
                          <Ic name="plus" size={13} /> New target
                        </button>
                      )}
                    </Empty>
                  </td>
                </tr>
              )}
              {filtered.map((t) => {
                const s = stateOf(t);
                const meta = STATE_META[s];
                const { pct } = progressOf(t);
                return (
                  <tr key={t._id} className={s === 'cancelled' ? 'tg-row-off' : ''}>
                    <td>
                      <div className="ins-cell-who">
                        <Avatar name={t.storeName} />
                        <div>
                          <b className="ins-clip">{t.storeName || 'Store'}</b>
                          <span className="ins-sub">{t.ownerName || '—'}{t.isTestAccount ? ' · test' : ''}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="ins-strong">{t.title}</span>
                      <span className="ins-sub">
                        {isSales(t) ? '💵 Sales' : isTotal(t) ? '🏁 Total delivered' : '📦 New orders'}: {goalShort(t)}
                        {t.createdBy ? ` · by ${t.createdBy}` : ''}
                      </span>
                      {t.description && <span className="ins-sub ins-clip" title={t.description}>{t.description}</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5, gap: 8 }}>
                        <span>{progressText(t)}</span>
                        <b>{pct}%</b>
                      </div>
                      <Meter value={pct} color={s === 'completed' ? STATUS.good : s === 'active' ? SERIES[0] : STATUS.neutral} label={`${pct}% done`} />
                    </td>
                    <td className="num">
                      <b style={{ color: s === 'completed' ? '#006300' : '#0f172a' }}>{money(t.bonusAmount || 0)}</b>
                      {s === 'completed' && (
                        <span className="ins-sub" style={{ color: t.paidTo === 'frozen' ? '#a5461f' : undefined }}>
                          {t.paidTo === 'frozen' ? '🔒 Held (store frozen)' : 'Paid to wallet'}
                        </span>
                      )}
                    </td>
                    <td>
                      <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                      {s === 'cancelled' && t.cancelReason && <span className="ins-sub ins-clip" title={t.cancelReason}>{t.cancelReason}</span>}
                    </td>
                    <td>
                      <span className="ins-sub">Set {fmtDate(t.createdAt)}</span>
                      <span className="ins-sub">{timelineOf(t)}</span>
                    </td>
                    <td>
                      <div className="ins-actions">{actionsFor(t)}</div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="ins-cards">
          {filtered.map((t) => {
            const s = stateOf(t);
            const meta = STATE_META[s];
            const { pct } = progressOf(t);
            const acts = actionsFor(t);
            return (
              <div className={`ins-mcard${s === 'cancelled' ? ' tg-row-off' : ''}`} key={t._id}>
                <div className="ins-cell-who">
                  <Avatar name={t.storeName} size={30} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{t.storeName}{t.isTestAccount ? ' · test' : ''}</b>
                    <span className="ins-sub">{t.title}</span>
                  </div>
                  <Badge tone={meta.tone} icon={meta.icon}>{meta.label}</Badge>
                </div>
                <div>
                  <div className="ins-mcard-row" style={{ marginBottom: 5 }}>
                    <span>{progressText(t)}</span>
                    <b>{pct}%</b>
                  </div>
                  <Meter value={pct} color={s === 'completed' ? STATUS.good : s === 'active' ? SERIES[0] : STATUS.neutral} />
                </div>
                <div className="ins-mcard-row">
                  <span>
                    Bonus {money(t.bonusAmount || 0)}
                    {s === 'completed' ? (t.paidTo === 'frozen' ? ' · held' : ' · paid') : ''} · {timelineOf(t)}
                  </span>
                </div>
                {acts && <div className="ins-actions">{acts}</div>}
              </div>
            );
          })}
          {!loading && filtered.length === 0 && <Empty icon="🎯" text="No target matches this filter." />}
        </div>
      </div>

      {/* ── New target (one store or many) ── */}
      {modalOpen && (
        <div className="admin-modal-overlay" onClick={() => !saving && setModalOpen(false)}>
          <div className="admin-modal-box tg-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>🎯 New target &amp; bonus</h3>
                <p>Every chosen store gets a chat message and a notification right away.</p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setModalOpen(false)} aria-label="Close">✕</button>
            </div>

            <form className="ins-form" onSubmit={submit}>
              <div className="ins-field">
                <div className="tg-pick-head">
                  <label>Stores * <span className="tg-count">{form.sellerIds.length} chosen</span></label>
                  <label className="tg-inline">
                    <input type="checkbox" checked={pickTest} onChange={(e) => setPickTest(e.target.checked)} /> show test stores
                  </label>
                </div>
                <div className="tg-pick-tools">
                  <input className="ins-input" type="search" value={sellerQ} onChange={(e) => setSellerQ(e.target.value)} placeholder="Type to filter stores…" />
                  <button type="button" className="ins-btn ins-btn-sm" onClick={chooseShown} disabled={!sellerOptions.length}>
                    {allShownChosen ? 'Unselect shown' : `Select all shown (${sellerOptions.length})`}
                  </button>
                </div>
                <div className="tg-pick-list" role="listbox" aria-multiselectable="true">
                  {sellerOptions.length === 0 && <div className="tg-pick-empty">No active store matches.</div>}
                  {sellerOptions.map((s) => {
                    const running = activeBySeller.get(s._id) || 0;
                    return (
                      <label key={s._id} className={`tg-pick-item${chosen.has(s._id) ? ' on' : ''}`}>
                        <input type="checkbox" checked={chosen.has(s._id)} onChange={() => toggleSeller(s._id)} />
                        <span className="tg-pick-name">
                          <b>{s.storeName}</b>
                          <small>
                            {s.ownerName}{isTestStore(s) ? ' · test' : ''}
                            {totals && ` · ${doneOf(s._id)} delivered`}
                          </small>
                        </span>
                        {fTotal && totals && doneOf(s._id) >= goalNum && goalNum > 0 && <span className="tg-pick-busy" title="Already at or past the total goal — will be skipped">already {doneOf(s._id)}</span>}
                        {running > 0 && <span className="tg-pick-busy" title="Targets already running for this store">{running} running</span>}
                      </label>
                    );
                  })}
                </div>
                {chosenBusy > 0 && (
                  <small style={{ color: '#b45309', fontWeight: 700 }}>
                    ⚠️ {chosenBusy === 1 && form.sellerIds.length === 1 ? 'This store already has' : `${chosenBusy} of the chosen stores already have`} a target in progress. Every delivery counts towards ALL of them, so the bonuses add up.
                  </small>
                )}
              </div>

              <div className="ins-field">
                <span className="ins-label">Type of target</span>
                <div className="tg-kinds" role="radiogroup" aria-label="Type of target">
                  {KINDS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      role="radio"
                      aria-checked={form.metric === k.value}
                      className={`tg-kind${form.metric === k.value ? ' on' : ''}`}
                      onClick={() => {
                        if (form.metric === k.value) return;
                        const p = PRESETS[k.value][0];
                        setF(k.value === 'sales' ? { metric: k.value, targetAmount: p.goal, bonusAmount: p.bonus, durationDays: p.days } : { metric: k.value, targetOrderCount: p.goal, bonusAmount: p.bonus, durationDays: p.days });
                      }}
                    >
                      <span className="tg-kind-icon" aria-hidden="true">{k.icon}</span>
                      <b>{k.label}</b>
                      <small>{k.example}</small>
                    </button>
                  ))}
                </div>
                <small>
                  {fSales
                    ? 'Counts the value of every order delivered from today. Bigger orders bring the store closer faster.'
                    : fTotal
                      ? "Counts the store's whole history: the orders it has already delivered plus every new one. The bonus comes when the total is reached."
                      : 'Counts only orders delivered from today — every order counts as one.'}
                </small>
              </div>

              <div className="ins-field">
                <span className="ins-label">Quick presets</span>
                <Seg
                  small
                  label="Target presets"
                  value={`${goalNum}-${form.bonusAmount}`}
                  onChange={(v) => {
                    const p = PRESETS[form.metric].find((x) => `${x.goal}-${x.bonus}` === v);
                    if (p) setF(fSales ? { targetAmount: p.goal, bonusAmount: p.bonus, durationDays: p.days } : { targetOrderCount: p.goal, bonusAmount: p.bonus, durationDays: p.days });
                  }}
                  options={PRESETS[form.metric].map((p) => ({ value: `${p.goal}-${p.bonus}`, label: fSales ? `${usd(p.goal)} → ${usd(p.bonus)}` : fTotal ? `${p.goal} total → $${p.bonus}` : `${p.goal} orders → $${p.bonus}` }))}
                />
              </div>

              <div className="ins-field">
                <label>Title *</label>
                <input className="ins-input" value={form.title} onChange={(e) => setF({ title: e.target.value, titleTouched: true })} maxLength={120} required />
              </div>

              <div className="ins-form-grid">
                <div className="ins-field">
                  {fSales ? (
                    <>
                      <label>Delivered sales needed (USD) *</label>
                      <input className="ins-input" type="number" min="1" step="0.01" value={form.targetAmount} onChange={(e) => setF({ targetAmount: e.target.value })} required />
                    </>
                  ) : (
                    <>
                      <label>{fTotal ? 'Total delivered orders to reach *' : 'New orders needed *'}</label>
                      <input className="ins-input" type="number" min="1" step="1" value={form.targetOrderCount} onChange={(e) => setF({ targetOrderCount: e.target.value })} required />
                    </>
                  )}
                </div>
                <div className="ins-field">
                  <label>Cash bonus (USD) *</label>
                  <input className="ins-input" type="number" min="1" step="0.01" value={form.bonusAmount} onChange={(e) => setF({ bonusAmount: e.target.value })} required />
                </div>
              </div>

              {fTotal && form.sellerIds.length > 0 && (
                <div className="tg-total">
                  {!totals ? (
                    <span>Counting delivered orders…</span>
                  ) : oneStore ? (
                    <>
                      <div className="tg-total-line">
                        <span><b>{oneStore.storeName}</b> has delivered</span>
                        <b className="tg-total-num">{oneDone}</b>
                        <span>orders</span>
                        {goalNum > oneDone ? (
                          <span className="tg-total-need">→ needs <b>{goalNum - oneDone}</b> more to reach {goalNum}</span>
                        ) : (
                          <span className="tg-total-bad">→ already past {goalNum}, choose a higher total</span>
                        )}
                      </div>
                      <div className="tg-total-quick">
                        <span>Set goal:</span>
                        {[20, 50, 100].map((n) => (
                          <button key={n} type="button" className={`ins-btn ins-btn-sm${goalNum === oneDone + n ? ' tg-on' : ''}`} onClick={() => setF({ targetOrderCount: oneDone + n })}>
                            +{n} → {oneDone + n}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="tg-total-line">
                      <span>
                        The {form.sellerIds.length} stores have delivered <b>{Math.min(...chosenDone)}–{Math.max(...chosenDone)}</b> orders so far.
                      </span>
                      {pastGoal > 0 && <span className="tg-total-bad">{pastGoal} already at or past {goalNum} — they will be skipped.</span>}
                    </div>
                  )}
                </div>
              )}

              <div className="ins-field">
                <label>Deadline (days)</label>
                <input className="ins-input" type="number" min="1" step="1" value={form.durationDays} onChange={(e) => setF({ durationDays: e.target.value })} placeholder="Leave empty for no deadline" />
                <small>
                  {form.durationDays
                    ? `Ends on ${new Date(Date.now() + Number(form.durationDays) * DAY).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}. The store gets a "1 day left" reminder; deliveries after the end no longer count.`
                    : 'No deadline: the target stays open until it is reached or cancelled.'}
                </small>
              </div>

              <div className="ins-field">
                <label>Message to the seller</label>
                <textarea className="ins-input" rows={2} value={form.description} maxLength={500} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value, descTouched: true }))} />
              </div>

              <div className="ins-callout ins-callout-info">
                <span aria-hidden="true">💡</span>
                <span>
                  {fSales ? (
                    <>
                      Cost: <b>{usd(form.bonusAmount)}</b> for <b>{usd(goalNum)}</b> of delivered orders — <b>{pctOf(Number(form.bonusAmount) || 0, Math.max(1, goalNum))}%</b> of the sales.
                    </>
                  ) : fTotal ? (
                    oneStore && oneDone !== null && goalNum > oneDone ? (
                      <>
                        Cost: <b>{usd(form.bonusAmount)}</b> for <b>{goalNum - oneDone}</b> new delivered orders — <b>{usd((Number(form.bonusAmount) || 0) / (goalNum - oneDone))}</b> per new order.
                      </>
                    ) : (
                      <>
                        Cost: <b>{usd(form.bonusAmount)}</b> per store that reaches <b>{goalNum}</b> delivered orders in total.
                      </>
                    )
                  ) : (
                    <>
                      Cost: <b>{usd(form.bonusAmount)}</b> for <b>{goalNum}</b> delivered orders — <b>{usd((Number(form.bonusAmount) || 0) / Math.max(1, goalNum))}</b> per order.
                    </>
                  )}
                  {form.sellerIds.length > 1 && (
                    <>
                      {' '}
                      For {form.sellerIds.length} stores: up to <b>{usd((Number(form.bonusAmount) || 0) * form.sellerIds.length)}</b> if every store reaches it.
                    </>
                  )}
                </span>
              </div>

              {formError && <ErrorBox error={formError} />}

              <div className="ins-modal-foot">
                <button type="button" className="ins-btn" onClick={() => setModalOpen(false)} disabled={saving}>Cancel</button>
                <button type="submit" className="ins-btn ins-btn-primary" disabled={saving || !form.sellerIds.length}>
                  {saving ? 'Saving…' : form.sellerIds.length > 1 ? `Give to ${form.sellerIds.length} stores` : 'Assign target'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit a running target ── */}
      {edit && (
        <div className="admin-modal-overlay" onClick={() => !busy && setEdit(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>✏️ Edit target</h3>
                <p>{edit.t.storeName} · now at {progressText(edit.t)}. The progress is kept.</p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setEdit(null)} aria-label="Close">✕</button>
            </div>
            <form className="ins-form" onSubmit={saveEdit}>
              <div className="ins-field">
                <label>Title *</label>
                <input className="ins-input" value={edit.title} onChange={(e) => setEdit((p) => ({ ...p, title: e.target.value }))} maxLength={120} required />
              </div>
              <div className="ins-form-grid">
                <div className="ins-field">
                  <label>{isSales(edit.t) ? 'Delivered sales needed (USD) *' : isTotal(edit.t) ? 'Total delivered orders to reach *' : 'New orders needed *'}</label>
                  <input className="ins-input" type="number" min="1" step={isSales(edit.t) ? '0.01' : '1'} value={edit.goal} onChange={(e) => setEdit((p) => ({ ...p, goal: e.target.value }))} required />
                </div>
                <div className="ins-field">
                  <label>Cash bonus (USD) *</label>
                  <input className="ins-input" type="number" min="1" step="0.01" value={edit.bonus} onChange={(e) => setEdit((p) => ({ ...p, bonus: e.target.value }))} required />
                </div>
              </div>
              <div className="ins-field">
                <label>Deadline</label>
                <div className="tg-pick-tools">
                  <input className="ins-input" type="date" min={dateInput(new Date())} value={edit.deadline} onChange={(e) => setEdit((p) => ({ ...p, deadline: e.target.value }))} />
                  {edit.deadline && (
                    <button type="button" className="ins-btn ins-btn-sm" onClick={() => setEdit((p) => ({ ...p, deadline: '' }))}>No deadline</button>
                  )}
                </div>
                <small>{edit.deadline ? `Ends at the end of ${new Date(`${edit.deadline}T12:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}.` : 'No deadline.'}</small>
              </div>
              <div className="ins-field">
                <label>Message to the seller</label>
                <textarea className="ins-input" rows={2} maxLength={500} value={edit.note} onChange={(e) => setEdit((p) => ({ ...p, note: e.target.value }))} />
              </div>
              {edit.t.changes?.length > 0 && (
                <details className="tg-history">
                  <summary>History ({edit.t.changes.length})</summary>
                  <ul>
                    {[...edit.t.changes].reverse().map((c, i) => (
                      <li key={i}>
                        <b>{c.at ? fmtDate(c.at) : ''}</b> {c.by ? `· ${c.by}` : ''} — {c.what}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="ins-callout ins-callout-info">
                <span aria-hidden="true">ℹ️</span>
                <span>A change of goal, bonus or deadline is shown to the store as a notification.</span>
              </div>
              {sideError && <ErrorBox error={sideError} />}
              <div className="ins-modal-foot">
                <button type="button" className="ins-btn" onClick={() => setEdit(null)} disabled={!!busy}>Close</button>
                <button type="submit" className="ins-btn ins-btn-primary" disabled={!!busy}>{busy ? 'Saving…' : 'Save changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Cancel a running target ── */}
      {cancel && (
        <div className="admin-modal-overlay" onClick={() => !busy && setCancel(null)}>
          <div className="admin-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="ins-modal-head">
              <div>
                <h3>Cancel target</h3>
                <p>
                  “{cancel.t.title}” for {cancel.t.storeName} — at {progressText(cancel.t)}. No bonus will be paid for it. The record stays in the list.
                </p>
              </div>
              <button type="button" className="ins-modal-close" onClick={() => setCancel(null)} aria-label="Close">✕</button>
            </div>
            <form className="ins-form" onSubmit={saveCancel}>
              <div className="ins-field">
                <label>Reason (only admins see it)</label>
                <input className="ins-input" value={cancel.reason} maxLength={300} onChange={(e) => setCancel((p) => ({ ...p, reason: e.target.value }))} placeholder="e.g. given to the wrong store" />
              </div>
              <label className="tg-inline">
                <input type="checkbox" checked={cancel.tell} onChange={(e) => setCancel((p) => ({ ...p, tell: e.target.checked }))} /> Tell the store the target is closed
              </label>
              {sideError && <ErrorBox error={sideError} />}
              <div className="ins-modal-foot">
                <button type="button" className="ins-btn" onClick={() => setCancel(null)} disabled={!!busy}>Keep it</button>
                <button type="submit" className="ins-btn ins-btn-bad" disabled={!!busy}>{busy ? 'Cancelling…' : 'Cancel target'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
