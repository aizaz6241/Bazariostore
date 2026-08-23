import jwt from 'jsonwebtoken';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Admin auth; supports both authAdmin('perm') and authAdmin directly as middleware
export function authAdmin(permission = null) {
  if (permission && typeof permission === 'object' && permission.headers) {
    // Used directly as middleware: authAdmin(req, res, next)
    const req = permission;
    const res = arguments[1];
    const next = arguments[2];
    return verifyAdminToken(null, req, res, next);
  }
  return (req, res, next) => verifyAdminToken(permission, req, res, next);
}

function verifyAdminToken(permission, req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ message: 'Not authorized' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.t !== 'admin') return res.status(401).json({ message: 'Not authorized' });
    req.admin = payload;
    if (permission && payload.role !== 'super_admin' && !(payload.permissions || []).includes(permission)) {
      return res.status(403).json({ message: 'You do not have permission for this action' });
    }
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

// Seller auth (required for vendor portal, allows admin override)
export function authSeller(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ message: 'Seller authorization required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.t === 'seller') {
      req.seller = payload;
      return next();
    }
    if (payload.t === 'admin') {
      req.admin = payload;
      req.seller = payload;
      return next();
    }
    return res.status(401).json({ message: 'Seller access required' });
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

// Seller OR Admin auth (allows Admin to inspect/perform actions on behalf of sellers)
export function authSellerOrAdmin(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ message: 'Authorization required' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.t === 'seller') {
      req.seller = payload;
      return next();
    }
    if (payload.t === 'admin') {
      req.admin = payload;
      req.seller = payload;
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized' });
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

// Customer auth (required)
export function authUser(req, res, next) {
  const token = bearer(req);
  if (!token) return res.status(401).json({ message: 'Please login first' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.t !== 'user') return res.status(401).json({ message: 'Please login first' });
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: 'Session expired, please login again' });
  }
}

// Customer auth (optional — attaches req.user if a valid token is present)
export function softUser(req, res, next) {
  const token = bearer(req);
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.t === 'user') req.user = payload;
    } catch {
      /* ignore */
    }
  }
  next();
}

// legacy default export (admin, no specific permission)
export default authAdmin();
