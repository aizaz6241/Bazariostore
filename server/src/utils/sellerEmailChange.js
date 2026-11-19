/**
 * CHANGE A SELLER'S EMAIL (admin) — the email is also the store's LOGIN, so it is checked well:
 *   - a real email format (max 120 letters), saved lowercase;
 *   - not used by another store, a customer, a team admin or a team member's admin login — the one
 *     login box (routes/anyLogin.js) finds the account by email, so two accounts with one email
 *     would make one of them impossible to log in to;
 *   - the store's password and current sessions stay as they are (only the address changes).
 * After saving, both addresses can be told (old: "your login email was changed", new: "this is
 * now your login email") so a wrong change is noticed at once.
 */
import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import { cleanEmail } from './password.js';
import { emailQuery } from './emailLookup.js';
import { sendLoginEmailChangedEmail } from '../services/email.service.js';

const FORMAT = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

/** → { email } (cleaned, lowercase) or { status, message } */
export async function checkNewSellerEmail(seller, raw) {
  const email = cleanEmail(raw).toLowerCase();
  if (!email) return { status: 400, message: 'Enter the new email address.' };
  if (email.length > 120 || !FORMAT.test(email)) return { status: 400, message: 'This is not a valid email address.' };
  if (email === String(seller.email || '').toLowerCase().trim()) return { email, same: true };
  const [otherSeller, admin, teamLogin, customer] = await Promise.all([
    Seller.findOne({ ...emailQuery(Seller, email), _id: { $ne: seller._id } }).select('storeName').lean(),
    Admin.exists(emailQuery(Admin, email)),
    Admin.exists({ teamLogins: email }),
    User.exists(emailQuery(User, email)),
  ]);
  if (otherSeller) return { status: 409, message: `This email is already used by another store (${otherSeller.storeName || 'a store'}).` };
  if (admin || teamLogin) return { status: 409, message: 'This email belongs to a team account — use another email.' };
  if (customer) return { status: 409, message: 'This email is already used by a customer account — use another email.' };
  return { email };
}

const mask = (e) => {
  const [u = '', d = ''] = String(e || '').split('@');
  return `${u.slice(0, 2)}${'*'.repeat(Math.max(2, Math.min(6, u.length - 2)))}@${d}`;
};

/** Tells the old and the new address (in the background; a failed email never breaks the change). */
export function tellEmailChanged({ name, storeName, oldEmail, newEmail }) {
  const jobs = [];
  if (newEmail) jobs.push(sendLoginEmailChangedEmail({ to: newEmail, name, storeName, newEmail, isNew: true }));
  if (oldEmail && oldEmail !== newEmail) jobs.push(sendLoginEmailChangedEmail({ to: oldEmail, name, storeName, newEmail: mask(newEmail), isNew: false }));
  return Promise.allSettled(jobs).catch(() => {});
}
