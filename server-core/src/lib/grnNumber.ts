import { pool } from "../../db/pool.js";

/** Generates GRN-{branch_code}-{seq}, seq is per-branch sequential. Internal reference, separate from the vendor's own printed invoice number. */
export async function generateGrnNumber(accountId: string, branchId: string): Promise<string> {
  const branchRes = await pool.query(`SELECT code FROM branches WHERE id = $1`, [branchId]);
  if (branchRes.rowCount === 0) throw new Error("Branch not found");
  const branchCode: string = branchRes.rows[0].code;

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM grns WHERE account_id = $1 AND branch_id = $2`,
    [accountId, branchId]
  );
  const seq = countRes.rows[0].cnt + 1;
  return `GRN-${branchCode}-${String(seq).padStart(4, "0")}`;
}
