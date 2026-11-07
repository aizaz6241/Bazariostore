import bcrypt from 'bcryptjs';

/**
 * FAST login lookups by email — stays fast with millions of accounts.
 *
 * Every email field is saved lowercase (schema: lowercase + unique index), so a login only needs
 * an EXACT match, which MongoDB answers from the unique index in about a millisecond however many
 * accounts there are. The old lookup also tried a case-insensitive regex (`/^email$/i`) for old
 * records saved with capital letters — but such a regex can not use the index: it read the
 * whole email index on EVERY login (and on every made-up email an attacker sends).
 *
 * Old capital-letter records (if any exist) are found ONCE, in the background after start-up,
 * and kept in a small map (lowercase → as saved). New records are always lowercase, so the map
 * never grows. Until that one-time check has finished, the old regex is used as before.
 */
/** A real bcrypt hash of a random throw-away value (cost 10, like the stored passwords): an
 *  unknown email is checked against it, so it takes as long as a wrong password.
 *  Made on first use (not at start-up), so starting the server does no extra work. */
let dummy = '';
export function dummyHash() {
  if (!dummy) dummy = bcrypt.hashSync(`no-account-${Math.random()}-${Date.now()}`, 10);
  return dummy;
}

const legacy = new Map(); // model name → Map(lowercase email → email as saved)
const ready = new Set(); // model names whose check has finished

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Run once after the database is connected (in the background, never blocks a request). */
export async function loadLegacyEmails(models) {
  for (const model of models) {
    const name = model.modelName;
    try {
      // the only full read of the email index — once per start-up, not once per login
      const rows = await model.find({ email: { $regex: /[A-Z]/ } }).select('email').lean();
      const m = new Map();
      rows.forEach((r) => r.email && m.set(String(r.email).toLowerCase(), r.email));
      legacy.set(name, m);
      ready.add(name);
      if (m.size) console.log(`[email-lookup] ${name}: ${m.size} old email(s) with capital letters`);
    } catch (err) {
      console.error(`[email-lookup] ${name}:`, err.message); // keeps the old (slower) lookup
    }
  }
}

/**
 * The query for one cleaned (lowercase) email — or several (a store's second address).
 * Uses the unique index; falls back to the old case-insensitive match only until the
 * one-time check above is done.
 */
export function emailQuery(model, emails) {
  const list = (Array.isArray(emails) ? emails : [emails]).filter(Boolean);
  const name = model.modelName;
  if (!ready.has(name)) {
    return { $or: list.flatMap((e) => [{ email: e }, { email: { $regex: new RegExp(`^${escapeRe(e)}$`, 'i') } }]) };
  }
  const m = legacy.get(name);
  const all = [...list];
  list.forEach((e) => {
    const saved = m?.get(e);
    if (saved && !all.includes(saved)) all.push(saved);
  });
  return all.length === 1 ? { email: all[0] } : { email: { $in: all } };
}
