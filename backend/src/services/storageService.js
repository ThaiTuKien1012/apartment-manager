import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const SUPABASE_STORAGE_BUCKET = String(process.env.SUPABASE_STORAGE_BUCKET || "").trim();

let supabase = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const isSupabaseStorageEnabled = () => Boolean(supabase && SUPABASE_STORAGE_BUCKET);

const ensureSupabaseReady = () => {
  if (!isSupabaseStorageEnabled()) {
    throw new Error("Supabase Storage chưa cấu hình: cần SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET");
  }
};

const toContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".tif" || ext === ".tiff") return "image/tiff";
  return "image/jpeg";
};

export const uploadBufferToSupabase = async ({ buffer, fileName, apartmentCode = "no-code", folder = "" }) => {
  ensureSupabaseReady();
  const safeName = String(fileName || "image.jpg").replace(/[^a-zA-Z0-9._-]+/g, "-");
  const safeApartment = String(apartmentCode || "no-code").replace(/[^a-zA-Z0-9_-]+/g, "-");
  const safeFolder = String(folder || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const prefix = safeFolder ? `${safeApartment}/${safeFolder}` : safeApartment;
  const key = `${prefix}/${Date.now()}-${safeName}`;
  const contentType = toContentType(safeName);

  const { error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(key, buffer, {
    upsert: false,
    contentType,
    cacheControl: "3600",
  });
  if (error) throw new Error(`Supabase upload error: ${error.message}`);

  const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(key);
  if (!data?.publicUrl) throw new Error("Không lấy được public URL từ Supabase Storage.");
  return { publicUrl: data.publicUrl, objectKey: key };
};

export const deleteSupabaseByPublicUrl = async (publicUrl) => {
  if (!isSupabaseStorageEnabled()) return;
  const marker = `/storage/v1/object/public/${SUPABASE_STORAGE_BUCKET}/`;
  const url = String(publicUrl || "");
  const idx = url.indexOf(marker);
  if (idx < 0) return;
  const objectKey = url.slice(idx + marker.length);
  if (!objectKey) return;
  await supabase.storage.from(SUPABASE_STORAGE_BUCKET).remove([objectKey]);
};
