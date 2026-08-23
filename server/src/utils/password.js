import bcrypt from 'bcryptjs';

// Mobile keyboards (specially Arabic/bilingual ones) silently insert invisible
// characters (zero-width, RTL/LTR marks), non-breaking spaces, or extra spaces
// (autocomplete: "admin 123"). We try a few cleaned variants of the typed
// password so a visually-correct password always logs in. Password itself is
// never logged anywhere.
const INVISIBLE = /[​-‏⁠﻿]/g;
const NBSP = / /g;

export function passwordCandidates(raw) {
  const s = String(raw || '');
  const set = new Set();
  const add = (v) => {
    if (v) set.add(v);
  };
  add(s);
  add(s.trim());
  const cleaned = s.normalize('NFKC').replace(INVISIBLE, '').replace(NBSP, ' ');
  add(cleaned);
  add(cleaned.trim());
  add(cleaned.replace(/\s+/g, '')); // autocomplete ki beech wali spaces
  // Android keyboards kabhi pehla harf khud capital kar dete hain — dono case try karo
  for (const v of [...set]) {
    if (v[0]) {
      add(v[0].toLowerCase() + v.slice(1));
      add(v[0].toUpperCase() + v.slice(1));
    }
  }
  return [...set];
}

export async function comparePassword(raw, hash) {
  if (!raw || !hash || typeof hash !== 'string') return false;
  try {
    for (const candidate of passwordCandidates(raw)) {
      try {
        if (await bcrypt.compare(candidate, hash)) return true;
      } catch {}
    }
  } catch {
    return false;
  }
  return false;
}

// emails mein spaces/invisible chars kabhi valid nahi hote — sab hata do
export function cleanEmail(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(NBSP, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}
