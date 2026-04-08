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
    images: "/api/images",
  });
});

// Một router mount tại /api — URL cuối cùng: /api/images, /api/images/upload, ...
app.use("/api", imageRoutes);
setupSwagger(app);

/** Multer (file too large / quá nhiều file) mặc định trả HTML 500 — gây 500 ở /api/ai/suggest-listing khi ảnh nặng. */
app.use((err, req, res, next) => {
  if (err?.name !== "MulterError") return next(err);
  let message = err.message || "Lỗi upload file.";
  if (err.code === "LIMIT_FILE_SIZE") {
    message =
      "Ảnh quá lớn (tối đa 15MB mỗi ảnh). Hãy chọn ảnh nhỏ hơn, nén hoặc giảm độ phân giải.";
  } else if (err.code === "LIMIT_FILE_COUNT") {
    message = "Tối đa 4 ảnh mỗi lần gọi Gemini.";
  } else if (err.code === "LIMIT_UNEXPECTED_FIELD") {
    message = "Trường upload không đúng định dạng (chỉ dùng notes + images).";
  }
  console.error("[MulterError]", err.code, req.path);
  return res.status(413).json({ error: message });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error("[unhandled]", err);
  return res.status(500).json({ error: err?.message || "Lỗi máy chủ." });
});

connectDB().catch((error) => {
  console.error("MongoDB connection failed:", error.message);
  console.error("Server vẫn chạy — sửa MONGO_URI trong backend/.env rồi restart.");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
