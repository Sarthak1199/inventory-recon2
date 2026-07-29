import { pool } from "../../db/pool.js";

export type OnTimeFlag = "early" | "on_time" | "late" | "overdue" | "pending";
export type FillFlag = "full" | "partial" | "not_received";

export interface PoComparisonResult {
  poId: string;
  onTimeFlag: OnTimeFlag;
  fillPct: number;
  fillFlag: FillFlag;
  priceVariancePct: number | null;
  costImpactAmount: number;
}

/**
 * Recomputes and stores the gap-engine result for a PO based on its confirmed,
 * PO-linked GRN lines (is_off_po = false). Off-PO lines are excluded from
 * on-time/in-full/price-variance but still counted in spend elsewhere.
 */
export async function recomputePoComparison(poId: string): Promise<PoComparisonResult> {
  const poRes = await pool.query(
    `SELECT id, expected_delivery_date, account_id FROM purchase_orders WHERE id = $1`,
    [poId]
  );
  if (poRes.rowCount === 0) throw new Error("PO not found");
  const po = poRes.rows[0];
  const tolerance = await getPriceTolerancePct(po.account_id);

  const linesRes = await pool.query(
    `SELECT ordered_qty, unit_price AS ordered_price, ordered_amount FROM po_lines WHERE po_id = $1`,
    [poId]
  );
  const poLines = linesRes.rows;
  const orderedTotalQty = poLines.reduce((s: number, l: any) => s + Number(l.ordered_qty), 0);

  const receivedRes = await pool.query(
    `SELECT gl.received_qty, gl.unit_price AS received_price, gl.po_line_id, pl.ordered_qty, pl.unit_price AS ordered_price
     FROM grn_lines gl
     JOIN grns g ON g.id = gl.grn_id
     JOIN po_lines pl ON pl.id = gl.po_line_id
     WHERE pl.po_id = $1 AND gl.is_off_po = false AND g.ocr_status = 'confirmed'`,
    [poId]
  );
  const receivedLines = receivedRes.rows;
  const receivedTotalQty = receivedLines.reduce((s: number, l: any) => s + Number(l.received_qty), 0);

  const grnDatesRes = await pool.query(
    `SELECT MIN(received_date) AS first_received FROM grns WHERE po_id = $1 AND ocr_status = 'confirmed'`,
    [poId]
  );
  const firstReceived: string | null = grnDatesRes.rows[0]?.first_received ?? null;

  let onTimeFlag: OnTimeFlag;
  const today = new Date();
  const expected = po.expected_delivery_date ? new Date(po.expected_delivery_date) : null;
  if (firstReceived) {
    const received = new Date(firstReceived);
    if (!expected) {
      onTimeFlag = "on_time";
    } else if (received.getTime() < expected.getTime()) {
      onTimeFlag = "early";
    } else if (received.getTime() <= expected.getTime()) {
      onTimeFlag = "on_time";
    } else {
      onTimeFlag = "late";
    }
  } else if (expected && today.getTime() > expected.getTime()) {
    onTimeFlag = "overdue";
  } else {
    onTimeFlag = "pending";
  }

  const fillPct = orderedTotalQty > 0 ? Math.min(100, (receivedTotalQty / orderedTotalQty) * 100) : 0;
  const fillFlag: FillFlag = fillPct >= 100 ? "full" : fillPct <= 0 ? "not_received" : "partial";

  let costImpact = 0;
  let varianceSum = 0;
  let varianceCount = 0;
  for (const l of receivedLines) {
    const ordered = Number(l.ordered_price);
    const received = Number(l.received_price);
    const qty = Number(l.received_qty);
    costImpact += (received - ordered) * qty;
    if (ordered > 0) {
      varianceSum += ((received - ordered) / ordered) * 100;
      varianceCount++;
    }
  }
  const priceVariancePct = varianceCount > 0 ? varianceSum / varianceCount : null;

  await pool.query(
    `INSERT INTO po_comparisons (po_id, on_time_flag, fill_pct, fill_flag, price_variance_pct, cost_impact_amount, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (po_id) DO UPDATE SET
       on_time_flag = EXCLUDED.on_time_flag,
       fill_pct = EXCLUDED.fill_pct,
       fill_flag = EXCLUDED.fill_flag,
       price_variance_pct = EXCLUDED.price_variance_pct,
       cost_impact_amount = EXCLUDED.cost_impact_amount,
       computed_at = now()`,
    [poId, onTimeFlag, fillPct, fillFlag, priceVariancePct, costImpact]
  );

  let status = "sent";
  if (fillFlag === "full") status = "received";
  else if (fillFlag === "partial") status = "partially_received";
  await pool.query(`UPDATE purchase_orders SET status = $2 WHERE id = $1 AND status != 'closed'`, [poId, status]);

  return { poId, onTimeFlag, fillPct, fillFlag, priceVariancePct, costImpactAmount: costImpact };
}

export async function getPriceTolerancePct(accountId: string): Promise<number> {
  const res = await pool.query(`SELECT price_tolerance_pct FROM accounts WHERE id = $1`, [accountId]);
  return Number(res.rows[0]?.price_tolerance_pct ?? 1);
}

export function priceFlag(variancePct: number, tolerancePct: number): "higher" | "lower" | "same" {
  if (Math.abs(variancePct) <= tolerancePct) return "same";
  return variancePct > 0 ? "higher" : "lower";
}
