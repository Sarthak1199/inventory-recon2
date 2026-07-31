import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getPriceTolerancePct, priceFlag } from "../services/gapEngine.js";

export const dashboardRouter = Router();

function buildFilters(req: AuthedRequest, alias: string) {
  const { branchId, vendorId, dateFrom, dateTo } = req.query;
  const conditions: string[] = [`${alias}.account_id = $1`];
  const params: unknown[] = [req.user!.accountId];

  const effectiveBranch = branchId && branchId !== "all" ? branchId : !branchId ? req.activeBranchId : null;
  if (effectiveBranch) {
    params.push(effectiveBranch);
    conditions.push(`${alias}.branch_id = $${params.length}`);
  }
  if (vendorId) {
    params.push(vendorId);
    conditions.push(`${alias}.vendor_id = $${params.length}`);
  }
  if (dateFrom) {
    params.push(dateFrom);
    conditions.push(`${alias}.created_at >= $${params.length}`);
  }
  if (dateTo) {
    params.push(dateTo);
    conditions.push(`${alias}.created_at <= $${params.length}`);
  }
  return { where: conditions.join(" AND "), params };
}

dashboardRouter.get("/kpis", requireAuth, async (req: AuthedRequest, res) => {
  const { where, params } = buildFilters(req, "po");

  const comparisonRes = await pool.query(
    `SELECT po.status, po.expected_delivery_date, pc.on_time_flag, pc.fill_flag
     FROM purchase_orders po LEFT JOIN po_comparisons pc ON pc.po_id = po.id
     WHERE po.status != 'draft' AND ${where}`,
    params
  );

  const onTimeCounts = { early: 0, on_time: 0, late: 0, overdue: 0, pending: 0 };
  const fillCounts = { full: 0, partial: 0, not_received: 0 };
  const today = new Date();
  for (const r of comparisonRes.rows) {
    if (r.on_time_flag) {
      onTimeCounts[r.on_time_flag as keyof typeof onTimeCounts]++;
    } else if (r.expected_delivery_date && today.getTime() > new Date(r.expected_delivery_date).getTime()) {
      onTimeCounts.overdue++;
    } else {
      onTimeCounts.pending++;
    }
    if (r.fill_flag) {
      fillCounts[r.fill_flag as keyof typeof fillCounts]++;
    } else {
      fillCounts.not_received++;
    }
  }
  const onTimeEligible = onTimeCounts.early + onTimeCounts.on_time + onTimeCounts.late + onTimeCounts.overdue;
  const onTimePct = onTimeEligible > 0 ? ((onTimeCounts.early + onTimeCounts.on_time) / onTimeEligible) * 100 : null;

  const fillEligible = fillCounts.full + fillCounts.partial + fillCounts.not_received;
  const inFullPct = fillEligible > 0 ? (fillCounts.full / fillEligible) * 100 : null;

  const tolerance = await getPriceTolerancePct(req.user!.accountId);
  const lineWhere = buildFilters(req, "po");
  const lineRes = await pool.query(
    `SELECT pl.unit_price AS ordered_price, gl.unit_price AS received_price
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     JOIN po_lines pl ON pl.id = gl.po_line_id
     JOIN purchase_orders po ON po.id = pl.po_id
     WHERE gl.is_off_po = false AND g.ocr_status = 'confirmed' AND ${lineWhere.where}`,
    lineWhere.params
  );
  const priceCounts = { higher: 0, lower: 0, same: 0 };
  for (const l of lineRes.rows) {
    const ordered = Number(l.ordered_price);
    const received = Number(l.received_price);
    const variancePct = ordered > 0 ? ((received - ordered) / ordered) * 100 : 0;
    priceCounts[priceFlag(variancePct, tolerance)]++;
  }
  const priceTotal = priceCounts.higher + priceCounts.lower + priceCounts.same;
  const priceAccuracyPct = priceTotal > 0 ? (priceCounts.same / priceTotal) * 100 : null;

  res.json({
    onTime: {
      pct: onTimePct,
      breakdown: { early: onTimeCounts.early, on_time: onTimeCounts.on_time, late: onTimeCounts.late + onTimeCounts.overdue },
      count: onTimeEligible,
    },
    inFull: {
      pct: inFullPct,
      breakdown: fillCounts,
      count: fillEligible,
    },
    priceAccuracy: {
      pct: priceAccuracyPct,
      breakdown: priceCounts,
      tolerancePct: tolerance,
      count: priceTotal,
    },
  });
});

