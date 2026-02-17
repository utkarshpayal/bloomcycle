import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();
export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  mongoose.set("strictQuery", true);

  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB || "bloomcycle"
  });

  // eslint-disable-next-line no-console
  console.log("MongoDB connected");
}
