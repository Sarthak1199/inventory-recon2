import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const uploadsDir = process.env.UPLOADS_DIR ?? "./uploads";

/**
 * Vercel names a Blob store's token env var after the store itself
 * (e.g. BLOB_READ_WRITE_TOKEN, BLOB2_READ_WRITE_TOKEN) rather than always
 * using a fixed name, so look for anything matching that pattern.
 */
function findBlobToken(): string | undefined {
  if (process.env.BLOB_READ_WRITE_TOKEN) return process.env.BLOB_READ_WRITE_TOKEN;
  const key = Object.keys(process.env).find((k) => /^BLOB.*_READ_WRITE_TOKEN$/.test(k));
  return key ? process.env[key] : undefined;
}

/** Uploads to Vercel Blob when a blob read/write token is set (production); otherwise writes to local disk (dev). */
export async function saveUpload(
  subdir: string,
  originalName: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const ext = path.extname(originalName) || "";
  const basename = `${crypto.randomUUID()}${ext}`;

  const blobToken = findBlobToken();
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`${subdir}/${basename}`, buffer, {
      access: "public",
      contentType: mimeType,
      token: blobToken,
    });
    return blob.url;
  }

  const dir = path.join(uploadsDir, subdir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, basename), buffer);
  return `/uploads/${subdir}/${basename}`;
}
