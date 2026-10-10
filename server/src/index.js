// First: makes a failed async route answer with an error instead of hanging (see the file)
import { guardErrorDetails, finalErrorHandler } from './utils/asyncErrors.js';
import dns from 'dns';
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch (_) {}
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config();

// Secrets come only from the environment (see utils/secrets.js). Nothing secret lives in the code.
import { ensureJwtSecret, mongoUri as readMongoUri } from './utils/secrets.js';
try {
  ensureJwtSecret();
} catch (e) {
  console.error('❌', e.message);
}
import http from 'http';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { verifySocketToken } from './middleware/auth.js';
import { attachPortalRealtime } from './realtime/portalRealtime.js';
import { sanitizeRequest, asText } from './middleware/sanitize.js';
import { limit } from './utils/rateLimit.js';

import productRoutes from './routes/products.js';
import categoryRoutes from './routes/categories.js';
import orderRoutes from './routes/orders.js';
import refundRoutes from './routes/refunds.js';
import discountRoutes from './routes/discounts.js';
import shippingRoutes from './routes/shipping.js';
import inventoryRoutes from './routes/inventory.js';
import financeRoutes from './routes/finance.js';
import analyticsRoutes from './routes/analytics.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import pushRoutes from './routes/push.js';
import auditRoutes from './routes/audit.js';
import adminRoutes from './routes/admins.js';
import contentRoutes from './routes/content.js';
import settingsRoutes from './routes/settings.js';
import uploadRoutes from './routes/uploads.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import chatRoutes, { handleAutoReply } from './routes/chat.js';
import sellerRoutes from './routes/sellers.js';
import treasuryRoutes from './routes/treasury.js';
import backupRoutes from './routes/backup.js';
import { createBackup, getBackupSettings, updateBackupSettings } from './services/backup.service.js';

import { Conversation, Message } from './models/Chat.js';
import Seller from './models/Seller.js';
import { notify } from './utils/notify.js';
import { processOrderPenalties, releaseLocksOfWaitingOrders } from './routes/sellers/orders.routes.js';
import { processAutoProgressOrders } from './services/orderProgressionService.js';
import { finishStuckWalletRequests } from './utils/walletRequests.js';
import { encryptStoredPasswords, encryptionOn } from './utils/sellerPassword.js';

const app = express();
app.disable('x-powered-by');
// Render / Vercel sit behind one proxy: this makes req.ip the visitor's real address (rate limits)
app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS) > 0 ? Number(process.env.TRUST_PROXY_HOPS) : 1);
app.use(compression());

// Which websites may call this API from a browser.
// Set CORS_ORIGINS on the server to a comma-separated list (for example
// "https://yourstore.com,https://admin.yourstore.com") to allow only those. While it is not set,
// every origin is allowed, exactly as before, so nothing stops working on deploy.
const allowedOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, ''))
  .filter(Boolean);
const originAllowed = (origin) => {
  if (!origin || allowedOrigins.length === 0) return true; // no Origin header = not a browser page
  const clean = origin.replace(/\/$/, '');
  if (allowedOrigins.includes(clean)) return true;
  return /^(https?|capacitor|ionic):\/\/localhost(:\d+)?$/.test(clean) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(clean);
};
if (allowedOrigins.length === 0) console.warn('⚠️  CORS_ORIGINS is not set: the API accepts browser requests from any website.');
app.use(cors({ origin: (origin, cb) => cb(null, originAllowed(origin)) }));

// Basic browser safety headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // uploaded files (a PDF preview in chat) are shown inside the admin / seller site, which is
  // on another address than this API, so they are left out of the frame rule
  if (!req.path.startsWith('/uploads/')) res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

app.use(express.json({ limit: '5mb' }));
app.use(sanitizeRequest);
app.use(guardErrorDetails);

