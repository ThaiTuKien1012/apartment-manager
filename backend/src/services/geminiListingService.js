import { GoogleGenerativeAI } from "@google/generative-ai";

const APARTMENT_TYPES = ["1BR (1 Bedroom)", "2BR (2 Bedroom)", "3BR (3 Bedroom)", "4BR (4 Bedroom)"];
const CONDITIONS = ["trống", "bếp rèm", "full"];

function extractJsonObject(text) {
  const t = String(text || "").trim();
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1].trim() : t;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model không trả về JSON hợp lệ.");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function normalizeType(value) {
  const s = String(value ?? "").trim();
  if (APARTMENT_TYPES.includes(s)) return s;
  const lower = s.toLowerCase();
  if (/4\s*br|4\s*pn|4\s*phòng/i.test(lower)) return APARTMENT_TYPES[3];
  if (/3\s*br|3\s*pn/i.test(lower)) return APARTMENT_TYPES[2];
  if (/1\s*br|1\s*pn/i.test(lower)) return APARTMENT_TYPES[0];
  if (/2\s*br|2\s*pn/i.test(lower)) return APARTMENT_TYPES[1];
  for (const t of APARTMENT_TYPES) {
    if (lower.includes(t.toLowerCase().slice(0, 4))) return t;
  }
  return "2BR (2 Bedroom)";
}

function normalizeCondition(value) {
  const s = String(value ?? "").trim().toLowerCase();
  if (CONDITIONS.includes(s)) return s;
  if (/full|đầy đủ|nội thất đầy đủ/i.test(s)) return "full";
  if (/bếp rèm|rèm bếp|rèm/i.test(s)) return "bếp rèm";
  return "trống";
}

export function normalizeListingSuggestion(raw) {
  let code = String(raw.apartmentCode ?? "").trim();
  if (!code) code = "ko có mã";

  let sale = String(raw.saleName ?? "").trim();
  if (!sale) sale = "chưa có";

  const price = String(raw.price ?? "").trim() || "chưa có";

  const apartmentType = normalizeType(raw.apartmentType);
  const apartmentCondition = normalizeCondition(raw.apartmentCondition);

  let description = String(raw.description ?? "").trim();
  if (!description) {
    description = [code !== "ko có mã" ? `Mã: ${code}` : "ko có mã", price, apartmentType].filter(Boolean).join(" · ");
  }

  return {
    apartmentCode: code,
    saleName: sale,
    price,
    apartmentType,
    apartmentCondition,
    description,
  };
}

/**
 * @param {{ notes: string, files: Array<{ buffer: Buffer, mimetype: string }> }} param0
 */
export async function suggestListingFromGemini({ notes, files }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Thiếu GEMINI_API_KEY trong backend/.env");
  }

  const genAI = new GoogleGenerativeAI(key);

  const instruction = `Bạn hỗ trợ điền form căn hộ cho thuê (tiếng Việt). Đọc GHI CHÚ và (nếu có) ẢNH.

Chỉ trả về MỘT object JSON hợp lệ, không markdown, không giải thích. Các key bắt buộc:
{
  "apartmentCode": string,
  "saleName": string,
  "price": string,
  "apartmentType": string,
  "apartmentCondition": string,
  "description": string
}

Quy tắc:
- apartmentCode: lấy từ ghi chú (vd "Mã căn:", "P4-03.07"). Nếu không có → dùng đúng chuỗi "ko có mã".
- saleName: tên sales nếu có; không có → "chưa có".
- price: giữ nguyên cách viết người dùng (vd "60 triệu Net"). Không có → "chưa có".
- apartmentType: CHỈ một trong bốn giá trị: "1BR (1 Bedroom)", "2BR (2 Bedroom)", "3BR (3 Bedroom)", "4BR (4 Bedroom)". Suy luận từ số PN/diện tích/mô tả; không chắc thì chọn "2BR (2 Bedroom)".
- apartmentCondition: CHỈ một trong: "trống", "bếp rèm", "full". "trống" = không nội thất / đang trống; "bếp rèm" = có rèm bếp/ bán nội thất kiểu đó; "full" = đầy đủ nội thất. Gợi ý từ ghi chú hoặc ảnh.
- description: đoạn mô tả đầy đủ tiếng Việt gộp dự án, diện tích, hướng, view, bàn giao, tình trạng, v.v. từ ghi chú (và ảnh nếu thấy được).

GHI CHÚ:
`;

  const parts = [{ text: `${instruction}${notes || "(không có ghi chú)"}` }];

  for (const file of files.slice(0, 4)) {
    const mime = String(file.mimetype || "image/jpeg").toLowerCase();
    if (!mime.startsWith("image/")) continue;
    if (/^image\/(heic|heif)\b/.test(mime)) {
      throw new Error(
        "Ảnh HEIC/HEIF không được Gemini hỗ trợ. Trên iPhone: Cài đặt → Camera → Định dạng → «Tương thích» để chụp JPEG, hoặc chuyển ảnh sang JPG/PNG rồi chọn lại.",
      );
    }
    parts.push({
      inlineData: {
        mimeType: mime || "image/jpeg",
        data: file.buffer.toString("base64"),
      },
    });
  }

  let lastErr = null;
  const models = modelCandidates();
  for (const modelName of models) {
    try {
      return await generateOnce(genAI, modelName, parts);
    } catch (err) {
      lastErr = err;
      if (shouldTryNextModel(err)) continue;
      throw err;
    }
  }
  const hint =
    "Hết quota free tier trên các model đã thử (" +
    models.join(", ") +
    "). Thử GEMINI_MODEL=gemini-2.5-flash-lite hoặc gemini-flash-latest trong .env, đợi reset quota, hoặc xem https://ai.google.dev/gemini-api/docs/rate-limits";
  throw new Error(lastErr ? `${lastErr.message}\n${hint}` : hint);
}

