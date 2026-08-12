-- Restaurant Procurement & GRN Reconciliation Platform - schema

CREATE TABLE IF NOT EXISTS accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  brand_name          TEXT,
  logo_url            TEXT,
  brand_hex_color     TEXT DEFAULT '#4F46E5',
  phone_number        TEXT,
  price_tolerance_pct NUMERIC(5,2) NOT NULL DEFAULT 1.00,
  onboarding_status   TEXT NOT NULL DEFAULT 'pending' CHECK (onboarding_status IN ('pending','in_progress','done')),
  quest_dismissed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS phone_number TEXT;

CREATE TABLE IF NOT EXISTS branches (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  code             TEXT NOT NULL,
  address          TEXT,
  whatsapp_number  TEXT,
  manager_name     TEXT,
  manager_phone    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);
CREATE INDEX IF NOT EXISTS idx_branches_account ON branches(account_id);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_phone TEXT;

CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT NOT NULL,
  last_branch_id UUID REFERENCES branches(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_account ON users(account_id);

CREATE TABLE IF NOT EXISTS user_branches (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id  UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS vendors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  whatsapp_number  TEXT,
  gstin            TEXT,
  lead_time_days   INTEGER,
  poc_name         TEXT,
  poc_number       TEXT,
  description      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vendors_account ON vendors(account_id);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS poc_name TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS poc_number TEXT;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS description TEXT;

CREATE TABLE IF NOT EXISTS items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL,
  category    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_items_account ON items(account_id);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS main_item_id UUID REFERENCES items(id);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  po_number              TEXT NOT NULL,
  branch_id              UUID NOT NULL REFERENCES branches(id),
  vendor_id              UUID NOT NULL REFERENCES vendors(id),
  created_by             UUID REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  expected_delivery_date DATE,
  status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','partially_received','received','closed')),
  sent_at                TIMESTAMPTZ,
  total_amount           NUMERIC(14,2) NOT NULL DEFAULT 0,
  UNIQUE (account_id, po_number)
);
CREATE INDEX IF NOT EXISTS idx_po_account_branch ON purchase_orders(account_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);

CREATE TABLE IF NOT EXISTS po_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id),
  ordered_qty     NUMERIC(14,3) NOT NULL,
  unit_price      NUMERIC(14,2) NOT NULL,
  ordered_amount  NUMERIC(14,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_po_line_po_item ON po_lines(po_id, item_id);

CREATE TABLE IF NOT EXISTS grns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  po_id           UUID REFERENCES purchase_orders(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  vendor_id       UUID REFERENCES vendors(id),
  invoice_number  TEXT,
  grn_number      TEXT,
  invoice_date    DATE,
  received_date   DATE,
  file_url        TEXT NOT NULL,
  ocr_status      TEXT NOT NULL DEFAULT 'pending' CHECK (ocr_status IN ('pending','parsed','needs_review','confirmed')),
  raw_ocr_json    JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grn_account_branch ON grns(account_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_grn_po ON grns(po_id);
ALTER TABLE grns ADD COLUMN IF NOT EXISTS grn_number TEXT;

CREATE TABLE IF NOT EXISTS grn_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id            UUID NOT NULL REFERENCES grns(id) ON DELETE CASCADE,
  item_id           UUID REFERENCES items(id),
  po_line_id        UUID REFERENCES po_lines(id),
  received_qty      NUMERIC(14,3) NOT NULL,
  unit_price        NUMERIC(14,2) NOT NULL,
  received_amount   NUMERIC(14,2) NOT NULL,
  is_off_po         BOOLEAN NOT NULL DEFAULT FALSE,
  match_type        TEXT NOT NULL DEFAULT 'none' CHECK (match_type IN ('exact','fuzzy','manual','none')),
  raw_item_name     TEXT
);
CREATE INDEX IF NOT EXISTS idx_grn_line_grn_item ON grn_lines(grn_id, item_id);

CREATE TABLE IF NOT EXISTS po_comparisons (
  po_id                UUID PRIMARY KEY REFERENCES purchase_orders(id) ON DELETE CASCADE,
  on_time_flag         TEXT NOT NULL CHECK (on_time_flag IN ('early','on_time','late','overdue','pending')),
  fill_pct             NUMERIC(6,2) NOT NULL DEFAULT 0,
  fill_flag            TEXT NOT NULL CHECK (fill_flag IN ('full','partial','not_received')),
  price_variance_pct   NUMERIC(6,2),
  cost_impact_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  computed_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