// Background order penalties scheduler (runs only in long-running standalone server)
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME) {
  setInterval(() => {
    processOrderPenalties(app);
  }, 5 * 60 * 1000);
  setTimeout(() => {
    processOrderPenalties(app);
  }, 8000);

  // A waiting (pending) order must not hold locked funds: give them back to the available balance
  setInterval(() => {
    if (mongoose.connection.readyState === 1) releaseLocksOfWaitingOrders(app);
  }, 5 * 60 * 1000);
  setTimeout(() => {
    if (mongoose.connection.readyState === 1) releaseLocksOfWaitingOrders(app);
  }, 20000);

  // 5-7 Days Automated Order Lifecycle Progression Scheduler (runs every 5 minutes)
  setInterval(() => {
    processAutoProgressOrders(app);
  }, 5 * 60 * 1000);
  setTimeout(() => {
    processAutoProgressOrders(app);
  }, 12000);

  // Automated Hourly Database Backup Scheduler (runs every 60 minutes)
  const runHourlyBackupJob = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;
      const settings = await getBackupSettings();
      if (!settings.autoBackupEnabled) return;

      console.log('⏰ [Backup Scheduler] Triggering automated hourly database backup...');
      const backup = await createBackup('hourly');
      await updateBackupSettings({ lastHourlyBackupAt: new Date().toISOString() });
      console.log(`✅ [Backup Scheduler] Automated hourly backup complete: ${backup.filename} (${(backup.sizeBytes / 1024).toFixed(1)} KB, ${backup.documentsCount} documents)`);
    } catch (err) {
      console.error('❌ [Backup Scheduler] Failed to create automated hourly backup:', err.message);
    }
  };

  // Deposit / withdrawal decisions interrupted by a restart are completed (every 2 minutes)
  setInterval(() => {
    if (mongoose.connection.readyState === 1) finishStuckWalletRequests({ force: true }).catch(() => {});
  }, 2 * 60 * 1000);

  setInterval(runHourlyBackupJob, 60 * 60 * 1000);
  // Initial check 30 seconds after server startup
  setTimeout(runHourlyBackupJob, 30 * 1000);
}

// Health check. Until the database has connected ONCE after a start, this answers 503. A host
// with a health check (Render: healthCheckPath) then does not switch visitors to a new deploy
// whose database address is missing or wrong; the previous working version keeps serving.
// After the first connection it always answers 200, so a short database hiccup never restarts
// the server.
let dbConnectedOnce = false;
mongoose.connection.on('connected', () => {
  dbConnectedOnce = true;
});
const SERVER_STARTED_AT = new Date().toISOString();
app.get(['/api/health', '/health'], (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  if (connected) dbConnectedOnce = true;
  // `build` / `startedAt` show which version of the code is live (Render sets RENDER_GIT_COMMIT)
  res.status(dbConnectedOnce ? 200 : 503).json({ ok: dbConnectedOnce, name: 'Bazario Multi-Vendor Marketplace API', db: connected ? 'connected' : 'not connected', build: String(process.env.RENDER_GIT_COMMIT || '').slice(0, 7), startedAt: SERVER_STARTED_AT });
});
app.use(['/api/products', '/products'], productRoutes);
app.use(['/api/categories', '/categories'], categoryRoutes);
app.use(['/api/orders', '/orders'], orderRoutes);
app.use(['/api/refunds', '/refunds'], refundRoutes);
app.use(['/api/discounts', '/discounts'], discountRoutes);
app.use(['/api/shipping', '/shipping'], shippingRoutes);
app.use(['/api/inventory', '/inventory'], inventoryRoutes);
app.use(['/api/finance', '/finance'], financeRoutes);
app.use(['/api/analytics', '/analytics'], analyticsRoutes);
app.use(['/api/reports', '/reports'], reportRoutes);
app.use(['/api/notifications', '/notifications'], notificationRoutes);
app.use(['/api/push', '/push'], pushRoutes);
app.use(['/api/audit', '/audit'], auditRoutes);
app.use(['/api/admins', '/admins'], adminRoutes);
app.use(['/api/content', '/content'], contentRoutes);
app.use(['/api/settings', '/settings'], settingsRoutes);
app.use(['/api/uploads', '/uploads'], uploadRoutes);
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/user', '/user'], userRoutes);
app.use(['/api/chat', '/chat'], chatRoutes);
app.use(['/api/sellers', '/sellers'], sellerRoutes);
app.use(['/api/treasury', '/treasury'], treasuryRoutes);
app.use(['/api/backup', '/backup'], backupRoutes);

