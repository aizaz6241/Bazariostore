'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { Modal, Field, Button, Banner, inputClass, api, fmtInt } from '@/components/ui/kit';
import { SOURCES } from './meta';

/**
 * Many leads at once: paste a list (one seller per line: name, phone, country) or pick a CSV
 * file. Numbers already taken are skipped and listed back, so nothing is given twice.
 */

// one line → { name, phone, country }; the phone is the part with the most digits
function parseLine(line) {
  const parts = line
    .split(/[,;\t|]/)
    .map((p) => p.trim().replace(/^"|"$/g, ''))
    .filter(Boolean);
  if (!parts.length) return null;
  let phoneIdx = -1;
  let best = 0;
  parts.forEach((p, i) => {
    const d = p.replace(/\D+/g, '').length;
    if (d > best && d >= 7 && /^[\d\s+()\-.]+$/.test(p)) {
      best = d;
      phoneIdx = i;
    }
  });
  if (phoneIdx === -1) return { name: parts[0], phone: '', country: '' };
  const rest = parts.filter((_, i) => i !== phoneIdx);
  const country = rest.find((p) => /^[A-Za-z]{2,3}$/.test(p)) || '';
  const name = rest.filter((p) => p !== country).join(' ');
  return { name, phone: parts[phoneIdx], country };
}

export function parseList(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // a header row ("name,phone,…") is skipped
  if (lines.length && /name|phone|number|whatsapp/i.test(lines[0]) && !/\d{7,}/.test(lines[0].replace(/\D+/g, ''))) lines.shift();
  return lines.map(parseLine).filter(Boolean);
}

export default function ImportModal({ open, onClose, onDone, isAdmin, members = [] }) {
  const [text, setText] = useState('');
  const [memberId, setMemberId] = useState('');
  const [source, setSource] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (open) {
      setText('');
      setMemberId('');
      setSource(isAdmin ? '' : 'self');
      setError('');
      setResult(null);
    }
  }, [open, isAdmin]);

  const rows = useMemo(() => parseList(text), [text]);
  const valid = rows.filter((r) => r.phone.replace(/\D+/g, '').length >= 7);
  const max = isAdmin ? 2000 : 200;

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.readAsText(f);
    e.target.value = '';
  };

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api('/api/leads/bulk', { method: 'POST', body: { action: 'import', rows, memberId: memberId || null, source: source || undefined } });
      setResult(r);
      onDone?.(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="max-w-2xl"
      title="Import leads"
      subtitle="Paste a list or choose a CSV file. Numbers that someone already has are skipped automatically."
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={run} loading={busy} disabled={!valid.length || rows.length > max} icon={Upload}>
              Import {valid.length ? fmtInt(valid.length) : ''} lead{valid.length === 1 ? '' : 's'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Added" value={result.added} tone="text-emerald-700" />
            <Stat label="Skipped (taken)" value={result.skipped?.length || 0} tone="text-amber-700" />
            <Stat label="No valid number" value={(result.invalid?.length || 0) + (result.repeated?.length || 0)} tone="text-slate-500" />
          </div>
          {!!result.skipped?.length && (
            <div>
              <p className="text-xs font-bold text-slate-700 mb-2">Skipped, because someone already has them</p>
              <ul className="max-h-60 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-2xl">
                {result.skipped.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold text-slate-900">{s.phone}</span>
                      {s.name && <span className="text-slate-500"> · {s.name}</span>}
                    </span>
                    <span className="text-amber-700 font-semibold shrink-0 text-right">{s.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex-1 flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-300 hover:border-slate-400 cursor-pointer transition-colors">
              <FileSpreadsheet className="w-5 h-5 text-slate-500" />
              <span className="text-sm">
                <span className="font-semibold text-slate-900">Choose a CSV file</span>
                <span className="block text-[11px] text-slate-500">Columns: name, phone, country (any order)</span>
              </span>
              <input type="file" accept=".csv,.txt,text/csv,text/plain" className="hidden" onChange={onFile} />
            </label>
          </div>
          <Field label="…or paste the list" hint="One seller per line, e.g.  Rahul Sharma, +91 98765 43210, IN">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              placeholder={'Rahul Sharma, +91 98765 43210, IN\nPriya Patel, +91 91234 56789, IN'}
              className={`${inputClass} font-mono text-xs`}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isAdmin && (
              <Field label="Give all of them to" hint="Leave empty to keep them in the pool.">
                <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputClass}>
                  <option value="">Not given yet (pool)</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Where were they found?">
              <select value={source} onChange={(e) => setSource(e.target.value)} className={inputClass}>
                <option value="">Choose…</option>
                {Object.entries(SOURCES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!!rows.length && (
            <p className="text-xs text-slate-600">
              <span className="font-bold text-slate-900">{fmtInt(valid.length)}</span> with a phone number
              {rows.length - valid.length > 0 && <span className="text-amber-700"> · {rows.length - valid.length} line(s) without a usable number</span>}
              {rows.length > max && <span className="text-red-600"> · at most {fmtInt(max)} per import</span>}
            </p>
          )}
          {error && <Banner tone="danger">{error}</Banner>}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-3 text-center">
      <p className={`text-2xl font-extrabold tabular-nums ${tone}`}>{fmtInt(value)}</p>
      <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{label}</p>
    </div>
  );
}
