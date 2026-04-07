import mongoose from "mongoose";

export const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set (copy backend/.env.example to backend/.env)");
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");
};
