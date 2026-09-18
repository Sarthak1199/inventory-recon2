import type { Request, Response, NextFunction } from "express";
import { pool } from "../../db/pool.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    accountId?: string;
    name?: string;
    email?: string;
    branchIds?: string[];
    lastBranchId?: string | null;
  }
}

export interface AuthedRequest extends Request {
  user?: { id: string; accountId: string; name: string; email: string };
  activeBranchId?: string;
}

/** Re-reads this user's branch memberships from the DB into the session cache. Call after any mutation that changes them (create/delete a branch, reassignment). */
export async function refreshSessionBranches(req: AuthedRequest) {
  const branchRes = await pool.query(`SELECT branch_id FROM user_branches WHERE user_id = $1`, [req.session.userId]);
  req.session.branchIds = branchRes.rows.map((r) => r.branch_id);
}

/**
 * Identity and branch-membership are cached on the session at login (see
 * routes/auth.ts) so the common case here costs zero extra DB round trips —
 * this used to run 1-2 queries on every single authenticated request. Only a
 * session predating this cache (or one a mutation forgot to refresh) falls
 * back to a live lookup, which then repopulates the cache for next time.
 */
export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  if (req.session.accountId === undefined || req.session.branchIds === undefined) {
    const userRes = await pool.query(
      `SELECT id, account_id, name, email, last_branch_id FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rowCount === 0) return res.status(401).json({ error: "Not authenticated" });
    const user = userRes.rows[0];
    const branchRes = await pool.query(`SELECT branch_id FROM user_branches WHERE user_id = $1`, [userId]);

    req.session.accountId = user.account_id;
    req.session.name = user.name;
    req.session.email = user.email;
    req.session.branchIds = branchRes.rows.map((r) => r.branch_id);
    req.session.lastBranchId = user.last_branch_id;
  }

  req.user = { id: userId, accountId: req.session.accountId!, name: req.session.name!, email: req.session.email! };

  const headerBranch = req.header("x-branch-id");
  if (headerBranch && req.session.branchIds!.includes(headerBranch)) {
    req.activeBranchId = headerBranch;
  } else {
    req.activeBranchId = req.session.lastBranchId ?? req.session.branchIds![0];
  }
  next();
}
