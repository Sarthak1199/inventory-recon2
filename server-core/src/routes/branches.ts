import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const branchesRouter = Router();

branchesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT b.id, b.name, b.code, b.address, b.whatsapp_number, b.manager_name, b.manager_phone FROM branches b
     JOIN user_branches ub ON ub.branch_id = b.id
     WHERE ub.user_id = $1 ORDER BY b.name`,
    [req.user!.id]
  );
  res.json(result.rows);
});

branchesRouter.post("/", requireAuth, async (req: AuthedRequest, res) => {
  const { name, code, managerName, managerPhone } = req.body ?? {};
  if (!name || !code) return res.status(400).json({ error: "name and code are required" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const branchRes = await client.query(
      `INSERT INTO branches (account_id, name, code, manager_name, manager_phone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, code, address, whatsapp_number, manager_name, manager_phone`,
      [req.user!.accountId, name, code, managerName ?? null, managerPhone ?? null]
    );
    const branch = branchRes.rows[0];
    await client.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [req.user!.id, branch.id]);
    await client.query("COMMIT");
    res.status(201).json(branch);
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.code === "23505") {
      return res.status(409).json({ error: "A branch with this ID already exists" });
    }
    throw err;
  } finally {
    client.release();
  }
});

/** Sets the branch switcher's chosen branch as the user's last-used default. */
branchesRouter.post("/switch", requireAuth, async (req: AuthedRequest, res) => {
  const { branchId } = req.body ?? {};
  const assigned = await pool.query(
    `SELECT 1 FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
    [req.user!.id, branchId]
  );
  if (!assigned.rowCount) return res.status(403).json({ error: "Not assigned to this branch" });

  await pool.query(`UPDATE users SET last_branch_id = $1 WHERE id = $2`, [branchId, req.user!.id]);
  res.json({ activeBranchId: branchId });
});
