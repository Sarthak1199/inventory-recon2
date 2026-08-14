import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { uploadGrn } from "../middleware/upload.js";
import { extractGrnData } from "../services/ocr.js";
import { getAccountItems, matchItemName } from "../services/matching.js";
import { findBestMatch } from "../lib/fuzzyMatch.js";
import { recomputePoComparison } from "../services/gapEngine.js";
import { saveUpload } from "../services/storage.js";
import { buildGrnWhatsAppMessage, buildWaLink } from "../services/waTemplates.js";
import { generateGrnNumber } from "../lib/grnNumber.js";

export const grnsRouter = Router();

async function suggestBestPo(accountId: string, branchId: string, vendorName: string | null, invoiceDate: string | null) {
  if (!vendorName) return null;
  const vendors = await pool.query(`SELECT id, name FROM vendors WHERE account_id = $1`, [accountId]);
  const vendorMatch = findBestMatch<{ id: string; name: string }>(vendorName, vendors.rows, (v) => v.name, 0.6);
  if (!vendorMatch) return null;

  const openPos = await pool.query(
    `SELECT id, po_number, expected_delivery_date, created_at FROM purchase_orders
     WHERE account_id = $1 AND branch_id = $2 AND vendor_id = $3
       AND status IN ('sent', 'partially_received')
     ORDER BY created_at DESC`,
    [accountId, branchId, vendorMatch.item.id]
  );
  if (openPos.rowCount === 0) return null;
  if (!invoiceDate) return { poId: openPos.rows[0].id, poNumber: openPos.rows[0].po_number, vendorId: vendorMatch.item.id };

  const targetTime = new Date(invoiceDate).getTime();
  let best = openPos.rows[0];
  let bestDiff = Infinity;
  for (const po of openPos.rows) {
    const ref = po.expected_delivery_date ?? po.created_at;
    const diff = Math.abs(new Date(ref).getTime() - targetTime);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = po;
    }
  }
  return { poId: best.id, poNumber: best.po_number, vendorId: vendorMatch.item.id };
}

