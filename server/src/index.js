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

import { Conversation, Message } from './models/Chat.js';
import { nextSeq } from './models/System.js';
import { notify } from './utils/notify.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Official Nayab Glow API' }));
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

// Production: serve the built React app from this same server (single URL hosting)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.set('io', io);

io.on('connection', (socket) => {
  // Customer joins their room. Logged-in customers pass user info so chat shows
  // their real name; guests get a sequential Guest #10xx number.
  socket.on('customer:join', async ({ guestId, user }) => {
    if (!guestId) return;
    socket.join(`conv:${guestId}`);
    socket.data.guestId = guestId;
    try {
      let conv = await Conversation.findOne({ guestId });
      if (!conv) {
        // two sockets (React StrictMode) can race to create the same conversation
        conv = await Conversation.create({ guestId, guestNumber: await nextSeq('guest') }).catch(async (e) => {
          if (e.code === 11000) return Conversation.findOne({ guestId });
          throw e;
        });
      } else if (!conv.guestNumber) {
        conv.guestNumber = await nextSeq('guest');
        await conv.save();
      }
      if (user?.name) {
        conv.name = user.name;
        if (user.email) conv.email = user.email;
        if (user.phone) conv.phone = user.phone;
        await conv.save();
      }
    } catch (e) {
      console.error('customer:join error:', e.message);
    }
  });

  socket.on('admin:join', ({ token }) => {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload.t !== 'admin') return;
      socket.data.isAdmin = true;
      socket.join('admins');
    } catch {
      /* invalid token */
    }
  });

  socket.on('message:send', async (payload, cb) => {
    try {
      const { guestId, text, sender } = payload || {};
      const clean = (text || '').trim().slice(0, 2000);
      if (!guestId || !clean) return;
      const from = sender === 'admin' && socket.data.isAdmin ? 'admin' : 'customer';
      let conv = await Conversation.findOne({ guestId });
      if (!conv) conv = await Conversation.create({ guestId, guestNumber: await nextSeq('guest') });
      conv.lastMessage = clean;
      conv.lastAt = new Date();
      if (from === 'customer') conv.unreadForAdmin += 1;
      else conv.unreadForCustomer += 1;
      await conv.save();
      const msg = await Message.create({ conversation: conv._id, guestId, sender: from, text: clean });
      const out = { _id: msg._id, guestId, sender: from, text: msg.text, createdAt: msg.createdAt };
      io.to(`conv:${guestId}`).emit('message:new', out);
      io.to('admins').emit('message:new', out);
      if (from === 'customer' && conv.unreadForAdmin === 1) {
        const who = conv.name?.trim() || `Guest #${conv.guestNumber || ''}`;
        notify(app, { type: 'chat', title: 'New chat message', body: `${who}: ${clean.slice(0, 60)}`, link: '/admin/chat' });
      }
      cb?.(out);
    } catch (e) {
      console.error('chat error:', e.message);
    }
  });
});

// Crash-proofing: Express 4 async route errors surface as unhandled rejections,
// which crash Node (>=15) and cause downtime windows on the host. Log instead.
process.on('unhandledRejection', (err) => console.error('unhandledRejection:', err?.message || err));
process.on('uncaughtException', (err) => console.error('uncaughtException:', err?.message || err));

const PORT = process.env.PORT || 5000;
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');
    server.listen(PORT, () => console.log(`Nayab Glow API running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
