import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const branchesRouter = Router();

branchesRouter.get("/", requireAuth, async (req: AuthedRequest, res) => {
  const result = await pool.query(
    `SELECT b.id, b.name, b.code, b.address, b.whatsapp_number FROM branches b
     JOIN user_branches ub ON ub.branch_id = b.id
     WHERE ub.user_id = $1 ORDER BY b.name`,
    [req.user!.id]
  );
  res.json(result.rows);
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
