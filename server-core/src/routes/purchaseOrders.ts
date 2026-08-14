import { Router } from "express";
import { parse } from "csv-parse/sync";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { uploadCsv } from "../middleware/upload.js";
import { getAccountItems, matchItemName } from "../services/matching.js";
import { generatePoNumber } from "../lib/poNumber.js";
import { buildPoWhatsAppMessage, buildWaLink } from "../services/waTemplates.js";
import { recomputePoComparison } from "../services/gapEngine.js";

export const purchaseOrdersRouter = Router();

purchaseOrdersRouter.get("/sample-csv", requireAuth, (_req, res) => {
  const csv = "item_name,qty,unit_price\nTomato,50,30\nOnion,30,25\n";
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=po-lines-sample.csv");
  res.send(csv);
});

purchaseOrdersRouter.post("/parse-csv", requireAuth, uploadCsv.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const records: Record<string, string>[] = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  const items = await getAccountItems(req.user!.accountId);

  const rows = records.map((row, index) => {
    const itemName = row.item_name ?? row.name ?? "";
    const qty = Number(row.qty ?? row.quantity ?? 0);
    const unitPrice = Number(row.unit_price ?? row.price ?? 0);
    const match = matchItemName(itemName, items);
    return {
      rowIndex: index,
      itemName,
      qty,
      unitPrice,
      matchedItem: match.item,
      matchType: match.matchType,
      score: match.score,
    };
  });
  res.json({ rows });
});

purchaseOrdersRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { status, vendorId, dateFrom, dateTo, branchId } = req.query;
  const conditions: string[] = ["po.account_id = $1"];
  const params: unknown[] = [req.user!.accountId];

  if (branchId && branchId !== "all") {
    params.push(branchId);
    conditions.push(`po.branch_id = $${params.length}`);
  } else if (!branchId && req.activeBranchId) {
    params.push(req.activeBranchId);
    conditions.push(`po.branch_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`po.status = $${params.length}`);
  }
  if (vendorId) {
    params.push(vendorId);
    conditions.push(`po.vendor_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`po.created_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`po.created_at <= $${params.length}`);
  }

  const result = await pool.query(
    `SELECT po.id, po.po_number, po.status, po.created_at, po.expected_delivery_date, po.sent_at, po.total_amount,
            v.name AS vendor_name, b.name AS branch_name, b.id AS branch_id
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     JOIN branches b ON b.id = po.branch_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY po.created_at DESC`,
    params
  );
  res.json(result.rows);
});

purchaseOrdersRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const poRes = await pool.query(
    `SELECT po.*, v.name AS vendor_name, v.whatsapp_number AS vendor_whatsapp, b.name AS branch_name, b.code AS branch_code
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     JOIN branches b ON b.id = po.branch_id
     WHERE po.id = $1 AND po.account_id = $2`,
    [req.params.id, req.user!.accountId]
  );
  if (poRes.rowCount === 0) return res.status(404).json({ error: "PO not found" });

  const linesRes = await pool.query(
    `SELECT pl.id, pl.item_id, i.name AS item_name, i.unit, pl.ordered_qty, pl.unit_price, pl.ordered_amount
     FROM po_lines pl JOIN items i ON i.id = pl.item_id
     WHERE pl.po_id = $1 ORDER BY i.name`,
    [req.params.id]
  );

  const comparisonRes = await pool.query(`SELECT * FROM po_comparisons WHERE po_id = $1`, [req.params.id]);
  const waPreview = await buildPoWaPreview(req.user!.accountId, req.params.id as string);

  res.json({ ...poRes.rows[0], lines: linesRes.rows, comparison: comparisonRes.rows[0] ?? null, waPreview });
});

purchaseOrdersRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { branchId, vendorId, expectedDeliveryDate, lines } = req.body ?? {};
  if (!branchId || !vendorId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "branchId, vendorId, and at least one line are required" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const poNumber = await generatePoNumber(req.user!.accountId, branchId);

    let total = 0;
    const lineRows: { itemId: string; qty: number; price: number; amount: number }[] = [];
    for (const l of lines) {
      const qty = Number(l.orderedQty);
      const price = Number(l.unitPrice);
      const amount = qty * price;
      total += amount;
      lineRows.push({ itemId: l.itemId, qty, price, amount });
    }

    const poRes = await client.query(
      `INSERT INTO purchase_orders (account_id, po_number, branch_id, vendor_id, created_by, expected_delivery_date, status, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, 'draft', $7) RETURNING id, po_number`,
      [req.user!.accountId, poNumber, branchId, vendorId, req.user!.id, expectedDeliveryDate ?? null, total]
    );
    const poId = poRes.rows[0].id;

    for (const l of lineRows) {
      await client.query(
        `INSERT INTO po_lines (po_id, item_id, ordered_qty, unit_price, ordered_amount) VALUES ($1, $2, $3, $4, $5)`,
        [poId, l.itemId, l.qty, l.price, l.amount]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ id: poId, poNumber: poRes.rows[0].po_number, totalAmount: total });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

purchaseOrdersRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { vendorId, expectedDeliveryDate, lines } = req.body ?? {};
  if (!vendorId || !Array.isArray(lines) || lines.length === 0) {
    return res.status(400).json({ error: "vendorId and at least one line are required" });
  }

  const poCheck = await pool.query(`SELECT id FROM purchase_orders WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  if (poCheck.rowCount === 0) return res.status(404).json({ error: "PO not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let total = 0;
    const lineRows: { itemId: string; qty: number; price: number; amount: number }[] = [];
    for (const l of lines) {
      const qty = Number(l.orderedQty);
      const price = Number(l.unitPrice);
      const amount = qty * price;
      total += amount;
      lineRows.push({ itemId: l.itemId, qty, price, amount });
    }

    await client.query(
      `UPDATE purchase_orders SET vendor_id = $2, expected_delivery_date = $3, total_amount = $4 WHERE id = $1`,
      [req.params.id, vendorId, expectedDeliveryDate ?? null, total]
    );

    // Any GRN lines already matched to this PO's line rows must be detached before the old lines are replaced,
    // since grn_lines.po_line_id has no ON DELETE clause (RESTRICT).
    await client.query(
      `UPDATE grn_lines SET po_line_id = NULL, is_off_po = true WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id = $1)`,
      [req.params.id]
    );
    await client.query(`DELETE FROM po_lines WHERE po_id = $1`, [req.params.id]);

    for (const l of lineRows) {
      await client.query(
        `INSERT INTO po_lines (po_id, item_id, ordered_qty, unit_price, ordered_amount) VALUES ($1, $2, $3, $4, $5)`,
        [req.params.id, l.itemId, l.qty, l.price, l.amount]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await recomputePoComparison(req.params.id as string);

  res.json({ ok: true });
});

purchaseOrdersRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const poCheck = await pool.query(`SELECT id FROM purchase_orders WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  if (poCheck.rowCount === 0) return res.status(404).json({ error: "PO not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE grn_lines SET po_line_id = NULL, is_off_po = true WHERE po_line_id IN (SELECT id FROM po_lines WHERE po_id = $1)`,
      [req.params.id]
    );
    await client.query(`UPDATE grns SET po_id = NULL WHERE po_id = $1`, [req.params.id]);
    await client.query(`DELETE FROM purchase_orders WHERE id = $1`, [req.params.id]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.status(204).end();
});

async function buildPoWaPreview(accountId: string, poId: string) {
  const poRes = await pool.query(
    `SELECT po.id, po.po_number, po.expected_delivery_date, po.status, v.name AS vendor_name, v.whatsapp_number, b.name AS branch_name
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     JOIN branches b ON b.id = po.branch_id
     WHERE po.id = $1 AND po.account_id = $2`,
    [poId, accountId]
  );
  if (poRes.rowCount === 0) return null;
  const po = poRes.rows[0];

  const linesRes = await pool.query(
    `SELECT i.name, i.unit, pl.ordered_qty, pl.unit_price, pl.ordered_amount
     FROM po_lines pl JOIN items i ON i.id = pl.item_id WHERE pl.po_id = $1 ORDER BY i.name`,
    [poId]
  );

  const total = linesRes.rows.reduce((s: number, l: any) => s + Number(l.ordered_amount), 0);
  const message = buildPoWhatsAppMessage({
    poNumber: po.po_number,
    branchName: po.branch_name,
    vendorName: po.vendor_name,
    lines: linesRes.rows,
    total,
    expectedDeliveryDate: po.expected_delivery_date ? new Date(po.expected_delivery_date).toISOString().slice(0, 10) : null,
  });
  const waLink = buildWaLink(message);
  return { waLink, message, vendorWhatsapp: po.whatsapp_number ?? null };
}

purchaseOrdersRouter.get("/:id/wa-preview", requireAuth, async (req: AuthedRequest, res) => {
  const preview = await buildPoWaPreview(req.user!.accountId, req.params.id as string);
  if (!preview) return res.status(404).json({ error: "PO not found" });
  res.json(preview);
});

purchaseOrdersRouter.post("/:id/send", requireAuth, async (req: AuthedRequest, res) => {
  const preview = await buildPoWaPreview(req.user!.accountId, req.params.id as string);
  if (!preview) return res.status(404).json({ error: "PO not found" });

  await pool.query(
    `UPDATE purchase_orders SET status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END, sent_at = now() WHERE id = $1`,
    [req.params.id]
  );

  res.json(preview);
});
