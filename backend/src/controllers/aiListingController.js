import { suggestListingFromGemini } from "../services/geminiListingService.js";

export const suggestListing = async (req, res) => {
  try {
    const notes = String(req.body?.notes ?? "").trim();
    const files = Array.isArray(req.files) ? req.files : [];

    if (!notes && files.length === 0) {
      return res.status(400).json({ error: "Vui lòng nhập ghi chú hoặc đính kèm ít nhất 1 ảnh." });
    }

    const result = await suggestListingFromGemini({ notes, files });
    return res.json(result);
  } catch (error) {
    console.error("[api/ai/suggest-listing]", error);
    const msg = error.message || "Gemini error";
    if (msg.includes("GEMINI_API_KEY") || msg.includes("Thiếu GEMINI")) {
      return res.status(503).json({ error: msg });
    }
    if (
      msg.startsWith("Ảnh HEIC") ||
      msg.startsWith("Gemini không xử lý được ảnh") ||
      msg.includes("Vui lòng nhập ghi chú")
    ) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }
};
