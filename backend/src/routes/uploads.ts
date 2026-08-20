import { Router } from "express";
import multer from "multer";
import { cloudinary } from "../lib/cloudinary";
import { authenticate, requireRole } from "../middleware/auth";

export const uploadsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

uploadsRouter.use(authenticate);

// POST /uploads/product-image - signed upload to Cloudinary (Staff/Owner only).
// Backend holds the API secret; the browser never sees it.
uploadsRouter.post(
  "/product-image",
  requireRole("STAFF", "OWNER"),
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "image file is required (field name: image)" });
      return;
    }
    if (!req.file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "file must be an image" });
      return;
    }

    try {
      const url = await new Promise<string>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "kirana-store/products", resource_type: "image" },
          (err, result) => {
            if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
            resolve(result.secure_url);
          }
        );
        stream.end(req.file!.buffer);
      });

      res.status(201).json({ url });
    } catch {
      res.status(502).json({ error: "Image upload failed" });
    }
  }
);
