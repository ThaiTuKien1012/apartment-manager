import fs from "node:fs";
import path from "node:path";
import multer from "multer";

const uploadDir = path.resolve("uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, "-");
    cb(null, `${Date.now()}-${safeName}`);
  },
});

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff", ".zip", ".docx", ".pptx", ".xlsx"]);

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(String(file.originalname || "").toLowerCase());
  if (ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(ext)) {
    cb(null, true);
    return;
  }
  cb(new Error("Chỉ hỗ trợ ảnh hoặc file zip/docx/pptx/xlsx."));
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});