// Static uploads serving (both server/uploads and root/uploads)
const serverUploadsDir = path.resolve(__dirname, '../uploads');
const rootUploadsDir = path.resolve(__dirname, '../../uploads');
try { if (!fs.existsSync(serverUploadsDir)) fs.mkdirSync(serverUploadsDir, { recursive: true }); } catch {}
try { if (!fs.existsSync(rootUploadsDir)) fs.mkdirSync(rootUploadsDir, { recursive: true }); } catch {}
// Uploaded files are never allowed to run as a web page on this domain: no scripts, and anything
// that is not a plain image / PDF is offered as a download.
const INLINE_UPLOAD = /\.(png|jpe?g|gif|webp|avif|bmp|pdf|mp3|wav|ogg|webm|mp4|m4a)$/i;
const uploadHeaders = {
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!INLINE_UPLOAD.test(filePath)) res.setHeader('Content-Disposition', 'attachment');
  },
};
app.use('/uploads', express.static(serverUploadsDir, uploadHeaders));
app.use('/uploads', express.static(rootUploadsDir, uploadHeaders));

// Production: serve built React frontend from same single port (only in persistent node server)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (!process.env.VERCEL && fs.existsSync(clientDist)) {
  app.use(
    express.static(clientDist, {
      setHeaders: (res, filePath) => {
        if (filePath.includes('assets')) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    })
  );
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else if (!process.env.VERCEL) {
  // Pure API Server Landing Page (when frontend is deployed separately on Netlify)
  app.get('/', (req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Bazario API & Socket Server</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 36px 28px; max-width: 500px; width: 100%; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); text-align: center; }
          .badge { display: inline-flex; align-items: center; gap: 6px; background: #064e3b; color: #34d399; font-size: 13px; font-weight: 700; padding: 6px 14px; border-radius: 20px; margin-bottom: 20px; border: 1px solid #059669; }
          .dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; display: inline-block; }
          h1 { margin: 0 0 10px; font-size: 26px; font-weight: 800; color: #fff; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px; }
          .links { display: flex; flex-direction: column; gap: 10px; }
          .btn { background: #2563eb; color: #fff; text-decoration: none; padding: 12px; border-radius: 8px; font-weight: 600; font-size: 14px; }
          .btn:hover { background: #1d4ed8; }
          .btn-sec { background: #334155; color: #cbd5e1; }
          .btn-sec:hover { background: #475569; color: #fff; }
          .meta { margin-top: 24px; font-size: 12px; color: #64748b; border-top: 1px solid #334155; padding-top: 16px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge"><span class="dot"></span> Backend Engine Live & Healthy</div>
          <h1>🚀 Bazario Marketplace API</h1>
          <p>The backend REST API and Real-Time WebSockets server are active.</p>
          <div class="links">
            <a href="/api/health" class="btn">🔍 Health Check (/api/health)</a>
            <a href="/api/products" class="btn btn-sec">📦 Products API (/api/products)</a>
          </div>
          <div class="meta">
            Connected to Database • Mode: Production
          </div>
        </div>
      </body>
      </html>
    `);
  });
}

// 404 Fallback for unmatched API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/user') || req.path.startsWith('/sellers') || req.path.startsWith('/auth')) {
    return res.status(404).json({
      ok: false,
      message: `API Route not found: ${req.method} ${req.originalUrl || req.url}`,
    });
  }
  next();
});

// Global Express error handler
app.use(finalErrorHandler);

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: (origin, cb) => cb(null, originAllowed(origin)) } });
app.set('io', io);

// Team portal (Vercel) pages connect here for instant chat and live numbers. Separate namespace
// (`/portal`): nothing of the store chat below is shared with it.
try {
  app.set('portalRealtime', attachPortalRealtime(io));
} catch (e) {
  console.error('[portal-rt] could not start:', e.message);
}

io.on('connection', (socket) => {
  // Seller joins their support room (requires valid seller or admin JWT token)
  // A chat id handed out by the storefront (random, 36 characters). Knowing it is what gives
  // access to that one chat, so it must be real text of a sensible length, never an object.
  const goodGuestId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(v);
  // At most 30 chat messages a minute from one connection
  const sentAt = [];
  const tooFast = () => {
    const now = Date.now();
    while (sentAt.length && now - sentAt[0] > 60000) sentAt.shift();
    if (sentAt.length >= 30) return true;
    sentAt.push(now);
    return false;
  };

  // Leave every room this socket joined that matches `test` (its own private room is kept).
  const leaveRooms = (test) => {
    for (const r of [...socket.rooms]) if (r !== socket.id && test(r)) socket.leave(r);
  };

  socket.on('seller:join', async ({ token, sellerId } = {}) => {
    try {
      if (!token) return;
      // checks the signature AND that the account is still active (not just the token)
      const payload = await verifySocketToken(token);
      if (!payload) return;
      let id = null;
      if (payload.t === 'seller') {
        id = payload.id;
      } else if (payload.t === 'admin' && sellerId && mongoose.Types.ObjectId.isValid(String(sellerId))) {
        id = String(sellerId);
      }
      if (id) {
        if (payload.t === 'seller') {
          // A seller session must never stay inside admin rooms (e.g. an admin logged out and a
          // seller logged in on the same browser tab), nor inside another seller's room.
          leaveRooms((r) => r === 'admins' || r.startsWith('admin:') || (r.startsWith('seller:') && r !== `seller:${id}`));
          delete socket.data.adminId;
        }
        socket.join(`seller:${id}`);
        socket.data.sellerId = id;
        socket.data.isSeller = payload.t === 'seller';
        socket.data.isAdmin = payload.t === 'admin';
      }
    } catch (e) {
      console.error('seller:join auth error:', e.message);
    }
  });

  // Guest joins their support room
  socket.on('guest:join', ({ guestId } = {}) => {
    if (goodGuestId(guestId)) {
      socket.join(`guest:${guestId}`);
      socket.data.guestId = guestId;
    }
  });

  // Admin or Staff joins the admin room
  socket.on('admin:join', async ({ token } = {}) => {
    try {
      if (!token) return;
      const payload = await verifySocketToken(token);
      if (payload && payload.t === 'admin') {
        // Switching from a seller session to an admin one: drop the seller's room.
        if (socket.data.isSeller) {
          leaveRooms((r) => r.startsWith('seller:'));
          socket.data.isSeller = false;
          delete socket.data.sellerId;
        }
        // a different admin on the same socket: drop the previous admin's private room
        if (socket.data.adminId && String(socket.data.adminId) !== String(payload.id)) {
          leaveRooms((r) => r === `admin:${socket.data.adminId}`);
        }
        socket.data.isAdmin = true;
        socket.data.adminId = payload.id;
        socket.join('admins');
        socket.join(`admin:${payload.id}`);
      }
    } catch {
      /* invalid token */
    }
  });

  // Customer / Guest joins their support room
  socket.on('customer:join', ({ guestId } = {}) => {
    if (goodGuestId(guestId)) {
      socket.join(`guest:${guestId}`);
      socket.join(`customer:${guestId}`);
      socket.data.guestId = guestId;
    }
  });

  // Real-time message exchange between Seller and Admin
  socket.on('seller:message', async (payload, cb) => {
    try {
      const { sellerId, attachment: rawAttachment } = payload || {};
      const clean = asText(payload?.text, 4000).trim().slice(0, 2000);
      const attachment = asText(rawAttachment, 2000) || null;
      if (!sellerId || !mongoose.Types.ObjectId.isValid(String(sellerId)) || (!clean && !attachment)) return;
      if (tooFast()) return cb?.({ error: 'You are sending messages too fast. Please wait a moment.' });

      // Socket authentication check: must be verified seller matching sellerId or admin
      if (!socket.data?.isAdmin && (!socket.data?.isSeller || String(socket.data?.sellerId) !== String(sellerId))) {
        return cb?.({ error: 'Unauthorized: invalid session' });
      }

      const seller = await Seller.findById(sellerId).select('-kycDocuments');
      if (!seller) return;

      let conv = await Conversation.findOne({ seller: sellerId });
      if (!conv) {
        conv = new Conversation({
          seller: seller._id,
          storeName: seller.storeName,
          sellerName: seller.ownerName,
          sellerEmail: seller.email,
          sellerPhone: seller.phone || '',
          subject: 'General Seller Support & Operations',
        });
      }

      conv.lastMessage = clean || 'Sent an attachment';
      conv.lastSender = 'seller';
      conv.lastAt = new Date();
      conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
      conv.status = 'open';
      await conv.save();

      const msg = new Message({
        conversation: conv._id,
        seller: seller._id,
        sender: 'seller',
        senderName: seller.storeName,
        text: clean,
        attachment: attachment || null,
      });
      await msg.save();

      const out = {
        _id: msg._id,
        conversation: conv._id,
        seller: seller._id,
        sender: 'seller',
        senderName: seller.storeName,
        text: msg.text,
        attachment: msg.attachment,
        createdAt: msg.createdAt,
      };

      io.to(`seller:${sellerId}`).emit('message:new', out);
      io.to('admins').emit('message:new', out);

      notify(app, {
        type: 'chat',
        title: `Message from ${seller.storeName}`,
        body: clean.slice(0, 60),
        link: '/admin/chat',
      });

      // Trigger Auto-Reply if Admin is offline / Auto-Reply is enabled
      handleAutoReply(app, conv);

      cb?.(out);
    } catch (e) {
      console.error('seller:message error:', e.message);
    }
  });

  // Customer / Storefront Live Chat Message
  socket.on('message:send', async (payload, cb) => {
    try {
      const guestId = payload?.guestId;
      // Whoever writes on this channel is a customer. The browser cannot choose to be "admin".
      const sender = 'customer';
      const clean = asText(payload?.text, 4000).trim().slice(0, 2000);
      const attachment = asText(payload?.attachment, 2000) || null;
      const name = asText(payload?.name, 80).trim();
      const email = asText(payload?.email, 120).trim();
      const phone = asText(payload?.phone, 40).trim();
      if (!goodGuestId(guestId) || (!clean && !attachment)) return;
      if (tooFast()) return cb?.({ error: 'You are sending messages too fast. Please wait a moment.' });

      let conv = await Conversation.findOne({ guestId });
      if (!conv) {
        conv = new Conversation({
          type: 'guest',
          isGuest: true,
          guestId,
          name: name || 'Customer',
          email: email || '',
          phone: phone || '',
          subject: 'Customer / Store Inquiry',
          status: 'open',
        });
      }

      if (name) conv.name = name;
      if (email) conv.email = email;
      if (phone) conv.phone = phone;

      conv.lastMessage = clean || 'Sent an attachment';
      conv.lastSender = sender;
      conv.lastAt = new Date();
      conv.unreadForAdmin = (conv.unreadForAdmin || 0) + 1;
      conv.status = 'open';
      await conv.save();

      const msg = new Message({
        conversation: conv._id,
        guestId,
        sender,
        senderName: name || conv.name || 'Customer',
        text: clean,
        attachment: attachment || null,
      });
      await msg.save();

      const out = {
        _id: msg._id,
        conversation: conv._id,
        guestId,
        sender: msg.sender,
        senderName: msg.senderName,
        text: msg.text,
        attachment: msg.attachment,
        createdAt: msg.createdAt,
      };

      io.to(`guest:${guestId}`).emit('message:new', out);
      io.to(`customer:${guestId}`).emit('message:new', out);
      io.to('admins').emit('message:new', out);
      io.to('admins').emit('chat:notification', {
        conversationId: conv._id,
        storeName: `Customer: ${conv.name || 'Guest'}`,
        text: clean,
      });

      notify(app, {
        type: 'chat',
        title: `Message from ${conv.name || 'Customer'}`,
        body: clean.slice(0, 60),
        link: '/admin/chat',
      });

      // Trigger Auto-Reply if Admin is offline / Auto-Reply is enabled
      handleAutoReply(app, conv);

      cb?.(out);
    } catch (e) {
      console.error('message:send socket error:', e.message);
    }
  });

  // Real-time Seen / Read status update from seller
  socket.on('seller:read', async ({ sellerId } = {}) => {
    try {
      const now = new Date();
      // Only the seller's own connection (or an admin looking at that seller) may mark it read
      const targetSellerId = socket.data?.isAdmin && sellerId ? sellerId : socket.data?.sellerId;
      if (!targetSellerId || !mongoose.Types.ObjectId.isValid(String(targetSellerId))) return;

      const conv = await Conversation.findOne({ seller: targetSellerId, type: { $ne: 'internal' } });
      if (conv) {
        conv.unreadForSeller = 0;
        await conv.save();

        await Message.updateMany(
          {
            $or: [{ conversation: conv._id }, { seller: targetSellerId }],
            sender: { $in: ['admin', 'staff'] },
            isSeen: { $ne: true },
          },
          { $set: { isSeen: true, seenAt: now, seenBy: 'seller' } }
        );

        io.to('admins').emit('messages:seen', {
          conversationId: conv._id,
          sellerId: targetSellerId,
          seenAt: now,
          seenBy: 'seller',
        });
      }
    } catch (e) {
      console.error('seller:read socket error:', e.message);
    }
  });

  // Real-time Seen / Read status update from guest
  socket.on('guest:read', async ({ guestId } = {}) => {
    try {
      const now = new Date();
      const targetGuestId = goodGuestId(guestId) ? guestId : socket.data?.guestId;
      if (!goodGuestId(targetGuestId)) return;

      const conv = await Conversation.findOne({ guestId: targetGuestId });
      if (conv) {
        conv.unreadForCustomer = 0;
        await conv.save();

        await Message.updateMany(
          {
            $or: [{ conversation: conv._id }, { guestId: conv.guestId || targetGuestId }],
            sender: { $in: ['admin', 'staff'] },
            isSeen: { $ne: true },
          },
          { $set: { isSeen: true, seenAt: now, seenBy: 'guest' } }
        );

        io.to('admins').emit('messages:seen', {
          conversationId: conv._id,
          guestId: conv.guestId || targetGuestId,
          seenAt: now,
          seenBy: 'guest',
        });
      }
    } catch (e) {
      console.error('guest:read socket error:', e.message);
    }
  });
});

process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err?.stack || err?.message || err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err?.stack || err?.message || err));
process.on('exit', (code) => console.log(`[Server Process] Exited with code: ${code}`));
process.on('SIGTERM', () => { console.log('[Server Process] Received SIGTERM'); process.exit(0); });
process.on('SIGINT', () => { console.log('[Server Process] Received SIGINT'); process.exit(0); });

const PORT = process.env.PORT || 5000;

// Start HTTP & Socket server only in persistent/standalone environments (skip in Vercel serverless)
if (!process.env.VERCEL) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Bazario Multi-Vendor Marketplace Live at http://localhost:${PORT}`);
    console.log(`🛒 Storefront:      http://localhost:${PORT}`);
    console.log(`🏬 Seller Central:  http://localhost:${PORT}/seller`);
    console.log(`👑 Super Admin:     http://localhost:${PORT}/admin`);
    console.log(`=======================================================`);
  });
}

// Serverless-friendly cached MongoDB connection.
// The address comes ONLY from the environment (MONGO_URI). There is no built-in address or
// password in the code any more, so if MONGO_URI is missing or wrong the server says so clearly
// instead of quietly using a hard-coded one.
let connPromise = null;
export async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }
  if (connPromise) {
    return await connPromise;
  }

  connPromise = (async () => {
    const mongoUri = readMongoUri();
    if (!mongoUri) {
      throw new Error('MONGO_URI is not set. Add the database address in the server environment (Render → Environment) and redeploy.');
    }

    try {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 15000,
        connectTimeoutMS: 15000,
        maxPoolSize: 10,
      });
      console.log('✅ MongoDB connected successfully to database');
      return mongoose.connection;
    } catch (err) {
      console.error('❌ MongoDB connection error:', err.message);
      console.error('   Check MONGO_URI (user, password, cluster) in the server environment.');
      throw err;
    } finally {
      connPromise = null;
    }
  })();

  return await connPromise;
}

