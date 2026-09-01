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

branchesRouter.put("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { name, code, managerName, managerPhone } = req.body ?? {};
  const branchCheck = await pool.query(`SELECT id FROM branches WHERE id = $1 AND account_id = $2`, [req.params.id, req.user!.accountId]);
  if (branchCheck.rowCount === 0) return res.status(404).json({ error: "Branch not found" });

  try {
    const result = await pool.query(
      `UPDATE branches SET name = COALESCE($3, name), code = COALESCE($4, code),
              manager_name = COALESCE($5, manager_name), manager_phone = COALESCE($6, manager_phone)
       WHERE id = $1 AND account_id = $2
       RETURNING id, name, code, address, whatsapp_number, manager_name, manager_phone`,
      [req.params.id, req.user!.accountId, name ?? null, code ?? null, managerName ?? null, managerPhone ?? null]
    );
    res.json(result.rows[0]);
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A branch with this ID already exists" });
    }
    throw err;
  }
});

branchesRouter.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  const branchId = req.params.id;
  const accountId = req.user!.accountId;
  const { action, fallbackBranchId } = req.body ?? {};

  const branchCheck = await pool.query(`SELECT id FROM branches WHERE id = $1 AND account_id = $2`, [branchId, accountId]);
  if (branchCheck.rowCount === 0) return res.status(404).json({ error: "Branch not found" });

  const [poCount, grnCount] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE branch_id = $1`, [branchId]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM grns WHERE branch_id = $1`, [branchId]),
  ]);
  const poCnt = poCount.rows[0].cnt;
  const grnCnt = grnCount.rows[0].cnt;
  const hasData = poCnt > 0 || grnCnt > 0;

  // No PO/GRN history on this branch — delete outright, no popup needed.
  if (!hasData) {
    await pool.query(`UPDATE users SET last_branch_id = NULL WHERE last_branch_id = $1`, [branchId]);
    await pool.query(`DELETE FROM branches WHERE id = $1`, [branchId]);
    return res.status(204).end();
  }

  // Branch has data and the client hasn't said what to do with it yet — ask.
  if (!action) {
    return res.status(409).json({
      needsResolution: true,
      poCount: poCnt,
      grnCount: grnCnt,
      message: `This branch has ${poCnt} purchase order(s) and ${grnCnt} GRN(s) on record. Choose a fallback branch to move them to, or delete them.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (action === "reassign") {
      if (!fallbackBranchId) throw Object.assign(new Error("fallbackBranchId is required to reassign"), { status: 400 });
      if (fallbackBranchId === branchId) {
        throw Object.assign(new Error("Fallback branch must be different from the branch being deleted"), { status: 400 });
      }
      const fallbackCheck = await client.query(`SELECT id FROM branches WHERE id = $1 AND account_id = $2`, [fallbackBranchId, accountId]);
      if (fallbackCheck.rowCount === 0) throw Object.assign(new Error("Fallback branch not found"), { status: 404 });

      await client.query(`UPDATE purchase_orders SET branch_id = $1 WHERE branch_id = $2`, [fallbackBranchId, branchId]);
      await client.query(`UPDATE grns SET branch_id = $1 WHERE branch_id = $2`, [fallbackBranchId, branchId]);
      await client.query(`UPDATE users SET last_branch_id = $1 WHERE last_branch_id = $2`, [fallbackBranchId, branchId]);
      // Carry over anyone assigned to the old branch so they keep access via the fallback.
      await client.query(
        `INSERT INTO user_branches (user_id, branch_id)
         SELECT user_id, $1 FROM user_branches WHERE branch_id = $2
         ON CONFLICT DO NOTHING`,
        [fallbackBranchId, branchId]
      );
    } else if (action === "delete_data") {
      // A GRN on a different branch could still reference a PO that lives on this
      // branch — detach those references before the PO rows disappear.
      await client.query(
        `UPDATE grns SET po_id = NULL WHERE po_id IN (SELECT id FROM purchase_orders WHERE branch_id = $1)`,
        [branchId]
      );
      await client.query(`DELETE FROM grns WHERE branch_id = $1`, [branchId]);
      await client.query(`DELETE FROM purchase_orders WHERE branch_id = $1`, [branchId]);
      await client.query(`UPDATE users SET last_branch_id = NULL WHERE last_branch_id = $1`, [branchId]);
    } else {
      throw Object.assign(new Error("action must be 'reassign' or 'delete_data'"), { status: 400 });
    }

    await client.query(`DELETE FROM branches WHERE id = $1 AND account_id = $2`, [branchId, accountId]);
    await client.query("COMMIT");
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  } finally {
    client.release();
  }

  res.status(204).end();
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
