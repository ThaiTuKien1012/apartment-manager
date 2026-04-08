import multer from "multer";

/** Ảnh gửi kèm Gemini — lưu tạm trong RAM, không ghi đĩa. */
const storage = multer.memoryStorage();

/** Ảnh từ điện thoại thường >8MB — Multer mặc định cũ làm lỗi 500 HTML, khó debug. */
export const aiImagesUpload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 4 },
});
