import cosineSimilarity from "cosine-similarity";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import Image from "../models/Image.js";
import { getEmbedding } from "../services/aiService.js";
import { deleteSupabaseByPublicUrl, isSupabaseStorageEnabled, uploadBufferToSupabase } from "../services/storageService.js";

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
const ALLOWED_RENTAL_STATUS = new Set(["chưa cho thuê", "đã cho thuê"]);
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
    extracted.push({ path: outputPath, fileName: outputName });
  }
  return extracted;
};

const resolveImageFiles = async (file) => {
  if (isImageUpload(file)) {
    return [{ path: file.path, fileName: file.originalname || path.basename(file.path) }];
  }
  if (canExtractArchive(file)) {
    const extracted = await extractImagesFromArchive(file);
    await fs.unlink(file.path).catch(() => {});
    return extracted;
  }
  throw new Error("Định dạng file chưa được hỗ trợ. Hãy dùng ảnh hoặc file zip/docx/pptx/xlsx có chứa ảnh.");
};

const persistImageFiles = async ({ imageFiles, apartmentCode, folder, createDoc }) => {
  const useSupabase = isSupabaseStorageEnabled();
  return Promise.all(
    imageFiles.map(async (file) => {
      let url = toUploadPublicPath(file.path);
      if (useSupabase) {
        const buffer = await fs.readFile(file.path);
        const uploaded = await uploadBufferToSupabase({
          buffer,
          fileName: file.fileName || path.basename(file.path),
          apartmentCode,
          folder,
        });
        url = uploaded.publicUrl;
        await fs.unlink(file.path).catch(() => {});
      }
      return createDoc(url);
    }),
  );
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
      rentalStatus = "chưa cho thuê",
      price = "",
    } = req.body;
    const normalizedApartmentCode = String(apartmentCode ?? "").trim();
    const normalizedSaleName = String(saleName ?? "").trim();
    const normalizedApartmentType = String(apartmentType ?? "").trim();
    const normalizedApartmentCondition = String(apartmentCondition ?? "").trim().toLowerCase();
    const normalizedRentalStatus = String(rentalStatus ?? "chưa cho thuê").trim().toLowerCase();
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
    if (!ALLOWED_RENTAL_STATUS.has(normalizedRentalStatus)) {
      return res.status(400).json({
        error: "rentalStatus must be one of: chưa cho thuê, đã cho thuê",
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

    const imageFiles = await resolveImageFiles(req.file);
    const docs = await persistImageFiles({
      imageFiles,
      apartmentCode: normalizedApartmentCode,
      folder: "",
      createDoc: (url) =>
        Image.create({
          url,
          description: normalizedDescription,
          apartmentCode: normalizedApartmentCode,
          saleName: normalizedSaleName,
          apartmentType: normalizedApartmentType,
          apartmentCondition: normalizedApartmentCondition,
          rentalStatus: normalizedRentalStatus,
          price: normalizedPrice,
          tags: parsedTags,
          embedding,
          isSample: false,
        }),
    });

    if (docs.length === 1) return res.status(201).json(docs[0]);
    return res.status(201).json({ count: docs.length, images: docs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const uploadSampleImage = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Image file is required" });

    const description = String(req.body?.description || "").trim();
    const tags = parseTags(String(req.body?.tags || ""));
    const sampleFolder = String(req.body?.sampleFolder || "General").trim() || "General";
    const imageFiles = await resolveImageFiles(req.file);
    const docs = await persistImageFiles({
      imageFiles,
      apartmentCode: "sample",
      folder: sampleFolder,
      createDoc: (url) =>
        Image.create({
          url,
          description,
          apartmentCode: "__sample__",
          saleName: "sample",
          apartmentType: "2BR (2 Bedroom)",
          apartmentCondition: "trống",
          rentalStatus: "chưa cho thuê",
          price: "sample",
          tags,
          embedding: [],
          isSample: true,
          sampleFolder,
        }),
    });

    if (docs.length === 1) return res.status(201).json(docs[0]);
    return res.status(201).json({ count: docs.length, images: docs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getSampleFolders = async (_req, res) => {
  try {
    const folders = await Image.distinct("sampleFolder", { isSample: true });
    const normalized = folders.map((f) => (String(f || "").trim() ? String(f).trim() : "General"));
    const unique = Array.from(new Set(["General", ...normalized])).filter(Boolean);
    unique.sort((a, b) => a.localeCompare(b, "vi"));
    return res.json(unique);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const createSampleFolder = async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });
    if (name.length > 40) return res.status(400).json({ error: "Folder name quá dài (tối đa 40 ký tự)." });
    // Không cần create thật trong DB; chỉ return OK để FE refresh list.
    return res.status(201).json({ name });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateSampleFolder = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    const sampleFolder = String(req.body?.sampleFolder || "").trim();
    if (!sampleFolder) return res.status(400).json({ error: "sampleFolder is required" });
    const doc = await Image.findOneAndUpdate({ _id: id, isSample: true }, { $set: { sampleFolder } }, { new: true });
    if (!doc) return res.status(404).json({ error: "Sample image not found." });
    return res.json(doc);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateApartment = async (req, res) => {
  try {
    const apartmentCode = String(req.params.apartmentCode || "").trim();
    if (!apartmentCode) return res.status(400).json({ error: "apartmentCode is required" });

    const updates = {};
    if (req.body.saleName !== undefined) {
      const saleName = String(req.body.saleName || "").trim();
      if (!saleName) return res.status(400).json({ error: "saleName is required" });
      updates.saleName = saleName;
    }
    if (req.body.price !== undefined) {
      const price = String(req.body.price || "").trim();
      if (!price) return res.status(400).json({ error: "price is required" });
      updates.price = price;
    }
    if (req.body.description !== undefined) {
      updates.description = String(req.body.description || "").trim();
    }
    if (req.body.apartmentType !== undefined) {
      const apartmentType = String(req.body.apartmentType || "").trim();
      if (!ALLOWED_APARTMENT_TYPES.has(apartmentType)) {
        return res.status(400).json({
          error:
            "apartmentType must be one of: 1BR (1 Bedroom), 2BR (2 Bedroom), 3BR (3 Bedroom), 4BR (4 Bedroom)",
        });
      }
      updates.apartmentType = apartmentType;
    }
    if (req.body.apartmentCondition !== undefined) {
      const apartmentCondition = String(req.body.apartmentCondition || "").trim().toLowerCase();
      if (!ALLOWED_APARTMENT_CONDITIONS.has(apartmentCondition)) {
        return res.status(400).json({
          error: "apartmentCondition must be one of: trống, bếp rèm, full",
        });
      }
      updates.apartmentCondition = apartmentCondition;
    }
    if (req.body.rentalStatus !== undefined) {
      const rentalStatus = String(req.body.rentalStatus || "").trim().toLowerCase();
      if (!ALLOWED_RENTAL_STATUS.has(rentalStatus)) {
        return res.status(400).json({
          error: "rentalStatus must be one of: chưa cho thuê, đã cho thuê",
        });
      }
      updates.rentalStatus = rentalStatus;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: "No valid fields to update." });
    }

    const result = await Image.updateMany({ apartmentCode }, { $set: updates });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Apartment not found." });
    }
    return res.json({ message: "Apartment updated.", matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const updateApartmentStatus = async (req, res) => {
  try {
    const apartmentCode = String(req.params.apartmentCode || "").trim();
    if (!apartmentCode) return res.status(400).json({ error: "apartmentCode is required" });
    const rentalStatus = String(req.body.rentalStatus || "").trim().toLowerCase();
    if (!ALLOWED_RENTAL_STATUS.has(rentalStatus)) {
      return res.status(400).json({
        error: "rentalStatus must be one of: chưa cho thuê, đã cho thuê",
      });
    }
    const result = await Image.updateMany({ apartmentCode }, { $set: { rentalStatus } });
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Apartment not found." });
    }
    return res.json({ message: "Rental status updated.", matchedCount: result.matchedCount, modifiedCount: result.modifiedCount });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteApartment = async (req, res) => {
  try {
    const apartmentCode = String(req.params.apartmentCode || "").trim();
    if (!apartmentCode) return res.status(400).json({ error: "apartmentCode is required" });

    const docs = await Image.find({ apartmentCode }).select("url");
    if (docs.length === 0) return res.status(404).json({ error: "Apartment not found." });

    await Image.deleteMany({ apartmentCode });
    await Promise.all(
      docs.map(async (doc) => {
        const url = String(doc.url || "");
        if (url.startsWith("http")) {
          await deleteSupabaseByPublicUrl(url).catch(() => {});
          return;
        }
        const filePath = path.resolve(url);
        if (!filePath.includes(`${path.sep}uploads${path.sep}`)) return;
        await fs.unlink(filePath).catch(() => {});
      }),
    );
    return res.json({ message: "Apartment deleted.", deletedCount: docs.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getAllImages = async (_req, res) => {
  try {
    const images = await Image.find({ isSample: { $ne: true } }).sort({ createdAt: -1 });
    return res.json(images);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const getSampleImages = async (_req, res) => {
  try {
    const folder = String(_req.query?.folder || "").trim();
    const query = folder && folder !== "all" ? { isSample: true, sampleFolder: folder } : { isSample: true };
    const images = await Image.find(query).sort({ createdAt: -1 });
    return res.json(images);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

export const deleteSampleImage = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ error: "id is required" });
    const doc = await Image.findOne({ _id: id, isSample: true });
    if (!doc) return res.status(404).json({ error: "Sample image not found." });

    const url = String(doc.url || "");
    if (url.startsWith("http")) {
      await deleteSupabaseByPublicUrl(url).catch(() => {});
    } else {
      const filePath = path.resolve(url);
      if (filePath.includes(`${path.sep}uploads${path.sep}`)) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
    await doc.deleteOne();
    return res.json({ message: "Sample image deleted." });
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
      isSample: { $ne: true },
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

export const downloadZip = async (req, res) => {
  try {
    const { imageIds } = req.body;
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      return res.status(400).json({ error: "imageIds must be a non-empty array" });
    }

    const images = await Image.find({ _id: { $in: imageIds } });
    if (images.length === 0) {
      return res.status(404).json({ error: "Không tìm thấy ảnh nào." });
    }

    const zip = new AdmZip();
    let count = 0;

    for (const img of images) {
      try {
        let buffer;
        if (img.url.startsWith("http")) {
          const response = await fetch(img.url);
          if (!response.ok) continue;
          buffer = Buffer.from(await response.arrayBuffer());
        } else {
          // url format: "uploads/filename.jpg"
          const filePath = path.resolve(img.url);
          buffer = await fs.readFile(filePath);
        }
        
        const basename = path.basename(img.url).split("?")[0] || "image.jpg";
        const nameParts = basename.split(".");
        const ext = nameParts.length > 1 ? `.${nameParts.pop()}` : ".jpg";
        const baseName = nameParts.join(".");
        
        // Đặt tên file tránh trùng
        zip.addFile(`${baseName}_${count}${ext}`, buffer);
        count++;
      } catch (err) {
        console.error("Lỗi khi đọc file để nén ZIP:", err.message);
      }
    }

    if (count === 0) {
      return res.status(500).json({ error: "Lỗi đọc ảnh (file có thể đã bị xoá)." });
    }

    const zipBuffer = zip.toBuffer();
    res.set("Content-Type", "application/zip");
    res.set("Content-Disposition", `attachment; filename="images_${Date.now()}.zip"`);
    res.set("Content-Length", zipBuffer.length);
    return res.send(zipBuffer);
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
    const images = await Image.find({ isSample: { $ne: true } });

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
