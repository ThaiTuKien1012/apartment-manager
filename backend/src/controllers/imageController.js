import cosineSimilarity from "cosine-similarity";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import Image from "../models/Image.js";
import { getEmbedding } from "../services/aiService.js";

const parseTags = (rawTags = "") =>
  rawTags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

const ALLOWED_APARTMENT_TYPES = new Set([
  "1BR (1 Bedroom)",
  "2BR (2 Bedroom)",
  "3BR (3 Bedroom)",
  "4BR (4 Bedroom)",
]);
const ALLOWED_APARTMENT_CONDITIONS = new Set(["trống", "bếp rèm", "full"]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".tif", ".tiff"]);
const IMAGE_MIME_PREFIX = "image/";
const OFFICE_MEDIA_PREFIXES = ["word/media/", "ppt/media/", "xl/media/"];
const MAX_EXTRACTED_IMAGES = 50;

const toUploadPublicPath = (absolutePath) => {
  const uploadRoot = path.resolve("uploads");
  const relative = path.relative(uploadRoot, absolutePath).replace(/\\/g, "/");
  return `uploads/${relative}`;
};

const makeExtractedImageName = (sourceName, entryName) => {
  const sourceBase = path.basename(sourceName, path.extname(sourceName)).replace(/[^a-zA-Z0-9_-]+/g, "-");
  const entryBase = path.basename(entryName, path.extname(entryName)).replace(/[^a-zA-Z0-9_-]+/g, "-");
  const ext = path.extname(entryName).toLowerCase() || ".jpg";
  const id = crypto.randomBytes(4).toString("hex");
  return `${Date.now()}-${sourceBase || "file"}-${entryBase || "image"}-${id}${ext}`;
};

const canExtractArchive = (file) => {
  const ext = path.extname(String(file?.originalname || "").toLowerCase());
  return ext === ".zip" || ext === ".docx" || ext === ".pptx" || ext === ".xlsx";
};

const isImageUpload = (file) => {
  if (!file) return false;
  if (String(file.mimetype || "").toLowerCase().startsWith(IMAGE_MIME_PREFIX)) return true;
  const ext = path.extname(String(file.originalname || "").toLowerCase());
  return IMAGE_EXTENSIONS.has(ext);
};

const isAllowedImageEntry = (entryName) => {
  const normalized = String(entryName || "").replace(/\\/g, "/").toLowerCase();
  const ext = path.extname(normalized);
  if (!IMAGE_EXTENSIONS.has(ext)) return false;
  if (normalized.endsWith("/")) return false;
  return true;
};

const shouldTakeEntry = (entryName, sourceExt) => {
  const normalized = String(entryName || "").replace(/\\/g, "/").toLowerCase();
  if (!isAllowedImageEntry(normalized)) return false;
  if (sourceExt === ".zip") return true;
  return OFFICE_MEDIA_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const extractImagesFromArchive = async (file) => {
  const sourceExt = path.extname(String(file.originalname || "").toLowerCase());
  const zip = new AdmZip(file.path);
  const entries = zip.getEntries();
  const selectedEntries = entries.filter((entry) => !entry.isDirectory && shouldTakeEntry(entry.entryName, sourceExt));

  if (selectedEntries.length === 0) {
    throw new Error("Không tìm thấy ảnh nào trong file đã tải lên.");
  }
  if (selectedEntries.length > MAX_EXTRACTED_IMAGES) {
    throw new Error(`File chứa quá nhiều ảnh (${selectedEntries.length}). Tối đa ${MAX_EXTRACTED_IMAGES} ảnh mỗi file.`);
  }

  const uploadRoot = path.resolve("uploads");
  const extracted = [];
  for (const entry of selectedEntries) {
    const outputName = makeExtractedImageName(file.originalname, entry.entryName);
    const outputPath = path.join(uploadRoot, outputName);
    await fs.writeFile(outputPath, entry.getData());
    extracted.push({ path: outputPath });
  }
  return extracted;
};

const getSafeSimilarity = (a = [], b = []) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    return -1;
  }

  if (a.length !== b.length) {
    return -1;
  }

  return cosineSimilarity(a, b);
};

