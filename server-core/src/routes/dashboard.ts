import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const dashboardRouter = Router();

function parseMultiId(val: unknown): string[] {
  if (val == null) return [];
  const raw = Array.isArray(val) ? val : String(val).split(",");
  return raw.map((v) => String(v).trim()).filter((v) => v && v !== "all");
}

/** GRN date used for filtering/grouping everywhere: the invoice date, falling back to received date, then upload date, so a GRN with the field blank is never silently dropped. */
const GRN_DATE = "COALESCE(g.invoice_date, g.received_date, g.created_at::date)";

/**
 * dateExpr overrides what the dateFrom/dateTo range filters against - pass GRN_DATE
 * for anything that should be scoped by when the invoice was dated rather than by
 * `${alias}.created_at`.
 */
function buildFilters(req: AuthedRequest, alias: string, dateExpr?: string) {
  const { branchId, vendorId, dateFrom, dateTo } = req.query;
  const conditions: string[] = [`${alias}.account_id = $1`];
  const params: unknown[] = [req.user!.accountId];

  const branchIds = parseMultiId(branchId);
  if (branchIds.length > 0) {
    params.push(branchIds);
    conditions.push(`${alias}.branch_id = ANY($${params.length})`);
  } else if (!branchId && req.activeBranchId) {
    params.push(req.activeBranchId);
    conditions.push(`${alias}.branch_id = $${params.length}`);
  }
  const vendorIds = parseMultiId(vendorId);
  if (vendorIds.length > 0) {
    params.push(vendorIds);
    conditions.push(`${alias}.vendor_id = ANY($${params.length})`);
  }
  const dateCol = dateExpr ?? `${alias}.created_at`;
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`${dateCol} >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`${dateCol} <= $${params.length}`);
  }
  return { where: conditions.join(" AND "), params };
}

/**
 * Applies the shared GRN multi-select filter (?grnId=a,b,c) on top of an existing
 * buildFilters() result. For alias "g" (a grns table) it filters g.id directly; for
 * alias "po" (purchase_orders, e.g. Vendor payables) it scopes to POs linked to the
 * selected GRNs, since a PO has no id of its own to match against.
 */
function applyGrnFilter(req: AuthedRequest, alias: string, filters: { where: string; params: unknown[] }) {
  const grnIds = parseMultiId(req.query.grnId);
  if (grnIds.length === 0) return filters;
  const params = [...filters.params, grnIds];
  const cond =
    alias === "po"
      ? `po.id IN (SELECT po_id FROM grns WHERE id = ANY($${params.length}) AND po_id IS NOT NULL)`
      : `${alias}.id = ANY($${params.length})`;
  return { where: `${filters.where} AND ${cond}`, params };
}

/**
 * On-time/in-full/price-accuracy KPIs are deprecated on this dashboard: they used to
 * compare GRNs against Purchase Orders, but the intended comparison is GRNs against
 * vendor records, which don't exist yet. Kept as a stub so the frontend has a stable
 * "not available yet" response instead of a 404.
 */
dashboardRouter.get("/kpis", requireAuth, async (_req: AuthedRequest, res) => {
  res.json({ available: false });
});

dashboardRouter.get("/price-trend", requireAuth, async (req: AuthedRequest, res) => {
  const filters = applyGrnFilter(req, "g", buildFilters(req, "g", GRN_DATE));

  const result = await pool.query(
    `SELECT COALESCE(gl.item_id::text, 'raw:' || lower(trim(gl.raw_item_name))) AS sku_key,
            COALESCE(i.name, gl.raw_item_name, 'Unmatched item') AS item_name,
            date_trunc('week', ${GRN_DATE})::date AS week,
            AVG(gl.unit_price) AS avg_price
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     LEFT JOIN items i ON i.id = gl.item_id
     WHERE g.ocr_status = 'confirmed' AND ${filters.where}
     GROUP BY sku_key, item_name, week
     ORDER BY week ASC`,
    filters.params
  );

  const weeksSet = new Set<string>();
  const byItem = new Map<string, { itemName: string; points: Map<string, number> }>();
  for (const r of result.rows) {
    const week = r.week.toISOString().slice(0, 10);
    weeksSet.add(week);
    if (!byItem.has(r.sku_key)) byItem.set(r.sku_key, { itemName: r.item_name, points: new Map() });
    byItem.get(r.sku_key)!.points.set(week, Number(r.avg_price));
  }

  const weeks = Array.from(weeksSet).sort();
  const series = weeks.map((week) => {
    const point: Record<string, string | number> = { week };
    for (const [, { itemName, points }] of byItem) {
      if (points.has(week)) point[itemName] = points.get(week)!;
    }
    return point;
  });
  const itemNames = Array.from(byItem.values()).map((v) => v.itemName);

  res.json({ series, itemNames });
});

dashboardRouter.get("/sku-counts", requireAuth, async (req: AuthedRequest, res) => {
  const filters = applyGrnFilter(req, "g", buildFilters(req, "g", GRN_DATE));

  const result = await pool.query(
    `SELECT COALESCE(i.id::text, 'raw:' || lower(trim(gl.raw_item_name))) AS sku_key,
            COALESCE(i.name, gl.raw_item_name, 'Unmatched item') AS item_name,
            i.unit,
            v.id AS vendor_id,
            COALESCE(v.name, 'No vendor') AS vendor_name,
            COUNT(*)::int AS occurrences,
            SUM(gl.received_qty) AS total_qty
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     LEFT JOIN items i ON i.id = gl.item_id
     LEFT JOIN vendors v ON v.id = g.vendor_id
     WHERE g.ocr_status = 'confirmed' AND ${filters.where}
     GROUP BY sku_key, item_name, i.unit, v.id, v.name
     ORDER BY total_qty DESC`,
    filters.params
  );

  const items = result.rows.map((r: any) => ({
    skuKey: r.sku_key,
    itemName: r.item_name,
    unit: r.unit,
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    occurrences: r.occurrences,
    totalQty: Number(r.total_qty),
  }));

  const uniqueSkuCount = new Set(items.map((r) => r.skuKey)).size;

  res.json({ uniqueSkuCount, items });
});

dashboardRouter.get("/payables", requireAuth, async (req: AuthedRequest, res) => {
  const filters = applyGrnFilter(req, "po", buildFilters(req, "po"));

  const result = await pool.query(
    `SELECT v.id AS vendor_id, v.name AS vendor_name,
            COUNT(*)::int AS po_count,
            COALESCE(SUM(po.total_amount), 0) AS amount_payable
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     WHERE po.status IN ('sent', 'partially_received', 'received') AND ${filters.where}
     GROUP BY v.id, v.name
     ORDER BY amount_payable DESC`,
    filters.params
  );

  const rows = result.rows.map((r: any) => ({
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    poCount: r.po_count,
    amountPayable: Number(r.amount_payable),
  }));

  const invoicesFilters = applyGrnFilter(req, "po", buildFilters(req, "po"));
  const invoicesRes = await pool.query(
    `SELECT v.name AS vendor_name, po.po_number, po.created_at, po.status,
            i.name AS item_name, pl.ordered_qty, i.unit, pl.unit_price, pl.ordered_amount
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     JOIN po_lines pl ON pl.po_id = po.id
     JOIN items i ON i.id = pl.item_id
     WHERE po.status IN ('sent', 'partially_received', 'received') AND ${invoicesFilters.where}
     ORDER BY v.name, po.created_at DESC, i.name`,
    invoicesFilters.params
  );
  const invoices = invoicesRes.rows.map((r: any) => ({
    vendorName: r.vendor_name,
    poNumber: r.po_number,
    createdAt: r.created_at,
    status: r.status,
    itemName: r.item_name,
    unit: r.unit,
    qty: Number(r.ordered_qty),
    unitPrice: Number(r.unit_price),
    lineAmount: Number(r.ordered_amount),
  }));

  const totalSpend = rows.reduce((s, r) => s + r.amountPayable, 0);

  res.json({ rows, invoices, totalSpend });
});

dashboardRouter.get("/grns", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT g.id, g.grn_number, g.invoice_number, v.name AS vendor_name
     FROM grns g
     LEFT JOIN vendors v ON v.id = g.vendor_id
     WHERE g.account_id = $1 AND g.ocr_status = 'confirmed'
     ORDER BY g.created_at DESC`,
    [req.user!.accountId]
  );
  res.json(
    result.rows.map((r: any) => ({
      id: r.id,
      label: `${r.grn_number ?? r.invoice_number ?? "GRN"}${r.vendor_name ? ` · ${r.vendor_name}` : ""}`,
    }))
  );
});
