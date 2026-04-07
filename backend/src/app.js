import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { connectDB } from "./config/db.js";
import { setupSwagger } from "./config/swagger.js";
import imageRoutes from "./routes/imageRoutes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

app.get("/", (_req, res) => {
  res.json({
    message: "Welcome to AI Image Retrieval API",
    docs: "/api-docs",
  });
});

app.use("/api/images", imageRoutes);
setupSwagger(app);

connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
});