export const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image file is required" });
    }

    const {
      description = "",
      tags = "",
      apartmentCode = "",
      saleName = "",
      apartmentType = "",
      apartmentCondition = "",
      price = "",
    } = req.body;
    const normalizedApartmentCode = String(apartmentCode ?? "").trim();
    const normalizedSaleName = String(saleName ?? "").trim();
    const normalizedApartmentType = String(apartmentType ?? "").trim();
    const normalizedApartmentCondition = String(apartmentCondition ?? "").trim().toLowerCase();
    const normalizedDescription = String(description ?? "").trim();
    const normalizedPrice = String(price ?? "").trim();

    if (!normalizedApartmentCode) {
      return res.status(400).json({ error: "apartmentCode is required" });
    }
    if (!normalizedSaleName) {
      return res.status(400).json({ error: "saleName is required" });
    }
    if (!normalizedPrice) {
      return res.status(400).json({ error: "price is required" });
    }

    if (!ALLOWED_APARTMENT_TYPES.has(normalizedApartmentType)) {
      return res.status(400).json({
        error:
          "apartmentType must be one of: 1BR (1 Bedroom), 2BR (2 Bedroom), 3BR (3 Bedroom), 4BR (4 Bedroom)",
      });
    }
    if (!ALLOWED_APARTMENT_CONDITIONS.has(normalizedApartmentCondition)) {
      return res.status(400).json({
        error: "apartmentCondition must be one of: trống, bếp rèm, full",
      });
    }

    const parsedTags = parseTags(tags);
    let embedding = [];
    const embeddingText =
      [
        normalizedDescription,
        normalizedApartmentCode,
        normalizedSaleName,
        normalizedApartmentType,
        normalizedApartmentCondition,
        normalizedPrice,
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || normalizedDescription;

    if (embeddingText) {
      try {
        embedding = await getEmbedding(embeddingText);
      } catch (_error) {
        embedding = [];
      }
    }

    let imageFiles = [];
    if (isImageUpload(req.file)) {
      imageFiles = [{ path: req.file.path }];
    } else if (canExtractArchive(req.file)) {
      imageFiles = await extractImagesFromArchive(req.file);
      await fs.unlink(req.file.path).catch(() => {});
    } else {
      return res.status(400).json({
        error: "Định dạng file chưa được hỗ trợ. Hãy dùng ảnh hoặc file zip/docx/pptx/xlsx có chứa ảnh.",
      });
    }

    const docs = await Promise.all(
      imageFiles.map((file) =>
        Image.create({
          url: toUploadPublicPath(file.path),
          description: normalizedDescription,
          apartmentCode: normalizedApartmentCode,
          saleName: normalizedSaleName,
          apartmentType: normalizedApartmentType,
          apartmentCondition: normalizedApartmentCondition,
          price: normalizedPrice,
          tags: parsedTags,
          embedding,
        }),
      ),
    );

    if (docs.length === 1) return res.status(201).json(docs[0]);
    return res.status(201).json({ count: docs.length, images: docs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getAllImages = async (_req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    return res.json(images);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const searchImages = async (req, res) => {
  try {
    const query = (req.query.query || "").trim();
    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    const tagCandidates = query
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const images = await Image.find({
      $or: [
        { description: { $regex: query, $options: "i" } },
        { apartmentCode: { $regex: query, $options: "i" } },
        { saleName: { $regex: query, $options: "i" } },
        { apartmentType: { $regex: query, $options: "i" } },
        { apartmentCondition: { $regex: query, $options: "i" } },
        { price: { $regex: query, $options: "i" } },
        { tags: { $in: tagCandidates } },
      ],
    }).sort({ createdAt: -1 });

    return res.json(images);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const searchByAI = async (req, res) => {
  try {
    const query = (req.body.query || "").trim();
    const topK = Number(req.body.topK || 5);

    if (!query) {
      return res.status(400).json({ error: "query is required" });
    }

    let queryEmbedding;
    try {
      queryEmbedding = await getEmbedding(query);
    } catch (error) {
      return res.status(400).json({
        error: "OPENAI_API_KEY is required to use /search-ai",
        detail: error.message,
      });
    }
    const images = await Image.find();

    const ranked = images
      .map((imageDoc) => {
        const image = imageDoc.toObject();
        return {
          ...image,
          score: getSafeSimilarity(queryEmbedding, image.embedding),
        };
      })
      .sort((a, b) => b.score - a.score);

    return res.json(ranked.slice(0, topK));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
