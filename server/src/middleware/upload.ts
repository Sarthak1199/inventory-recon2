import multer from "multer";

// Always buffer in memory; storage.ts decides disk (dev) vs Vercel Blob (prod).
const memory = multer.memoryStorage();

export const uploadLogo = multer({ storage: memory, limits: { fileSize: 5 * 1024 * 1024 } });
export const uploadGrn = multer({ storage: memory, limits: { fileSize: 15 * 1024 * 1024 } });
export const uploadCsv = multer({ storage: memory, limits: { fileSize: 5 * 1024 * 1024 } });
