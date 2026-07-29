import { pool } from "../../db/pool.js";

/** Generates PO-{branch_code}-{seq}, seq is per-branch sequential. */
export async function generatePoNumber(accountId: string, branchId: string): Promise<string> {
  const branchRes = await pool.query(`SELECT code FROM branches WHERE id = $1`, [branchId]);
  if (branchRes.rowCount === 0) throw new Error("Branch not found");
  const branchCode: string = branchRes.rows[0].code;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE account_id = $1 AND branch_id = $2`,
    [accountId, branchId]
  );
  const seq = countRes.rows[0].cnt + 1;
  return `PO-${branchCode}-${String(seq).padStart(4, "0")}`;
}
