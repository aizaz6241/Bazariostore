import { useEffect, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { api, money, fmtDay, downloadFile } from '../api.js';
import { Modal, ErrorBox, F } from './ui.jsx';
import Ic from '../components/Icons.jsx';

const EXPENSE_TYPES = ['delivery', 'packaging', 'marketing', 'refund', 'misc'];

function rangeFor(preset) {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (preset === 'today') return { from: iso(now), to: iso(now) };
  if (preset === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: iso(d), to: iso(now) };
  }
  if (preset === 'month') return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
  if (preset === 'year') return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(now) };
  return { from: '', to: '' };
}

export default function Finance() {
  const [range, setRange] = useState(rangeFor('month'));
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [profit, setProfit] = useState([]);
  const [addExp, setAddExp] = useState(null);
  const [error, setError] = useState('');

  const qs = () => {
    const p = new URLSearchParams();
    if (range.from) p.set('from', range.from);
    if (range.to) p.set('to', range.to);
    return p.toString();
  };

  const load = () => {
    api('/finance/summary?' + qs()).then(setSummary).catch((e) => setError(e.message));
    api('/finance/expenses?' + qs()).then(setExpenses).catch(() => {});
    api('/finance/product-profit').then(setProfit).catch(() => {});
  };
  useEffect(load, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveExpense = async (e) => {
    e.preventDefault();
    try {
      await api('/finance/expenses', { method: 'POST', body: addExp });
      setAddExp(null);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const delExpense = async (id) => {
    await api(`/finance/expenses/${id}`, { method: 'DELETE' });
    load();
  };

  if (!summary) return <p className="muted">Loading…</p>;

  const monthlyChart = (summary.monthly || []).map((m) => ({ label: m._id, revenue: m.revenue }));

  return (
    <>
      <div className="admin-h1-row">
        <h1 className="admin-h1">Finance</h1>
        <div className="export-btns">
          {['csv', 'xlsx', 'pdf'].map((f) => (
            <button key={f} className="btn-outline btn-sm" onClick={() => downloadFile(`/reports/finance?format=${f}&${qs()}`, `finance.${f}`)}>
              {f.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="admin-toolbar">
        {['today', 'week', 'month', 'year', 'all'].map((p) => (
          <button key={p} className="chip" onClick={() => setRange(rangeFor(p))}>{p === 'all' ? 'All Time' : p[0].toUpperCase() + p.slice(1)}</button>
        ))}
        <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <span className="muted">→</span>
        <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      <ErrorBox error={error} />

      <div className="stat-grid stat-grid-4">
        {[
          { label: 'Total Revenue', value: money(summary.revenue), icon: 'banknote' },
          { label: 'COGS (purchase cost)', value: money(summary.costs.cogs), icon: 'tag' },
          { label: 'Gross Profit', value: money(summary.grossProfit), icon: 'sparkle' },
          { label: 'Net Profit', value: money(summary.netProfit), icon: 'checkCircle', danger: summary.netProfit < 0 },
        ].map((c) => (
          <div className="card stat-card" key={c.label}>
            <i><Ic name={c.icon} size={22} /></i>
            <div><b className={c.danger ? 'stock-out' : ''}>{c.value}</b><small>{c.label}</small></div>
          </div>
        ))}
      </div>

      <div className="chart-grid">
        <div className="card chart-card chart-wide">
          <h3>Monthly Revenue (last 12 months)</h3>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={monthlyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3d3de" />
              <XAxis dataKey="label" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip formatter={(v) => money(v)} />
              <Bar dataKey="revenue" fill="#e0446e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card chart-card">
          <h3>Breakdown (selected period)</h3>
          <ul className="fin-breakdown">
            <li><span>Revenue ({summary.orderCount} orders)</span><b>{money(summary.revenue)}</b></li>
            <li><span>− Purchase cost (COGS)</span><b>{money(summary.costs.cogs)}</b></li>
            <li><span>− Product delivery costs</span><b>{money(summary.costs.delivery)}</b></li>
            <li><span>− Packaging costs</span><b>{money(summary.costs.packaging)}</b></li>
            <li><span>− Tax</span><b>{money(summary.costs.tax)}</b></li>
            {EXPENSE_TYPES.map((t) => (
              <li key={t}><span>− Expense: {t}</span><b>{money(summary.expenseByType[t] || 0)}</b></li>
            ))}
            <li className="fin-total"><span>Net Profit</span><b className={summary.netProfit < 0 ? 'stock-out' : 'stock-ok'}>{money(summary.netProfit)}</b></li>
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Expenses</h3>
          <button className="btn-primary btn-sm" onClick={() => setAddExp({ type: 'misc', amount: '', note: '', date: new Date().toISOString().slice(0, 10) })}>
            <Ic name="plus" size={13} /> ADD EXPENSE
          </button>
        </div>
        {expenses.length === 0 ? (
          <p className="muted">Is period mein koi expense entry nahi.</p>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th><th>By</th><th /></tr></thead>
            <tbody>
              {expenses.map((e) => (
                <tr key={e._id}>
                  <td>{fmtDay(e.date)}</td>
                  <td><span className="pay-chip">{e.type.toUpperCase()}</span></td>
                  <td>{money(e.amount)}</td>
                  <td>{e.note}</td>
                  <td>{e.createdBy}</td>
                  <td><button className="row-link danger" onClick={() => delExpense(e._id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h3>Product Cost & Profit</h3>
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr><th>Product</th><th>Price</th><th>Unit Cost</th><th>Net/Unit</th><th>Margin</th><th>Units Sold</th><th>Revenue</th><th>Gross Profit</th><th>Net Profit</th><th>Stock Left</th></tr>
            </thead>
            <tbody>
              {profit.map((p) => (
                <tr key={p._id}>
                  <td><b>{p.name}</b></td>
                  <td>{money(p.price)}</td>
                  <td>{money(p.unitCost)}</td>
                  <td className={p.netProfitUnit < 0 ? 'stock-out' : ''}>{money(p.netProfitUnit)}</td>
                  <td>{p.margin}%</td>
                  <td>{p.sold}</td>
                  <td>{money(p.revenue)}</td>
                  <td>{money(p.grossProfit)}</td>
                  <td className={p.netProfit < 0 ? 'stock-out' : 'stock-ok'}>{money(p.netProfit)}</td>
                  <td>{p.stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {addExp && (
        <Modal title="Add Expense" onClose={() => setAddExp(null)}>
          <form onSubmit={saveExpense}>
            <F label="Type">
              <select value={addExp.type} onChange={(e) => setAddExp({ ...addExp, type: e.target.value })}>
                {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
              </select>
            </F>
            <F label="Amount (Rs)"><input type="number" value={addExp.amount} onChange={(e) => setAddExp({ ...addExp, amount: e.target.value })} required min={1} /></F>
            <F label="Date"><input type="date" value={addExp.date} onChange={(e) => setAddExp({ ...addExp, date: e.target.value })} /></F>
            <F label="Note"><input value={addExp.note} onChange={(e) => setAddExp({ ...addExp, note: e.target.value })} /></F>
            <div className="form-actions">
              <button className="btn-primary">SAVE</button>
              <button type="button" className="btn-outline" onClick={() => setAddExp(null)}>CANCEL</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
