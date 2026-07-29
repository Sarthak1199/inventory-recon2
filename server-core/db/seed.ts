import bcrypt from "bcrypt";
import { pool } from "./pool.js";
import { recomputePoComparison } from "../src/services/gapEngine.js";

function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

async function seed() {
  const accountRes = await pool.query(
    `INSERT INTO accounts (name, brand_name, brand_hex_color, onboarding_status)
     VALUES ('Spice Route Demo Account', 'Spice Route', '#E11D48', 'done') RETURNING id`
  );
  const accountId = accountRes.rows[0].id;

  const koramangala = await pool.query(
    `INSERT INTO branches (account_id, name, code, address, whatsapp_number)
     VALUES ($1, 'Koramangala', 'KOR', '80 Ft Road, Koramangala, Bengaluru', '+919000000001') RETURNING id`,
    [accountId]
  );
  const branchKorId = koramangala.rows[0].id;

  const indiranagar = await pool.query(
    `INSERT INTO branches (account_id, name, code, address, whatsapp_number)
     VALUES ($1, 'Indiranagar', 'IND', '100 Ft Road, Indiranagar, Bengaluru', '+919000000002') RETURNING id`,
    [accountId]
  );
  const branchIndId = indiranagar.rows[0].id;

  const passwordHash = await bcrypt.hash("Demo@1234", 10);
  const userRes = await pool.query(
    `INSERT INTO users (account_id, email, password_hash, name, last_branch_id)
     VALUES ($1, 'demo@spiceroute.test', $2, 'Demo Owner', $3) RETURNING id`,
    [accountId, passwordHash, branchKorId]
  );
  const userId = userRes.rows[0].id;
  await pool.query(`INSERT INTO user_branches (user_id, branch_id) VALUES ($1, $2), ($1, $3)`, [
    userId,
    branchKorId,
    branchIndId,
  ]);

  const freshFarms = await pool.query(
    `INSERT INTO vendors (account_id, name, whatsapp_number, gstin, lead_time_days)
     VALUES ($1, 'Fresh Farms Produce', '+919876543210', '29ABCDE1234F1Z5', 2) RETURNING id`,
    [accountId]
  );
  const vendorFreshFarmsId = freshFarms.rows[0].id;

  const dairyDirect = await pool.query(
    `INSERT INTO vendors (account_id, name, whatsapp_number, gstin, lead_time_days)
     VALUES ($1, 'Dairy Direct Suppliers', '+919876543211', '29XYZAB5678C1Z2', 3) RETURNING id`,
    [accountId]
  );
  const vendorDairyDirectId = dairyDirect.rows[0].id;

  const itemNames: [string, string, string][] = [
    ["Tomato", "kg", "Vegetables"],
    ["Onion", "kg", "Vegetables"],
    ["Coriander", "kg", "Vegetables"],
    ["Milk", "litre", "Dairy"],
    ["Paneer", "kg", "Dairy"],
    ["Chicken", "kg", "Meat"],
  ];
  const itemIds: Record<string, string> = {};
  for (const [name, unit, category] of itemNames) {
    const r = await pool.query(
      `INSERT INTO items (account_id, name, unit, category) VALUES ($1, $2, $3, $4) RETURNING id`,
      [accountId, name, unit, category]
    );
    itemIds[name] = r.rows[0].id;
  }

  // PO-KOR-0001: past-due, receives a GRN with a partial fill + price variance + one off-PO item.
  const po1 = await pool.query(
    `INSERT INTO purchase_orders (account_id, po_number, branch_id, vendor_id, created_by, expected_delivery_date, status, sent_at, total_amount)
     VALUES ($1, 'PO-KOR-0001', $2, $3, $4, $5, 'sent', now() - interval '4 days', 0) RETURNING id`,
    [accountId, branchKorId, vendorFreshFarmsId, userId, daysFromNow(-2)]
  );
  const po1Id = po1.rows[0].id;

  const po1TomatoLine = await pool.query(
    `INSERT INTO po_lines (po_id, item_id, ordered_qty, unit_price, ordered_amount)
     VALUES ($1, $2, 50, 30, 1500) RETURNING id`,
    [po1Id, itemIds["Tomato"]]
  );
  const po1OnionLine = await pool.query(
    `INSERT INTO po_lines (po_id, item_id, ordered_qty, unit_price, ordered_amount)
     VALUES ($1, $2, 30, 25, 750) RETURNING id`,
    [po1Id, itemIds["Onion"]]
  );
  await pool.query(`UPDATE purchase_orders SET total_amount = 2250 WHERE id = $1`, [po1Id]);

  const grn1 = await pool.query(
    `INSERT INTO grns (account_id, po_id, branch_id, vendor_id, invoice_number, invoice_date, received_date, file_url, ocr_status)
     VALUES ($1, $2, $3, $4, 'INV-1001', $5, $6, '/uploads/grns/demo-invoice.png', 'confirmed') RETURNING id`,
    [accountId, po1Id, branchKorId, vendorFreshFarmsId, daysFromNow(-3), daysFromNow(-1)]
  );
  const grn1Id = grn1.rows[0].id;

  await pool.query(
    `INSERT INTO grn_lines (grn_id, item_id, po_line_id, received_qty, unit_price, received_amount, is_off_po, match_type, raw_item_name)
     VALUES
       ($1, $2, $3, 48, 31, 1488, false, 'exact', 'Tomato'),
       ($1, $4, $5, 30, 25, 750, false, 'exact', 'Onion'),
       ($1, $6, NULL, 5, 20, 100, true, 'none', 'Coriander (unordered)')`,
    [grn1Id, itemIds["Tomato"], po1TomatoLine.rows[0].id, itemIds["Onion"], po1OnionLine.rows[0].id, itemIds["Coriander"]]
  );

  await recomputePoComparison(po1Id);

  // PO-KOR-0002: still in transit, no GRN yet. Shows up as Pending in the on-time KPI.
  const po2 = await pool.query(
    `INSERT INTO purchase_orders (account_id, po_number, branch_id, vendor_id, created_by, expected_delivery_date, status, sent_at, total_amount)
     VALUES ($1, 'PO-KOR-0002', $2, $3, $4, $5, 'sent', now() - interval '1 day', 0) RETURNING id`,
    [accountId, branchKorId, vendorDairyDirectId, userId, daysFromNow(3)]
  );
  const po2Id = po2.rows[0].id;
  await pool.query(
    `INSERT INTO po_lines (po_id, item_id, ordered_qty, unit_price, ordered_amount) VALUES
       ($1, $2, 40, 55, 2200),
       ($1, $3, 10, 320, 3200)`,
    [po2Id, itemIds["Milk"], itemIds["Paneer"]]
  );
  await pool.query(`UPDATE purchase_orders SET total_amount = 5400 WHERE id = $1`, [po2Id]);

  // PO-IND-0001: fully received on-time and on-price, for a clean success case.
  const po3 = await pool.query(
    `INSERT INTO purchase_orders (account_id, po_number, branch_id, vendor_id, created_by, expected_delivery_date, status, sent_at, total_amount)
     VALUES ($1, 'PO-IND-0001', $2, $3, $4, $5, 'sent', now() - interval '5 days', 0) RETURNING id`,
    [accountId, branchIndId, vendorFreshFarmsId, userId, daysFromNow(-1)]
  );
  const po3Id = po3.rows[0].id;
  const po3ChickenLine = await pool.query(
    `INSERT INTO po_lines (po_id, item_id, ordered_qty, unit_price, ordered_amount)
     VALUES ($1, $2, 20, 220, 4400) RETURNING id`,
    [po3Id, itemIds["Chicken"]]
  );
  await pool.query(`UPDATE purchase_orders SET total_amount = 4400 WHERE id = $1`, [po3Id]);

  const grn3 = await pool.query(
    `INSERT INTO grns (account_id, po_id, branch_id, vendor_id, invoice_number, invoice_date, received_date, file_url, ocr_status)
     VALUES ($1, $2, $3, $4, 'INV-2001', $5, $6, '/uploads/grns/demo-invoice.png', 'confirmed') RETURNING id`,
    [accountId, po3Id, branchIndId, vendorFreshFarmsId, daysFromNow(-2), daysFromNow(-2)]
  );
  await pool.query(
    `INSERT INTO grn_lines (grn_id, item_id, po_line_id, received_qty, unit_price, received_amount, is_off_po, match_type, raw_item_name)
     VALUES ($1, $2, $3, 20, 220, 4400, false, 'exact', 'Chicken')`,
    [grn3.rows[0].id, itemIds["Chicken"], po3ChickenLine.rows[0].id]
  );
  await recomputePoComparison(po3Id);

  console.log("Seed complete.");
  console.log("Login with demo@spiceroute.test / Demo@1234");
  await pool.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
