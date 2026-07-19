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
  return [...set];
}

export async function comparePassword(raw, hash) {
  for (const candidate of passwordCandidates(raw)) {
    if (await bcrypt.compare(candidate, hash)) return true;
  }
  return false;
}

// emails mein spaces/invisible chars kabhi valid nahi hote — sab hata do
export function cleanEmail(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}
