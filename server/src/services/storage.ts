import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const uploadsDir = process.env.UPLOADS_DIR ?? "./uploads";

/** Uploads to Vercel Blob when BLOB_READ_WRITE_TOKEN is set (production); otherwise writes to local disk (dev). */
export async function saveUpload(
  subdir: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const ext = path.extname(originalName) || "";
  const basename = `${crypto.randomUUID()}${ext}`;

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${subdir}/${basename}`, buffer, {
      access: "public",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url;
  }

  const dir = path.join(uploadsDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, basename), buffer);
  return `/uploads/${subdir}/${basename}`;
}