grnsRouter.post("/upload", requireAuth, uploadGrn.single("file"), async (req: AuthedRequest, res) => {
  if (!req.file) return res.status(400).json({ error: "file is required" });
  const branchId = req.body.branchId ?? req.activeBranchId;
  const poId = req.body.poId || null;
  if (!branchId) return res.status(400).json({ error: "branchId is required" });

  let fileUrl: string;
  try {
    fileUrl = await saveUpload("grns", req.file.originalname, req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error("GRN file upload failed:", err);
    return res.status(500).json({ error: "File storage failed", detail: err instanceof Error ? err.message : String(err) });
  }

  const grnNumber = await generateGrnNumber(req.user!.accountId, branchId);
  const grnRes = await pool.query(
    `INSERT INTO grns (account_id, po_id, branch_id, file_url, ocr_status, grn_number)
     VALUES ($1, $2, $3, $4, 'pending', $5) RETURNING id`,
    [req.user!.accountId, poId, branchId, fileUrl, grnNumber]
  );
  const grnId = grnRes.rows[0].id;

  let ocrResult;
  try {
    ocrResult = await extractGrnData(req.file.buffer, req.file.mimetype);
  } catch (err) {
    console.error("OCR extraction failed:", err);
    ocrResult = { invoice_number: null, invoice_date: null, vendor_name: null, lines: [] };
  }

  const ocrStatus = ocrResult.lines.length > 0 ? "parsed" : "needs_review";
  await pool.query(
    `UPDATE grns SET invoice_number = $2, invoice_date = $3, raw_ocr_json = $4, ocr_status = $5 WHERE id = $1`,
    [grnId, ocrResult.invoice_number, ocrResult.invoice_date, JSON.stringify(ocrResult), ocrStatus]
  );

  const items = await getAccountItems(req.user!.accountId);
  const suggestedLines = ocrResult.lines.map((l) => {
    const match = matchItemName(l.item_name, items);
    return {
      itemName: l.item_name,
      qty: l.qty,
      unitPrice: l.unit_price,
      amount: l.amount,
      hsnCode: l.hsn_code ?? null,
      cgstPct: l.cgst_pct ?? null,
      sgstPct: l.sgst_pct ?? null,
      matchedItemId: match.item?.id ?? null,
      matchedItemName: match.item?.name ?? null,
      matchType: match.matchType,
    };
  });

  let suggestedPo = null;
  if (!poId) {
    suggestedPo = await suggestBestPo(req.user!.accountId, branchId, ocrResult.vendor_name, ocrResult.invoice_date);
  }

  res.status(201).json({
    grnId,
    grnNumber,
    fileUrl,
    ocrStatus,
    extracted: { ...ocrResult, lines: suggestedLines },
    suggestedPo,
  });
});

grnsRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const { branchId, status, vendorId, dateFrom, dateTo } = req.query;
  const conditions: string[] = ["g.account_id = $1"];
  const params: unknown[] = [req.user!.accountId];

  const effectiveBranch = branchId && branchId !== "all" ? branchId : !branchId ? req.activeBranchId : null;
  if (effectiveBranch) {
    params.push(effectiveBranch);
    conditions.push(`g.branch_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`g.ocr_status = $${params.length}`);
  }
  if (vendorId) {
    params.push(vendorId);
    conditions.push(`g.vendor_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`g.created_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`g.created_at <= $${params.length}`);
  }

  const result = await pool.query(
    `SELECT g.id, g.invoice_number, g.grn_number, g.invoice_date, g.received_date, g.ocr_status, g.file_url, g.created_at,
            g.po_id, po.po_number, b.name AS branch_name, v.name AS vendor_name
     FROM grns g
     LEFT JOIN purchase_orders po ON po.id = g.po_id
     LEFT JOIN vendors v ON v.id = g.vendor_id
     JOIN branches b ON b.id = g.branch_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY g.created_at DESC`,
    params
  );
  res.json(result.rows);
});

grnsRouter.get("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const grnRes = await pool.query(
    `SELECT g.*, po.po_number, b.name AS branch_name, v.name AS vendor_name, v.whatsapp_number AS vendor_whatsapp
     FROM grns g
     LEFT JOIN purchase_orders po ON po.id = g.po_id
     LEFT JOIN vendors v ON v.id = g.vendor_id
     JOIN branches b ON b.id = g.branch_id
     WHERE g.id = $1 AND g.account_id = $2`,
    [req.params.id, req.user!.accountId]
  );
  if (grnRes.rowCount === 0) return res.status(404).json({ error: "GRN not found" });

  const linesRes = await pool.query(
    `SELECT gl.*, i.name AS item_name, i.unit FROM grn_lines gl LEFT JOIN items i ON i.id = gl.item_id WHERE gl.grn_id = $1`,
    [req.params.id]
  );
  const waPreview = await buildGrnWaPreview(req.user!.accountId, req.params.id as string);
  res.json({ ...grnRes.rows[0], lines: linesRes.rows, waPreview });
});

grnsRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const grnRes = await pool.query(`SELECT po_id FROM grns WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  if (grnRes.rowCount === 0) return res.status(404).json({ error: "GRN not found" });
  const poId = grnRes.rows[0].po_id;

  await pool.query(`DELETE FROM grns WHERE id = $1`, [req.params.id]);

  if (poId) {
    await recomputePoComparison(poId);
  }

  res.status(204).end();
});

async function buildGrnWaPreview(accountId: string, grnId: string) {
  const grnRes = await pool.query(
    `SELECT g.invoice_number, g.received_date, po.po_number, v.name AS vendor_name, v.whatsapp_number, b.name AS branch_name
     FROM grns g
     LEFT JOIN purchase_orders po ON po.id = g.po_id
     LEFT JOIN vendors v ON v.id = g.vendor_id
     JOIN branches b ON b.id = g.branch_id
     WHERE g.id = $1 AND g.account_id = $2`,
    [grnId, accountId]
  );
  if (grnRes.rowCount === 0) return null;
  const grn = grnRes.rows[0];

  const linesRes = await pool.query(
    `SELECT COALESCE(i.name, gl.raw_item_name) AS name, i.unit, gl.received_qty, gl.received_amount
     FROM grn_lines gl LEFT JOIN items i ON i.id = gl.item_id WHERE gl.grn_id = $1`,
    [grnId]
  );

  const total = linesRes.rows.reduce((s: number, l: any) => s + Number(l.received_amount), 0);
  const message = buildGrnWhatsAppMessage({
    invoiceNumber: grn.invoice_number,
    branchName: grn.branch_name,
    vendorName: grn.vendor_name,
    poNumber: grn.po_number,
    receivedDate: grn.received_date ? new Date(grn.received_date).toISOString().slice(0, 10) : null,
    lines: linesRes.rows.map((l: any) => ({ name: l.name ?? "Item", qty: l.received_qty, unit: l.unit ?? "" })),
    total,
  });
  const waLink = buildWaLink(message);
  return { waLink, message, vendorWhatsapp: grn.whatsapp_number ?? null };
}

grnsRouter.get("/:id/wa-preview", requireAuth, async (req: AuthedRequest, res) => {
  const preview = await buildGrnWaPreview(req.user!.accountId, req.params.id as string);
  if (!preview) return res.status(404).json({ error: "GRN not found" });
  res.json(preview);
});

grnsRouter.post("/:id/share-wa", requireAuth, async (req: AuthedRequest, res) => {
  const preview = await buildGrnWaPreview(req.user!.accountId, req.params.id as string);
  if (!preview) return res.status(404).json({ error: "GRN not found" });
  res.json(preview);
});

grnsRouter.put("/:id/review", requireAuth, async (req: AuthedRequest, res) => {
  const { invoiceNumber, invoiceDate, receivedDate, poId, vendorId, lines } = req.body ?? {};
  if (!Array.isArray(lines)) return res.status(400).json({ error: "lines array is required" });

  const grnCheck = await pool.query(`SELECT id FROM grns WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  if (grnCheck.rowCount === 0) return res.status(404).json({ error: "GRN not found" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `UPDATE grns SET invoice_number = $2, invoice_date = $3, received_date = $4, po_id = $5, vendor_id = $6, ocr_status = 'confirmed'
       WHERE id = $1`,
      [req.params.id, invoiceNumber ?? null, invoiceDate ?? null, receivedDate ?? null, poId ?? null, vendorId ?? null]
    );

    await client.query(`DELETE FROM grn_lines WHERE grn_id = $1`, [req.params.id]);

    let poLinesByItem = new Map<string, { id: string }>();
    if (poId) {
      const poLinesRes = await client.query(`SELECT id, item_id FROM po_lines WHERE po_id = $1`, [poId]);
      poLinesByItem = new Map(poLinesRes.rows.map((r: any) => [r.item_id, { id: r.id }]));
    }

    let subtotal = 0;
    let totalCgst = 0;
    let totalSgst = 0;

    for (const l of lines) {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unitPrice);
      const amount = qty * unitPrice;
      const itemId = l.itemId ?? null;
      const matchType = l.matchType ?? "none";
      const poLine = itemId ? poLinesByItem.get(itemId) : undefined;
      const isOffPo = !poLine;

      const hsnCode = l.hsnCode ?? null;
      const cgstPct = l.cgstPct != null ? Number(l.cgstPct) : null;
      const sgstPct = l.sgstPct != null ? Number(l.sgstPct) : null;
      const cgstAmount = cgstPct != null ? amount * (cgstPct / 100) : null;
      const sgstAmount = sgstPct != null ? amount * (sgstPct / 100) : null;

      subtotal += amount;
      totalCgst += cgstAmount ?? 0;
      totalSgst += sgstAmount ?? 0;

      await client.query(
        `INSERT INTO grn_lines (grn_id, item_id, po_line_id, received_qty, unit_price, received_amount, is_off_po, match_type, raw_item_name, hsn_code, cgst_pct, sgst_pct, cgst_amount, sgst_amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [req.params.id, itemId, poLine?.id ?? null, qty, unitPrice, amount, isOffPo, matchType, l.itemName ?? null, hsnCode, cgstPct, sgstPct, cgstAmount, sgstAmount]
      );
    }

    const totalGst = totalCgst + totalSgst;
    const billTotal = subtotal + totalGst;
    await client.query(
      `UPDATE grns SET subtotal_amount = $2, total_cgst = $3, total_sgst = $4, total_gst = $5, bill_total = $6 WHERE id = $1`,
      [req.params.id, subtotal, totalCgst, totalSgst, totalGst, billTotal]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  if (poId) {
    await recomputePoComparison(poId);
  }

  res.json({ ok: true });
});
