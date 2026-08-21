import 'dotenv/config';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';

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
import auditRoutes from './routes/audit.js';
import adminRoutes from './routes/admins.js';
import contentRoutes from './routes/content.js';
import settingsRoutes from './routes/settings.js';
import uploadRoutes from './routes/uploads.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/user.js';
import chatRoutes from './routes/chat.js';
import sellerRoutes from './routes/sellers.js';

import { Conversation, Message } from './models/Chat.js';
import Seller from './models/Seller.js';
import { notify } from './utils/notify.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Bazario Multi-Vendor Marketplace API' }));
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/refunds', refundRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/admins', adminRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/sellers', sellerRoutes);

// Static uploads serving (both server/uploads and root/uploads)
const serverUploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../uploads');
const rootUploadsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
try { if (!fs.existsSync(serverUploadsDir)) fs.mkdirSync(serverUploadsDir, { recursive: true }); } catch {}
try { if (!fs.existsSync(rootUploadsDir)) fs.mkdirSync(rootUploadsDir, { recursive: true }); } catch {}
app.use('/uploads', express.static(serverUploadsDir));
app.use('/uploads', express.static(rootUploadsDir));

// Production: serve built React frontend from same single port
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
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
} else {
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
          <p>The backend REST API and Real-Time WebSockets server are active on Render. Connect your Netlify frontend via <code>VITE_API_URL</code>.</p>
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

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

io.on('connection', (socket) => {
  // Seller joins their support room
  socket.on('seller:join', ({ token, sellerId }) => {
    try {
      let id = sellerId;
      if (token) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        if (payload.t === 'seller') id = payload.id;
      }
      if (id) {
        socket.join(`seller:${id}`);
        socket.data.sellerId = id;
        socket.data.isSeller = true;
      }
    } catch (e) {
      console.error('seller:join error:', e.message);
    }
  });

  // Admin or Staff joins the admin room
  socket.on('admin:join', ({ token }) => {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.t === 'admin') {
        socket.data.isAdmin = true;
        socket.data.adminId = payload.id;
        socket.join('admins');
      }
    } catch {
      /* invalid token */
    }
  });

  // Real-time message exchange between Seller and Admin
  socket.on('seller:message', async (payload, cb) => {
    try {
      const { sellerId, text, attachment } = payload || {};
      const clean = (text || '').trim().slice(0, 2000);
      if (!sellerId || (!clean && !attachment)) return;

      const seller = await Seller.findById(sellerId);
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

      cb?.(out);
    } catch (e) {
      console.error('seller:message error:', e.message);
    }
  });
});

process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err?.message || err));

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

const DEFAULT_ATLAS_URI = 'mongodb+srv://aizaz6241_db_user:u2IODhWhiXehEOy8@cluster0.ijpphlb.mongodb.net/bazario?retryWrites=true&w=majority&appName=Cluster0';

// Serverless-friendly cached MongoDB connection
let cachedConn = null;
export async function connectDB() {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }
  if (cachedConn) {
    return cachedConn;
  }

  let mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri || mongoUri.includes('<db_username>')) {
    mongoUri = DEFAULT_ATLAS_URI;
  }

  try {
    cachedConn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      bufferCommands: false,
    });
    console.log('✅ MongoDB connected successfully to database');
    return cachedConn;
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
}

connectDB().catch(() => {});

export { app, server };
export default app;
