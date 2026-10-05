import bcrypt from 'bcryptjs';

// Mobile keyboards (specially Arabic/bilingual ones) silently insert invisible
// characters (zero-width, RTL/LTR marks), non-breaking spaces, or extra spaces
// (autocomplete: "admin 123"). We try a few cleaned variants of the typed
// password so a visually-correct password always logs in. Password itself is
// never logged anywhere.
const INVISIBLE = /[​-‏⁠﻿]/g;
const NBSP = / /g;

// At most 4 spellings are tried (it used to be up to ten, each one a full bcrypt check):
//   1. exactly as typed
//   2. cleaned: invisible characters removed, odd spaces normalised, ends trimmed
//   3. cleaned with the spaces a keyboard's autocomplete put in the middle removed
//   4. cleaned with the first letter's case flipped (phones capitalise the first letter)
// Guessing is stopped by the login rate limit, not by being strict about a stray capital.
export function passwordCandidates(raw) {
  const s = String(raw || '').slice(0, 200);
  const out = [];
  const add = (v) => {
    if (v && !out.includes(v) && out.length < 4) out.push(v);
  };
  add(s);
  const cleaned = s.normalize('NFKC').replace(INVISIBLE, '').replace(NBSP, ' ').trim();
  add(cleaned);
  add(cleaned.replace(/\s+/g, ''));
  if (cleaned[0]) {
    const flipped = cleaned[0] === cleaned[0].toLowerCase() ? cleaned[0].toUpperCase() : cleaned[0].toLowerCase();
    add(flipped + cleaned.slice(1));
  }
  return out;
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
