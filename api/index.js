import app, { connectDB } from '../server/src/index.js';

export default async function handler(req, res) {
  try {
    await connectDB();
  } catch (err) {
    console.error('Vercel DB connection error:', err.message);
    if (!res.headersSent) {
      return res.status(503).json({
        ok: false,
        message: `Database Connection Failed: ${err.message}. Please check MongoDB Atlas username/password in Vercel Environment Variables.`,
      });
    }
  }
  return app(req, res);
}