// Keep trying in the background: a short database or network hiccup at start must not leave the
// server running without a database until someone restarts it.
// Small one-time jobs after the database is reachable
let startupJobsDone = false;
async function runStartupJobs() {
  if (startupJobsDone) return;
  startupJobsDone = true;
  try {
    await finishStuckWalletRequests({ force: true });
    if (encryptionOn()) {
      const { changed } = await encryptStoredPasswords(mongoose.connection.db);
      if (changed > 0) console.log(`🔐 ${changed} saved seller password${changed === 1 ? '' : 's'} moved from plain text to the encrypted copy.`);
    } else {
      console.warn('⚠️  SELLER_PASSWORD_KEY is not set: the look-up copy of seller passwords is still stored as plain text in the database (it is no longer sent to any browser). Set the key to encrypt it.');
    }
  } catch (e) {
    console.error('Startup jobs failed:', e.message);
  }
}

(function connectWithRetry(attempt = 1) {
  connectDB().then(runStartupJobs).catch((err) => {
    const wait = Math.min(60000, 5000 * attempt);
    console.error(`❌ Database not connected (${err.message}). Trying again in ${Math.round(wait / 1000)}s.`);
    setTimeout(() => connectWithRetry(attempt + 1), wait).unref?.();
  });
})();


export { app, server };
export default app;
