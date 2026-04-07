import express from "express";
import { getAllImages, uploadImage, searchByAI, searchImages } from "../controllers/imageController.js";
import { upload } from "../utils/upload.js";

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

/**
 * @swagger
 * /api/images:
 *   get:
 *     summary: Get all images
 *     tags: [Images]
 *     responses:
 *       200:
 *         description: List all images
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Image'
 */
router.get("/images", getAllImages);

/**
 * @swagger
 * /api/images/upload:
 *   post:
 *     summary: Upload image with metadata
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *               description:
 *                 type: string
 *               apartmentCode:
 *                 type: string
 *                 example: Căn 101
 *               saleName:
 *                 type: string
 *                 example: Nguyễn Văn A
 *               apartmentType:
 *                 type: string
 *                 example: 2BR (2 Bedroom)
 *               apartmentCondition:
 *                 type: string
 *                 example: bếp rèm
 *               price:
 *                 type: string
 *                 example: 2.000.000.000
 *               tags:
 *                 type: string
 *                 example: sleepbox, ban-cong
 *     responses:
 *       201:
 *         description: Uploaded image metadata
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Image'
 */
router.post("/images/upload", upload.single("image"), uploadImage);

/**
 * @swagger
 * /api/images/search:
 *   get:
 *     summary: Basic search by query text
 *     tags: [Images]
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of matching images
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Image'
 */
router.get("/images/search", searchImages);

/**
 * @swagger
 * /api/images/search-ai:
 *   post:
 *     summary: AI search by embedding similarity
 *     tags: [Images]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *               topK:
 *                 type: integer
 *                 default: 5
 *     responses:
 *       200:
 *         description: Ranked images by score
 */
router.post("/images/search-ai", searchByAI);

export default router;
