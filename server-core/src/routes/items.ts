import { Router } from "express";
import { parse } from "csv-parse/sync";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { uploadCsv } from "../middleware/upload.js";

export const itemsRouter = Router();

itemsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT id, name, unit, category FROM items WHERE account_id = $1 ORDER BY name`,
    [req.user!.accountId]
  );
  res.json(result.rows);
});

itemsRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name, unit, category } = req.body ?? {};
  if (!name || !unit) return res.status(400).json({ error: "name and unit are required" });
  const result = await pool.query(
    `INSERT INTO items (account_id, name, unit, category) VALUES ($1, $2, $3, $4)
     RETURNING id, name, unit, category`,
    [req.user!.accountId, name, unit, category ?? null]
  );
  res.status(201).json(result.rows[0]);
});

itemsRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { name, unit, category } = req.body ?? {};
  const result = await pool.query(
    `UPDATE items SET name = COALESCE($3, name), unit = COALESCE($4, unit), category = $5
     WHERE id = $1 AND account_id = $2
     RETURNING id, name, unit, category`,
    [req.params.id, req.user!.accountId, name, unit, category ?? null]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: "Item not found" });
  res.json(result.rows[0]);
});

itemsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`DELETE FROM items WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  res.status(204).end();
});

itemsRouter.get("/sample-csv", requireAuth, (_req, res) => {
  const csv = "name,unit,category\nTomato,kg,Vegetables\nMilk,litre,Dairy\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=items-sample.csv");
  res.send(csv);
});

itemsRouter.post("/import-csv", requireAuth, uploadCsv.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const records: Record<string, string>[] = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });

  const created: unknown[] = [];
  const skipped: { row: Record<string, string>; reason: string }[] = [];
  for (const row of records) {
    const name = row.name ?? row.item_name;
    const unit = row.unit;
    if (!name || !unit) {
      skipped.push({ row, reason: "missing name or unit" });
      continue;
    }
    const result = await pool.query(
      `INSERT INTO items (account_id, name, unit, category) VALUES ($1, $2, $3, $4)
       RETURNING id, name, unit, category`,
      [req.user!.accountId, name, unit, row.category ?? null]
    );
    created.push(result.rows[0]);
  }
  res.json({ created, skipped });
});
