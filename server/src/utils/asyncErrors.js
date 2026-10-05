// Must be imported BEFORE any router is created (first import of index.js).
//
// Express 4 does not notice when an `async` route handler fails: the request simply never
// answers and the browser waits until it times out. Many handlers here have no try / catch
// (profile, orders, staff, settings...), so a wrong id or a missing record did exactly that.
//
// This teaches Express to pass a failed async handler to the error handler, for every route at
// once, old and new. (Same technique as the small "express-async-errors" package.)
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const Layer = require('express/lib/router/layer');

const wrap = (fn) => {
  if (typeof fn !== 'function' || fn.__asyncWrapped) return fn;
  const wrapped = function wrapped(...args) {
    const out = fn.apply(this, args);
    if (out && typeof out.catch === 'function') {
      // error-handling middleware is (err, req, res, next); everything else ends with next
      const next = args.length === 4 ? args[3] : args[args.length - 1];
      out.catch((err) => (typeof next === 'function' ? next(err) : undefined));
    }
    return out;
  };
  Object.defineProperty(wrapped, 'length', { value: fn.length, writable: false });
  Object.keys(fn).forEach((k) => {
    wrapped[k] = fn[k];
  });
  wrapped.__asyncWrapped = true;
  return wrapped;
};

Object.defineProperty(Layer.prototype, 'handle', {
  enumerable: true,
  configurable: true,
  get() {
    return this.__handle;
  },
  set(fn) {
    this.__handle = wrap(fn);
  },
});

/**
 * What the outside world is told when something breaks.
 * A logged-in admin sees the real reason (useful for fixing it). Everyone else gets a plain
 * sentence: database and code details (field names, query text, file paths) stay in the server log.
 */
export function guardErrorDetails(req, res, next) {
  const send = res.json.bind(res);
  res.json = (body) => {
    try {
      if (res.statusCode >= 500 && body && typeof body === 'object' && typeof body.message === 'string' && !req.admin) {
        console.error(`[error-detail] ${req.method} ${req.originalUrl || req.url} -> ${body.message}`);
        return send({ ...body, message: 'Something went wrong on our side. Please try again in a moment.' });
      }
    } catch {
      /* fall through to the original body */
    }
    return send(body);
  };
  next();
}

/** Final error handler: a wrong id becomes "not found", bad JSON a 400, the rest a logged 500. */
export function finalErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (err?.name === 'CastError' || err?.kind === 'ObjectId' || /Cast to ObjectId failed/i.test(err?.message || '')) {
    return res.status(404).json({ ok: false, message: 'Not found' });
  }
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({ ok: false, message: 'The request could not be read' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ ok: false, message: 'The request is too large' });
  }
  if (err?.code === 'LIMIT_FILE_SIZE' || err?.name === 'MulterError') {
    return res.status(400).json({ ok: false, message: err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large' : 'The upload could not be read' });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ ok: false, message: 'Some of the values sent are not valid' });
  }
  const status = Number(err?.status || err?.statusCode) || 500;
  if (status >= 500) console.error('[server-error]', req.method, req.originalUrl || req.url, err);
  res.status(status).json({ ok: false, message: err?.message || 'Internal Server Error' });
}
