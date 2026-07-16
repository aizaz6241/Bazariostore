import jwt from 'jsonwebtoken';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// Admin auth; optionally requires a specific permission
export function authAdmin(permission = null) {
  return (req, res, next) => {
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
  };
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
