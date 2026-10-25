import mongoose from "mongoose";

type MongooseCache = {
  connection: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithMongoose = globalThis as typeof globalThis & {
  mongooseCache?: MongooseCache;
};

const cache =
  globalWithMongoose.mongooseCache ??
  (globalWithMongoose.mongooseCache = { connection: null, promise: null });

export default async function dbConnect(): Promise<typeof mongoose> {
  if (cache.connection) {
    return cache.connection;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }
  if (!/^mongodb(?:\+srv)?:\/\//i.test(uri.trim())) {
    throw new Error("MONGODB_URI must be a valid mongodb:// or mongodb+srv:// connection string.");
  }

  if (!cache.promise) {
    cache.promise = mongoose.connect(uri.trim(), {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10_000,
    });
  }

  try {
    cache.connection = await cache.promise;
    return cache.connection;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
}
