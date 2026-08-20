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

// Static uploads serving (local fallback)
const uploadsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

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

// Start HTTP & Socket server immediately
server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Amazon Multi-Vendor Marketplace Live at http://localhost:${PORT}`);
  console.log(`🛒 Storefront:      http://localhost:${PORT}`);
  console.log(`🏬 Seller Central:  http://localhost:${PORT}/seller`);
  console.log(`👑 Super Admin:     http://localhost:${PORT}/admin`);
  console.log(`=======================================================`);
});

// Asynchronous MongoDB connection
async function connectDB() {
  let mongoUri = process.env.MONGO_URI;
  if (!mongoUri || mongoUri.includes('<db_username>')) {
    mongoUri = 'mongodb://127.0.0.1:27017/amazon_ecommerce';
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 4000 });
    console.log('✅ MongoDB connected successfully to database');
  } catch (err) {
    console.log('MongoDB info:', err.message);
  }
}

connectDB();
