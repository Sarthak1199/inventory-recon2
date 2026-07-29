import { Router } from "express";
import { parse } from "csv-parse/sync";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { uploadCsv } from "../middleware/upload.js";

export const vendorsRouter = Router();

vendorsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT id, name, whatsapp_number, gstin, lead_time_days FROM vendors WHERE account_id = $1 ORDER BY name`,
    [req.user!.accountId]
  );
  res.json(result.rows);
});

vendorsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name, whatsapp_number, gstin, lead_time_days } = req.body ?? {};
  if (!name) return res.status(400).json({ error: "name is required" });
  const result = await pool.query(
    `INSERT INTO vendors (account_id, name, whatsapp_number, gstin, lead_time_days)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, name, whatsapp_number, gstin, lead_time_days`,
    [req.user!.accountId, name, whatsapp_number ?? null, gstin ?? null, lead_time_days ?? null]
  );
  res.status(201).json(result.rows[0]);
});

vendorsRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { name, whatsapp_number, gstin, lead_time_days } = req.body ?? {};
  const result = await pool.query(
    `UPDATE vendors SET name = COALESCE($3, name), whatsapp_number = $4, gstin = $5, lead_time_days = $6
     WHERE id = $1 AND account_id = $2
     RETURNING id, name, whatsapp_number, gstin, lead_time_days`,
    [req.params.id, req.user!.accountId, name, whatsapp_number ?? null, gstin ?? null, lead_time_days ?? null]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Vendor not found" });
  res.json(result.rows[0]);
});

vendorsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM vendors WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  res.status(204).end();
});

vendorsRouter.post("/import-csv", requireAuth, uploadCsv.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const records: Record<string, string>[] = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });

  const created: unknown[] = [];
  const skipped: { row: Record<string, string>; reason: string }[] = [];
  for (const row of records) {
    const name = row.name ?? row.vendor_name;
    if (!name) {
      skipped.push({ row, reason: "missing name" });
      continue;
    }
    const result = await pool.query(
      `INSERT INTO vendors (account_id, name, whatsapp_number, gstin) VALUES ($1, $2, $3, $4)
       RETURNING id, name, whatsapp_number, gstin`,
      [req.user!.accountId, name, row.whatsapp_number ?? null, row.gstin ?? null]
    );
    created.push(result.rows[0]);
  }
  res.json({ created, skipped });
});
