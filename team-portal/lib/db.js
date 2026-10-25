import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!MONGO_URI) {
  console.warn('⚠️ Warning: MONGODB_URI / MONGO_URI is not set in environment variables.');
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development and serverless invocations in production.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Vercel runs the portal as many small copies (one per busy moment). Every copy keeps its OWN
    // connections, and the free Atlas M0 cluster allows only 500 in total. So each copy stays small:
    // - maxPoolSize 5: one copy handles one request at a time; 5 is plenty for its parallel queries.
    // - minPoolSize 0 + maxIdleTimeMS 15s: unused connections are closed quickly instead of being
    //   held open by copies that are sitting idle (e.g. the old copies right after a deploy).
    // - serverSelectionTimeoutMS 10s: if the cluster is full, fail fast instead of hanging.
    const opts = {
      bufferCommands: false,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 15000,
      serverSelectionTimeoutMS: 10000,
    };

    cached.promise = mongoose.connect(MONGO_URI, opts).then((m) => {
      console.log('✅ [Team Portal] MongoDB Connected successfully');
      return m;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
