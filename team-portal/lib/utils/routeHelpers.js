import mongoose from 'mongoose';
import { NextResponse } from 'next/server';

export const ok = (body, status = 200) => NextResponse.json(body, { status });
export const fail = (message, status = 400, extra = {}) => NextResponse.json({ message, ...extra }, { status });

export const isOid = (v) => !!v && mongoose.Types.ObjectId.isValid(String(v));
export const oid = (v) => (isOid(v) ? new mongoose.Types.ObjectId(String(v)) : null);
export const sid = (v) => (v ? String(v) : '');

export const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const money = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

/** A date typed in a form ("2026-10-20") or null. */
export const dateOrNull = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Same day next month (31 Jan → 28/29 Feb, never jumps into March). */
export function addMonth(date) {
  const d = new Date(date);
  const day = d.getUTCDate();
  const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1, d.getUTCHours(), d.getUTCMinutes()));
  const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, last));
  return out;
}

export const byOf = (session) => ({ by: session?._id || null, byName: session?.name || '' });
