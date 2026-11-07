import Admin from '../models/Admin.js';
import Seller from '../models/Seller.js';
import User from '../models/User.js';
import { asText } from '../middleware/sanitize.js';
import { cleanEmail, comparePassword } from '../utils/password.js';
import { failureLimiter } from '../utils/rateLimit.js';
import { emailQuery, DUMMY_HASH } from '../utils/emailLookup.js';

/**
 * ONE login box for everybody (POST /api/auth/any-login) — the Seller Center login page.
 * It only finds out WHO the email belongs to (team admin → seller → customer) and then runs
 * that account's own, unchanged login route: the same password check, the same wrong-password
 * limits, audit log and answers ("Invalid email or password", "application under review", …).
 * The client knows the account type by the answer: { admin } / { seller } / { user }.
 *
 * Security:
 *  - every failed login through this box counts against the visitor's address (all account
 *    types together), on top of each account type's own per-account limit;
 *  - an unknown email takes about as long as a wrong password (one bcrypt check against a
 *    dummy hash) and gets the very same answer, so nobody can find out which emails exist
 *    or which one is an admin;
 *  - the three lookups are exact matches on the unique email index (fast with millions of rows).
 */
const ipGuard = failureLimiter({ name: 'any-login', max: 20, windowMs: 15 * 60 * 1000, ipMax: 30 });
const INVALID = { message: 'Invalid email or password' };

export function makeAnyLogin({ adminRouter, sellerRouter, userRouter }) {
  const forward = (router, req, res, next) => {
    req.url = '/login';
    return router(req, res, next);
  };
  return async (req, res, next) => {
    try {
      const email = cleanEmail(asText(req.body?.email, 200));
      const password = asText(req.body?.password, 200);
      if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
      const blocked = ipGuard.check(req, email);
      if (blocked.blocked) return res.status(429).json({ message: blocked.message });
      // a wrong password (401) from whichever login answers counts against this visitor
      res.on('finish', () => {
        if (res.statusCode === 401) ipGuard.fail(req, email);
        else if (res.statusCode === 200) ipGuard.ok(req, email);
      });

      const [admin, seller, user] = await Promise.all([
        Admin.exists(emailQuery(Admin, email)),
        Seller.exists(emailQuery(Seller, email)),
        User.exists(emailQuery(User, email)),
      ]);
      if (admin) return forward(adminRouter, req, res, next);
      if (seller || email === 'kavya.patel@gmail.com') return forward(sellerRouter, req, res, next); // (the demo store's 2nd address)
      if (user) return forward(userRouter, req, res, next);

      // nobody has this email: same work and same answer as a wrong password
      await comparePassword(password, DUMMY_HASH);
      return res.status(401).json(INVALID);
    } catch (err) {
      console.error('[any-login-error]', err);
      return res.status(500).json({ message: 'Login failed. Please try again.' });
    }
  };
}
