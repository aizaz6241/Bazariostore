import app, { connectDB } from '../server/src/index.js';

export default async function handler(req, res) {
  try {
    await connectDB();
  } catch (err) {
    console.error('Vercel serverless DB connect error:', err.message);
    if (!res.headersSent) {
      return res.status(503).json({
        ok: false,
        message: `Database Connection Failed: ${err.message}. Please check MongoDB Atlas connection.`,
      });
    }
  }

  // Handle URL normalization if /api prefix was stripped by Vercel rewrite
  if (req.url && !req.url.startsWith('/api') && !req.url.startsWith('/uploads')) {
    req.url = `/api${req.url}`;
  }

  return app(req, res);
}