function isQuotaOrRateLimitError(err) {
  const m = String(err?.message || err || "");
  return (
    m.includes("429") ||
    m.includes("Too Many Requests") ||
    m.toLowerCase().includes("quota exceeded") ||
    m.toLowerCase().includes("resource exhausted")
  );
}

/** Model sai tên / không có trên API → thử model kế tiếp (trước đây 404 làm dừng hẳn vòng lặp → 500). */
function shouldTryNextModel(err) {
  if (isQuotaOrRateLimitError(err)) return true;
  const status = err?.status ?? err?.statusCode;
  if (status === 404) return true;
  if (status === 502 || status === 503) return true;
  const m = String(err?.message || err || "");
  const lower = m.toLowerCase();
  if (m.includes("404") && lower.includes("not found")) return true;
  if (lower.includes("is not found for api version")) return true;
  if (lower.includes("not supported for generatecontent")) return true;
  return false;
}

/**
 * Thứ tự thử model — gemini-1.5-* thường 404 trên API mới; ưu tiên 2.5 / alias mà Google còn hỗ trợ generateContent.
 * @see https://ai.google.dev/gemini-api/docs/models
 */
function modelCandidates() {
  const preferred = String(process.env.GEMINI_MODEL || "").trim();
  const defaults = [
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash",
    "gemini-2.0-flash-001",
    "gemini-2.5-flash-preview-05-20",
  ];
  const ordered = [preferred || "gemini-2.5-flash-lite", ...defaults];
  const seen = new Set();
  return ordered.filter((m) => m && !seen.has(m) && seen.add(m));
}

async function generateOnce(genAI, modelName, parts) {
  const model = genAI.getGenerativeModel({ model: modelName });
  let result;
  try {
    result = await model.generateContent(parts);
  } catch (err) {
    const status = err?.status ?? err?.statusCode;
    const msg = String(err?.message || err);
    if (
      status === 400 &&
      /unable to process input image|process input image|invalid image|image data|inline_data|bytesBase64Encoded|image\/(jpeg|png|webp)/i.test(
        msg,
      )
    ) {
      throw new Error(
        "Gemini không xử lý được ảnh (file hỏng, định dạng lạ, hoặc quá nặng so với giới hạn API). Thử chỉ dùng ghi chú, hoặc ảnh JPEG/PNG nhỏ gọn hơn.",
      );
    }
    throw err;
  }
  const response = result.response;
  let text;
  try {
    text = response.text();
  } catch (textErr) {
    throw new Error(`[${modelName}] ${textErr.message || textErr}`);
  }
  text = String(text || "").trim();
  if (!text) {
    throw new Error(
      `[${modelName}] Model không trả về chữ (có thể bị chặn nội dung / SAFETY). Thử bớt ảnh hoặc rút gọn ghi chú.`,
    );
  }
  const parsed = extractJsonObject(text);
  return normalizeListingSuggestion(parsed);
}
