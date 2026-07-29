import type { Request, Response, NextFunction } from "express";
import { pool } from "../../db/pool.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export interface AuthedRequest extends Request {
  user?: { id: string; accountId: string; name: string; email: string };
  activeBranchId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.session.userId;
  if (!userId) return res.status(401).json({ error: "Not authenticated" });

  const userRes = await pool.query(
    `SELECT id, account_id, name, email, last_branch_id FROM users WHERE id = $1`,
    [userId]
  );
  if (userRes.rowCount === 0) return res.status(401).json({ error: "Not authenticated" });
  const user = userRes.rows[0];
  req.user = { id: user.id, accountId: user.account_id, name: user.name, email: user.email };

  const headerBranch = req.header("x-branch-id");
  if (headerBranch) {
    const assigned = await pool.query(
      `SELECT 1 FROM user_branches WHERE user_id = $1 AND branch_id = $2`,
      [userId, headerBranch]
    );
    if (assigned.rowCount && assigned.rowCount > 0) {
      req.activeBranchId = headerBranch;
      next();
      return;
    }
  }

  if (user.last_branch_id) {
    req.activeBranchId = user.last_branch_id;
  } else {
    const onlyBranch = await pool.query(
      `SELECT branch_id FROM user_branches WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    req.activeBranchId = onlyBranch.rows[0]?.branch_id;
  }
  next();
}
