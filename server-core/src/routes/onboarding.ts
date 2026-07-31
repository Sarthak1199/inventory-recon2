import { Router } from "express";
import { pool } from "../../db/pool.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { uploadLogo } from "../middleware/upload.js";
import { saveUpload } from "../services/storage.js";

export const onboardingRouter = Router();

onboardingRouter.post("/setup", requireAuth, uploadLogo.single("logo"), async (req: AuthedRequest, res) => {
  const { brand_name, brand_hex_color, phone_number } = req.body ?? {};
  const logoUrl = req.file ? await saveUpload("logos", req.file.originalname, req.file.buffer, req.file.mimetype) : null;

  const result = await pool.query(
    `UPDATE accounts
     SET brand_name = COALESCE($2, brand_name),
         brand_hex_color = COALESCE($3, brand_hex_color),
         logo_url = COALESCE($4, logo_url),
         phone_number = COALESCE($5, phone_number),
         onboarding_status = 'done'
     WHERE id = $1
     RETURNING id, name, brand_name, logo_url, brand_hex_color, phone_number, onboarding_status`,
    [req.user!.accountId, brand_name ?? null, brand_hex_color ?? null, logoUrl, phone_number ?? null]
  );
  res.json(result.rows[0]);
});

onboardingRouter.get("/quest-status", requireAuth, async (req: AuthedRequest, res) => {
  const accountId = req.user!.accountId;
  const [vendorRes, itemRes, poRes, grnRes, accountRes] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS cnt FROM vendors WHERE account_id = $1`, [accountId]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM items WHERE account_id = $1`, [accountId]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM purchase_orders WHERE account_id = $1`, [accountId]),
    pool.query(`SELECT COUNT(*)::int AS cnt FROM grns WHERE account_id = $1`, [accountId]),
    pool.query(`SELECT quest_dismissed FROM accounts WHERE id = $1`, [accountId]),
  ]);

  const cards = [
    { key: "vendor", label: "Add your first vendor", done: vendorRes.rows[0].cnt > 0 },
    { key: "item", label: "Add your items (or confirm CSV import)", done: itemRes.rows[0].cnt > 0 },
    { key: "po", label: "Create your first PO", done: poRes.rows[0].cnt > 0 },
    { key: "grn", label: "Upload your first GRN", done: grnRes.rows[0].cnt > 0 },
  ];
  const doneCount = cards.filter((c) => c.done).length;

  res.json({
    cards,
    doneCount,
    total: cards.length,
    dismissed: accountRes.rows[0]?.quest_dismissed ?? false,
  });
});

onboardingRouter.post("/quest-dismiss", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`UPDATE accounts SET quest_dismissed = true WHERE id = $1`, [req.user!.accountId]);
  res.status(204).end();
});

onboardingRouter.post("/quest-reopen", requireAuth, async (req: AuthedRequest, res) => {
  await pool.query(`UPDATE accounts SET quest_dismissed = false WHERE id = $1`, [req.user!.accountId]);
  res.status(204).end();
});
