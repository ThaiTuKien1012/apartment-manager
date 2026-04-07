import cosineSimilarity from "cosine-similarity";
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
      price = "",
    } = req.body;
    const normalizedApartmentCode = apartmentCode.trim();
    const normalizedSaleName = saleName.trim();
    const normalizedApartmentType = apartmentType.trim();
    const normalizedDescription = description.trim();
    const normalizedPrice = price.trim();

    if (!ALLOWED_APARTMENT_TYPES.has(normalizedApartmentType)) {
      return res.status(400).json({
        error:
          "apartmentType must be one of: 1BR (1 Bedroom), 2BR (2 Bedroom), 3BR (3 Bedroom), 4BR (4 Bedroom)",
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

    const image = await Image.create({
      url: req.file.path,
      description: normalizedDescription,
      apartmentCode: normalizedApartmentCode,
      saleName: normalizedSaleName,
      apartmentType: normalizedApartmentType,
      price: normalizedPrice,
      tags: parsedTags,
      embedding,
    });

    return res.status(201).json(image);
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