dashboardRouter.get("/price-impact", requireAuth, async (req: AuthedRequest, res) => {
  const { where, params } = buildFilters(req, "po");

  const result = await pool.query(
    `SELECT i.id AS item_id, i.name AS item_name, i.unit,
            AVG(pl.unit_price) AS avg_ordered_price,
            AVG(gl.unit_price) AS avg_received_price,
            SUM(gl.received_qty) AS total_received_qty,
            SUM((gl.unit_price - pl.unit_price) * gl.received_qty) AS cost_impact
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     JOIN po_lines pl ON pl.id = gl.po_line_id
     JOIN purchase_orders po ON po.id = pl.po_id
     JOIN items i ON i.id = pl.item_id
     WHERE gl.is_off_po = false AND g.ocr_status = 'confirmed' AND ${where}
     GROUP BY i.id, i.name, i.unit
     ORDER BY cost_impact DESC`,
    params
  );

  const rows = result.rows.map((r: any) => ({
    itemId: r.item_id,
    itemName: r.item_name,
    unit: r.unit,
    avgOrderedPrice: Number(r.avg_ordered_price),
    avgReceivedPrice: Number(r.avg_received_price),
    pctChange: Number(r.avg_ordered_price) > 0
      ? ((Number(r.avg_received_price) - Number(r.avg_ordered_price)) / Number(r.avg_ordered_price)) * 100
      : null,
    totalReceivedQty: Number(r.total_received_qty),
    costImpact: Number(r.cost_impact),
  }));

  const cogsWhere = buildFilters(req, "po");
  const cogsRes = await pool.query(
    `SELECT COALESCE(SUM(gl.received_amount), 0) AS total_cogs
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     LEFT JOIN po_lines pl ON pl.id = gl.po_line_id
     LEFT JOIN purchase_orders po ON po.id = pl.po_id
     WHERE g.ocr_status = 'confirmed' AND (
       (gl.is_off_po = false AND ${cogsWhere.where})
       OR (gl.is_off_po = true AND g.account_id = $1)
     )`,
    cogsWhere.params
  );

  res.json({ rows, totalCogs: Number(cogsRes.rows[0].total_cogs) });
});

dashboardRouter.get("/price-trend", requireAuth, async (req: AuthedRequest, res) => {
  const { where, params } = buildFilters(req, "g");

  const result = await pool.query(
    `SELECT i.id AS item_id, i.name AS item_name,
            date_trunc('week', g.received_date)::date AS week,
            AVG(gl.unit_price) AS avg_price
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     JOIN items i ON i.id = gl.item_id
     WHERE g.ocr_status = 'confirmed' AND g.received_date IS NOT NULL AND ${where}
     GROUP BY i.id, i.name, week
     ORDER BY week ASC`,
    params
  );

  const weeksSet = new Set<string>();
  const byItem = new Map<string, { itemName: string; points: Map<string, number> }>();
  for (const r of result.rows) {
    const week = r.week.toISOString().slice(0, 10);
    weeksSet.add(week);
    if (!byItem.has(r.item_id)) byItem.set(r.item_id, { itemName: r.item_name, points: new Map() });
    byItem.get(r.item_id)!.points.set(week, Number(r.avg_price));
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

dashboardRouter.get("/payables", requireAuth, async (req: AuthedRequest, res) => {
  const { where, params } = buildFilters(req, "po");

  const result = await pool.query(
    `SELECT v.id AS vendor_id, v.name AS vendor_name,
            COUNT(*)::int AS po_count,
            COALESCE(SUM(po.total_amount), 0) AS amount_payable
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     WHERE po.status IN ('sent', 'partially_received', 'received') AND ${where}
     GROUP BY v.id, v.name
     ORDER BY amount_payable DESC`,
    params
  );

  const rows = result.rows.map((r: any) => ({
    vendorId: r.vendor_id,
    vendorName: r.vendor_name,
    poCount: r.po_count,
    amountPayable: Number(r.amount_payable),
  }));

  const invoicesWhere = buildFilters(req, "po");
  const invoicesRes = await pool.query(
    `SELECT v.name AS vendor_name, po.po_number, po.created_at, po.status,
            i.name AS item_name, pl.ordered_qty, i.unit, pl.unit_price, pl.ordered_amount
     FROM purchase_orders po
     JOIN vendors v ON v.id = po.vendor_id
     JOIN po_lines pl ON pl.po_id = po.id
     JOIN items i ON i.id = pl.item_id
     WHERE po.status IN ('sent', 'partially_received', 'received') AND ${invoicesWhere.where}
     ORDER BY v.name, po.created_at DESC, i.name`,
    invoicesWhere.params
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
