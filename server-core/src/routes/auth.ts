import { Router } from "express";
import bcrypt from "bcrypt";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/signup", async (req, res) => {
  const { email, password, name, accountName } = req.body ?? {};
  if (!email || !password || !name || !accountName) {
    return res.status(400).json({ error: "email, password, name, accountName are required" });
  }
  const existing = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
  if (existing.rowCount && existing.rowCount > 0) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const accountRes = await client.query(
      `INSERT INTO accounts (name) VALUES ($1) RETURNING id`,
      [accountName]
    );
    const accountId = accountRes.rows[0].id;

    const branchRes = await client.query(
      `INSERT INTO branches (account_id, name, code) VALUES ($1, 'Main Branch', 'MAIN') RETURNING id`,
      [accountId]
    );
    const branchId = branchRes.rows[0].id;

    const passwordHash = await bcrypt.hash(password, 10);
    const userRes = await client.query(
      `INSERT INTO users (account_id, email, password_hash, name, last_branch_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [accountId, email, passwordHash, name, branchId]
    );
    const userId = userRes.rows[0].id;

    await client.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2)`, [userId, branchId]);
    await client.query("COMMIT");

    req.session.userId = userId;
    res.status(201).json({ id: userId, email, name, accountId });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "email and password are required" });

  const userRes = await pool.query(
    `SELECT id, password_hash, name, account_id FROM users WHERE email = $1`,
    [email]
  );
  if (userRes.rowCount === 0) return res.status(401).json({ error: "Invalid credentials" });
  const user = userRes.rows[0];

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  req.session.userId = user.id;
  res.json({ id: user.id, email, name: user.name, accountId: user.account_id });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => res.status(204).end());
});

authRouter.get("/me", requireAuth, async (req: AuthedRequest, res) => {
  const account = await pool.query(
    `SELECT id, name, brand_name, logo_url, brand_hex_color, phone_number, onboarding_status, quest_dismissed FROM accounts WHERE id = $1`,
    [req.user!.accountId]
  );
  const branches = await pool.query(
    `SELECT b.id, b.name, b.code FROM branches b
     JOIN user_branches ub ON ub.branch_id = b.id
     WHERE ub.user_id = $1 ORDER BY b.name`,
    [req.user!.id]
  );
  res.json({
    user: req.user,
    account: account.rows[0],
    branches: branches.rows,
    activeBranchId: req.activeBranchId ?? null,
  });
});
