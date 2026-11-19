-- =============================================================================
--  database.sql  --  Building-materials yard ERP (offline-first, PostgreSQL 16+)
--  Derived from: يوميه.xlsx (actual workbook) + the ERP specification file "details".
--
--  STATUS: written against PostgreSQL 16 syntax. NOT YET EXECUTED against a live
--  server (no PostgreSQL was available in the authoring environment). Run it on a
--  scratch database first:   psql -v ON_ERROR_STOP=1 -f database.sql
--
--  STRUCTURE
--    Part A  Schema (tables, constraints, indexes)
--    Part B  Functions, triggers, views
--    Part C  System reference data (roles, permissions, sequences, TEMPLATE chart of accounts)
--    Part D  REAL data taken from the workbook (units, products, services, equipment,
--            letterhead). Optional: skip this part for a customer who is not the
--            workbook owner. Every such row has data_origin = 'excel_import'.
--    NO sample/fake business data is included anywhere.
--
--  CONVENTIONS
--    * Money NUMERIC(16,2); quantities NUMERIC(16,3); all ids UUID (gen_random_uuid, PG13+).
--    * Every business table carries sync metadata: tenant_id, created_at/updated_at,
--      created_by/updated_by, row_version (bumped by trigger), is_deleted/deleted_at.
--    * Posted accounting records and approved documents are immutable at DB level;
--      changes require a manager approval row (app.edit_approvals) -- see Part B.
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

CREATE SCHEMA IF NOT EXISTS app;
SET LOCAL search_path = app, public;

-- ============================ PART A : SCHEMA ================================

-- One row per installation; identifies the tenant for the future central server.
CREATE TABLE app.installation (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    singleton        boolean     NOT NULL DEFAULT true UNIQUE CHECK (singleton),
    tenant_id        uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    installation_id  uuid        NOT NULL DEFAULT gen_random_uuid(),
    schema_version   integer     NOT NULL DEFAULT 1,
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION app.current_tenant_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT tenant_id FROM app.installation LIMIT 1 $$;

CREATE TABLE app.schema_migrations (
    version     text        PRIMARY KEY,
    checksum    text,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.company_profile (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    name_ar     text NOT NULL,
    name_en     text,
    tagline     text,
    address     text,
    phones      text,
    logo_path   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);

CREATE TABLE app.app_settings (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    key         text NOT NULL,
    value       jsonb NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, key)
);

-- ---- Security ---------------------------------------------------------------
CREATE TABLE app.users (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    username             text NOT NULL,
    full_name            text NOT NULL,
    password_hash        text NOT NULL,                 -- Argon2id, never plaintext
    manager_pin_hash     text,                          -- Argon2id of the 4-digit approval PIN (managers only)
    is_active            boolean NOT NULL DEFAULT true,
    must_change_password boolean NOT NULL DEFAULT true,
    failed_attempts      integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
    locked_until         timestamptz,
    last_login_at        timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);
CREATE UNIQUE INDEX ux_users_username ON app.users (lower(username)) WHERE NOT is_deleted;

CREATE TABLE app.roles (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code        text NOT NULL,
    name_ar     text NOT NULL,
    description text,
    is_system   boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code)
);

CREATE TABLE app.permissions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code        text NOT NULL,
    module      text NOT NULL,
    action      text NOT NULL,
    name_ar     text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code)
);

CREATE TABLE app.role_permissions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    role_id       uuid NOT NULL REFERENCES app.roles(id),
    permission_id uuid NOT NULL REFERENCES app.permissions(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (role_id, permission_id)
);

CREATE TABLE app.user_roles (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    user_id  uuid NOT NULL REFERENCES app.users(id),
    role_id  uuid NOT NULL REFERENCES app.roles(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (user_id, role_id)
);

-- Manager approval for editing/cancelling approved records.
CREATE TABLE app.edit_approvals (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    entity_table  text NOT NULL,
    entity_id     uuid NOT NULL,
    requested_by  uuid NOT NULL REFERENCES app.users(id),
    approved_by   uuid REFERENCES app.users(id),
    reason        text NOT NULL CHECK (length(btrim(reason)) > 0),
    status        text NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested','granted','denied','expired','used')),
    granted_at    timestamptz,
    expires_at    timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK (status <> 'granted' OR (approved_by IS NOT NULL AND expires_at IS NOT NULL))
);
CREATE INDEX ix_edit_approvals_entity ON app.edit_approvals (entity_table, entity_id);

-- Append-only, hash-chained audit trail.
CREATE TABLE app.audit_log (
    seq           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id            uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    occurred_at   timestamptz NOT NULL DEFAULT now(),
    user_id       uuid,
    approval_id   uuid,
    action        text        NOT NULL,
    entity_table  text,
    entity_id     uuid,
    before_data   jsonb,
    after_data    jsonb,
    reason        text,
    client_info   text,
    prev_hash     text,
    row_hash      text
);
CREATE INDEX ix_audit_entity ON app.audit_log (entity_table, entity_id);
CREATE INDEX ix_audit_time   ON app.audit_log (occurred_at);

-- ---- Master data --------------------------------------------------------------
CREATE TABLE app.branches (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code      text NOT NULL,
    name      text NOT NULL,
    address   text,
    is_active boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code)
);

CREATE TABLE app.units (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    name   text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, name)
);

CREATE TABLE app.products (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code                   text,
    code_group             char(1) GENERATED ALWAYS AS (left(code, 1)) STORED,  -- workbook codes: letter + 2 digits
    name                   text NOT NULL,
    kind                   text NOT NULL DEFAULT 'goods' CHECK (kind IN ('goods','service')),
    unit_id                uuid REFERENCES app.units(id),
    default_sale_price     numeric(16,2) CHECK (default_sale_price >= 0),       -- workbook "سعر اليوم"
    default_purchase_price numeric(16,2) CHECK (default_purchase_price >= 0),
    min_stock              numeric(16,3) CHECK (min_stock >= 0),
    is_active              boolean NOT NULL DEFAULT true,
    notes                  text,
    data_origin            text NOT NULL DEFAULT 'manual'
                           CHECK (data_origin IN ('manual','excel_import','system_seed','sample')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK (kind = 'service' OR unit_id IS NOT NULL)
);
CREATE UNIQUE INDEX ux_products_code ON app.products (tenant_id, code) WHERE code IS NOT NULL AND NOT is_deleted;
CREATE INDEX ix_products_name ON app.products (name);

-- One table for customers AND suppliers: the workbook has a person (معاذ رمضان)
-- who appears in both "حسابات العملاء" and "حسابات الموردين".
CREATE TABLE app.parties (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code                 text,
    name                 text NOT NULL,
    phone                text,
    phone2               text,
    address              text,
    is_customer          boolean NOT NULL DEFAULT false,
    is_supplier          boolean NOT NULL DEFAULT false,
    parent_party_id      uuid REFERENCES app.parties(id),      -- end-customer under an agent (see assumption A-4)
    category             text,                                 -- workbook "الفئه"
    relationship_start   date,                                 -- workbook "بداية التعامل"
    settlement_due_date  date,                                 -- workbook "ميعاد التحصيل / ميعاد الدفع"
    credit_limit         numeric(16,2) CHECK (credit_limit >= 0),
    supplies_text        text,                                 -- workbook supplier "المنتج"
    notes                text,
    is_active            boolean NOT NULL DEFAULT true,
    data_origin          text NOT NULL DEFAULT 'manual'
                         CHECK (data_origin IN ('manual','excel_import','system_seed','sample')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK (is_customer OR is_supplier)
);
CREATE UNIQUE INDEX ux_parties_code ON app.parties (tenant_id, code) WHERE code IS NOT NULL AND NOT is_deleted;
CREATE INDEX ix_parties_name  ON app.parties (name);
CREATE INDEX ix_parties_phone ON app.parties (phone);

-- Workbook shows labelled sub-accounts inside one customer ("حساب الاسمنت", "حساب المون").
CREATE TABLE app.party_ledger_sections (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    party_id uuid NOT NULL REFERENCES app.parties(id),
    name     text NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (party_id, name)
);

-- ---- Accounting -----------------------------------------------------------------
CREATE TABLE app.accounts (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code         text NOT NULL,
    name_ar      text NOT NULL,
    account_type text NOT NULL CHECK (account_type IN ('asset','liability','equity','revenue','expense')),
    system_role  text,       -- used by posting rules: cash, bank, receivable, payable, inventory, ...
    parent_id    uuid REFERENCES app.accounts(id),
    is_postable  boolean NOT NULL DEFAULT true,
    is_system    boolean NOT NULL DEFAULT false,
    is_active    boolean NOT NULL DEFAULT true,
    data_origin  text NOT NULL DEFAULT 'manual'
                 CHECK (data_origin IN ('manual','excel_import','system_seed','sample')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX ux_accounts_role ON app.accounts (tenant_id, system_role)
    WHERE system_role IS NOT NULL AND NOT is_deleted;

CREATE TABLE app.accounting_periods (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    period_start date NOT NULL,
    period_end   date NOT NULL,
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    closed_at    timestamptz,
    closed_by    uuid REFERENCES app.users(id),
    snapshot     jsonb,                                   -- saved monthly report data
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK (period_end >= period_start),
    UNIQUE (tenant_id, period_start)
);

CREATE TABLE app.journal_entries (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    entry_no            text NOT NULL,
    entry_date          date NOT NULL,
    description         text,
    source_type         text,                              -- e.g. 'sales_invoice', 'payment'
    source_id           uuid,
    status              text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted')),
    posted_at           timestamptz,
    posted_by           uuid REFERENCES app.users(id),
    reverses_entry_id   uuid REFERENCES app.journal_entries(id),
    reversed_by_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, entry_no)
);
CREATE INDEX ix_je_date   ON app.journal_entries (entry_date);
CREATE INDEX ix_je_source ON app.journal_entries (source_type, source_id);

CREATE TABLE app.journal_lines (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    entry_id    uuid NOT NULL REFERENCES app.journal_entries(id),
    line_no     integer NOT NULL,
    account_id  uuid NOT NULL REFERENCES app.accounts(id),
    debit       numeric(16,2) NOT NULL DEFAULT 0,
    credit      numeric(16,2) NOT NULL DEFAULT 0,
    party_id    uuid REFERENCES app.parties(id),            -- subledger dimension (customer/supplier)
    section_id  uuid REFERENCES app.party_ledger_sections(id),
    branch_id   uuid REFERENCES app.branches(id),
    description text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (entry_id, line_no),
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);
CREATE INDEX ix_jl_account ON app.journal_lines (account_id);
CREATE INDEX ix_jl_party   ON app.journal_lines (party_id) WHERE party_id IS NOT NULL;

-- ---- Treasury -------------------------------------------------------------------
CREATE TABLE app.cash_accounts (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    name        text NOT NULL,
    kind        text NOT NULL CHECK (kind IN ('cashbox','bank')),
    branch_id   uuid REFERENCES app.branches(id),
    account_id  uuid NOT NULL REFERENCES app.accounts(id),   -- its GL account; opening balance is a journal entry
    bank_name   text,
    bank_number text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, name)
);

CREATE TABLE app.cash_counts (                               -- physical vs recorded reconciliation
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    cash_account_id uuid NOT NULL REFERENCES app.cash_accounts(id),
    counted_at      timestamptz NOT NULL DEFAULT now(),
    system_balance  numeric(16,2) NOT NULL,
    counted_balance numeric(16,2) NOT NULL,
    difference      numeric(16,2) GENERATED ALWAYS AS (counted_balance - system_balance) STORED,
    notes           text,
    adjustment_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);

-- ---- Bookings / orders (workbook "حجز" rows and "البضاعه المحجوزه") --------------
CREATE TABLE app.orders (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    order_type  text NOT NULL CHECK (order_type IN ('sales','purchase')),
    order_no    text NOT NULL,
    party_id    uuid NOT NULL REFERENCES app.parties(id),
    section_id  uuid REFERENCES app.party_ledger_sections(id),
    branch_id   uuid REFERENCES app.branches(id),
    order_date  date NOT NULL,
    status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed','cancelled')),
    notes       text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, order_no)
);
CREATE INDEX ix_orders_party ON app.orders (party_id);

CREATE TABLE app.order_lines (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    order_id    uuid NOT NULL REFERENCES app.orders(id),
    line_no     integer NOT NULL,
    product_id  uuid NOT NULL REFERENCES app.products(id),
    qty_ordered numeric(16,3) NOT NULL CHECK (qty_ordered > 0),
    unit_price  numeric(16,2) NOT NULL CHECK (unit_price >= 0),
    line_total  numeric(16,2) GENERATED ALWAYS AS (round(qty_ordered * unit_price, 2)) STORED,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (order_id, line_no)
);

-- ---- Sales invoices (= one shipment / sale; template "فاتورة مبيعات") ----------
CREATE TABLE app.sales_invoices (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    invoice_no     text NOT NULL,                      -- workbook format: A0006
    invoice_type   text NOT NULL DEFAULT 'sale' CHECK (invoice_type IN ('sale','return')),
    returns_invoice_id uuid REFERENCES app.sales_invoices(id),
    party_id       uuid NOT NULL REFERENCES app.parties(id),
    section_id     uuid REFERENCES app.party_ledger_sections(id),
    branch_id      uuid NOT NULL REFERENCES app.branches(id),   -- branch goods leave from
    invoice_date   date NOT NULL,
    issued_at      timestamptz NOT NULL DEFAULT now(),
    status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
    lines_total    numeric(16,2) NOT NULL DEFAULT 0,
    handling_fee   numeric(16,2) NOT NULL DEFAULT 0 CHECK (handling_fee >= 0),   -- المشال والتحميل
    net_total      numeric(16,2) GENERATED ALWAYS AS (lines_total + handling_fee) STORED,
    -- DISPLAY ONLY: balance carried from earlier documents at issue time. Never posted to the ledger.
    previous_balance_snapshot numeric(16,2) NOT NULL DEFAULT 0,
    amount_due_snapshot numeric(16,2) GENERATED ALWAYS AS (lines_total + handling_fee + previous_balance_snapshot) STORED,
    amount_in_words text,
    receiver_name  text,
    notes          text,
    approved_at    timestamptz,
    approved_by    uuid REFERENCES app.users(id),
    cancel_reason  text,
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, invoice_no),
    CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX ix_si_party ON app.sales_invoices (party_id, invoice_date);

CREATE TABLE app.sales_invoice_lines (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    invoice_id     uuid NOT NULL REFERENCES app.sales_invoices(id),
    line_no        integer NOT NULL,
    product_id     uuid NOT NULL REFERENCES app.products(id),
    unit_id        uuid REFERENCES app.units(id),
    qty            numeric(16,3) NOT NULL CHECK (qty > 0),
    unit_price     numeric(16,2) NOT NULL CHECK (unit_price >= 0),     -- price actually used
    catalog_price_snapshot numeric(16,2),                              -- catalogue price at that moment
    line_total     numeric(16,2) GENERATED ALWAYS AS (round(qty * unit_price, 2)) STORED,
    order_line_id  uuid REFERENCES app.order_lines(id),                -- delivery against a booking
    unit_cost_snapshot numeric(16,4),                                  -- for COGS
    notes          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (invoice_id, line_no)
);

-- ---- Purchase invoices (template "اذن استلام") -----------------------------------
CREATE TABLE app.purchase_invoices (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    invoice_no     text NOT NULL,                      -- workbook format: B0011
    invoice_type   text NOT NULL DEFAULT 'purchase' CHECK (invoice_type IN ('purchase','return')),
    returns_invoice_id uuid REFERENCES app.purchase_invoices(id),
    supplier_ref   text,                               -- supplier's own document number
    party_id       uuid NOT NULL REFERENCES app.parties(id),
    branch_id      uuid NOT NULL REFERENCES app.branches(id),   -- branch receiving goods
    invoice_date   date NOT NULL,
    received_at    timestamptz NOT NULL DEFAULT now(),
    status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
    lines_total    numeric(16,2) NOT NULL DEFAULT 0,
    handling_fee   numeric(16,2) NOT NULL DEFAULT 0 CHECK (handling_fee >= 0),
    net_total      numeric(16,2) GENERATED ALWAYS AS (lines_total + handling_fee) STORED,
    previous_balance_snapshot numeric(16,2) NOT NULL DEFAULT 0,  -- display only
    notes          text,
    approved_at    timestamptz,
    approved_by    uuid REFERENCES app.users(id),
    cancel_reason  text,
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, invoice_no),
    CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX ix_pi_party ON app.purchase_invoices (party_id, invoice_date);

CREATE TABLE app.purchase_invoice_lines (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    invoice_id     uuid NOT NULL REFERENCES app.purchase_invoices(id),
    line_no        integer NOT NULL,
    product_id     uuid NOT NULL REFERENCES app.products(id),
    unit_id        uuid REFERENCES app.units(id),
    qty            numeric(16,3) NOT NULL CHECK (qty > 0),
    unit_price     numeric(16,2) NOT NULL CHECK (unit_price >= 0),
    catalog_price_snapshot numeric(16,2),
    line_total     numeric(16,2) GENERATED ALWAYS AS (round(qty * unit_price, 2)) STORED,
    order_line_id  uuid REFERENCES app.order_lines(id),
    notes          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (invoice_id, line_no)
);

-- ---- Payments (collections from customers, payments to suppliers) --------------
CREATE TABLE app.payments (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    payment_no       text NOT NULL,
    direction        text NOT NULL CHECK (direction IN ('in','out')),
    party_id         uuid NOT NULL REFERENCES app.parties(id),
    section_id       uuid REFERENCES app.party_ledger_sections(id),
    cash_account_id  uuid NOT NULL REFERENCES app.cash_accounts(id),
    amount           numeric(16,2) NOT NULL CHECK (amount > 0),
    payment_date     date NOT NULL,
    method           text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank_transfer','cheque','other')),
    purpose          text NOT NULL DEFAULT 'on_account'
                     CHECK (purpose IN ('invoice','advance','on_account','refund')),
    order_id         uuid REFERENCES app.orders(id),            -- prepayment at booking ("مقدم من العميل")
    collected_by_driver_id uuid,                                -- FK added after employees (below)
    reference        text,
    notes            text,
    status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
    approved_at      timestamptz,
    approved_by      uuid REFERENCES app.users(id),
    cancel_reason    text,
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, payment_no),
    CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);
CREATE INDEX ix_pay_party ON app.payments (party_id, payment_date);

CREATE TABLE app.payment_allocations (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    payment_id           uuid NOT NULL REFERENCES app.payments(id),
    sales_invoice_id     uuid REFERENCES app.sales_invoices(id),
    purchase_invoice_id  uuid REFERENCES app.purchase_invoices(id),
    amount               numeric(16,2) NOT NULL CHECK (amount > 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK ((sales_invoice_id IS NOT NULL)::int + (purchase_invoice_id IS NOT NULL)::int = 1)
);
CREATE INDEX ix_pa_si ON app.payment_allocations (sales_invoice_id);
CREATE INDEX ix_pa_pi ON app.payment_allocations (purchase_invoice_id);

-- ---- Employees, equipment, shipments --------------------------------------------
CREATE TABLE app.employees (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code         text,
    full_name    text NOT NULL,
    phone        text,
    job_title    text,                                  -- workbook "الوظيفه" (may be blank)
    branch_id    uuid REFERENCES app.branches(id),
    daily_rate   numeric(16,2) CHECK (daily_rate >= 0), -- workbook "قيمة اليومية"
    is_driver    boolean NOT NULL DEFAULT false,
    hired_on     date,
    is_active    boolean NOT NULL DEFAULT true,
    notes        text,
    data_origin  text NOT NULL DEFAULT 'manual'
                 CHECK (data_origin IN ('manual','excel_import','system_seed','sample')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);
CREATE UNIQUE INDEX ux_employees_code ON app.employees (tenant_id, code) WHERE code IS NOT NULL AND NOT is_deleted;

ALTER TABLE app.payments
    ADD CONSTRAINT fk_payments_driver FOREIGN KEY (collected_by_driver_id) REFERENCES app.employees(id);

CREATE TABLE app.equipment (                            -- workbook "الالات" list + "حسابات المعدات"
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    code                 text,                          -- workbook "الكود" (M01..)
    name                 text NOT NULL,
    kind                 text NOT NULL DEFAULT 'other' CHECK (kind IN ('loader','vehicle','excavator','other')),
    vehicle_description  text,                          -- workbook "نوع العربه"
    plate_no             text,                          -- workbook "رقم العربه"
    branch_id            uuid REFERENCES app.branches(id),
    purchase_date        date,
    purchase_cost        numeric(16,2) CHECK (purchase_cost >= 0),
    useful_life_months   integer CHECK (useful_life_months > 0),
    salvage_value        numeric(16,2) CHECK (salvage_value >= 0),
    status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active','maintenance','retired')),
    notes                text,
    data_origin          text NOT NULL DEFAULT 'manual'
                         CHECK (data_origin IN ('manual','excel_import','system_seed','sample')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);
CREATE UNIQUE INDEX ux_equipment_code ON app.equipment (tenant_id, code) WHERE code IS NOT NULL AND NOT is_deleted;

CREATE TABLE app.shipments (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    shipment_no   text NOT NULL,
    invoice_id    uuid NOT NULL REFERENCES app.sales_invoices(id),
    driver_id     uuid REFERENCES app.employees(id),
    vehicle_id    uuid REFERENCES app.equipment(id),
    departed_at   timestamptz,
    status        text NOT NULL DEFAULT 'dispatched'
                  CHECK (status IN ('dispatched','delivered','settled','cancelled')),
    settled_at    timestamptz,
    notes         text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, shipment_no),
    UNIQUE (invoice_id)
);

-- ---- Inventory ------------------------------------------------------------------
-- Append-only ledger. Reservations are NOT movements (they come from open order lines).
CREATE TABLE app.stock_movements (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    product_id     uuid NOT NULL REFERENCES app.products(id),
    branch_id      uuid NOT NULL REFERENCES app.branches(id),
    movement_date  date NOT NULL,
    quantity       numeric(16,3) NOT NULL CHECK (quantity <> 0),   -- signed: + in, - out
    movement_type  text NOT NULL CHECK (movement_type IN
                   ('opening','purchase_receipt','purchase_return','sale_issue','sales_return',
                    'transfer_in','transfer_out','adjustment')),
    unit_cost      numeric(16,4),
    source_type    text,
    source_id      uuid,
    notes          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);
CREATE INDEX ix_sm_pb     ON app.stock_movements (product_id, branch_id);
CREATE INDEX ix_sm_source ON app.stock_movements (source_type, source_id);

CREATE TABLE app.stock_transfers (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    transfer_no    text NOT NULL,
    from_branch_id uuid NOT NULL REFERENCES app.branches(id),
    to_branch_id   uuid NOT NULL REFERENCES app.branches(id),
    transfer_date  date NOT NULL,
    status         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
    notes          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, transfer_no),
    CHECK (from_branch_id <> to_branch_id)
);
CREATE TABLE app.stock_transfer_lines (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    transfer_id uuid NOT NULL REFERENCES app.stock_transfers(id),
    product_id  uuid NOT NULL REFERENCES app.products(id),
    qty         numeric(16,3) NOT NULL CHECK (qty > 0),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (transfer_id, product_id)
);

CREATE TABLE app.stock_adjustments (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    adjustment_date date NOT NULL,
    branch_id   uuid NOT NULL REFERENCES app.branches(id),
    product_id  uuid NOT NULL REFERENCES app.products(id),
    qty_delta   numeric(16,3) NOT NULL CHECK (qty_delta <> 0),
    reason      text NOT NULL,
    status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);

-- ---- Payroll (workbook "حسابات الموظفين" weekly sheet; "حساب انس محمد" monthly) ----
CREATE TABLE app.attendance (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    employee_id         uuid NOT NULL REFERENCES app.employees(id),
    work_date           date NOT NULL,
    day_fraction        numeric(3,2) NOT NULL CHECK (day_fraction >= 0 AND day_fraction <= 2),
    daily_rate_snapshot numeric(16,2) NOT NULL CHECK (daily_rate_snapshot >= 0),
    notes               text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (employee_id, work_date)
);

CREATE TABLE app.employee_transactions (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    employee_id uuid NOT NULL REFERENCES app.employees(id),
    tx_date     date NOT NULL,
    tx_type     text NOT NULL CHECK (tx_type IN ('advance','deduction','bonus','opening_debt','debt_repayment')),
    amount      numeric(16,2) NOT NULL CHECK (amount > 0),
    cash_account_id uuid REFERENCES app.cash_accounts(id),
    notes       text,
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);
CREATE INDEX ix_et_emp ON app.employee_transactions (employee_id, tx_date);

CREATE TABLE app.payroll_periods (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    kind         text NOT NULL CHECK (kind IN ('weekly','monthly')),
    period_start date NOT NULL,
    period_end   date NOT NULL,
    status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK (period_end >= period_start),
    UNIQUE (tenant_id, kind, period_start)
);

CREATE TABLE app.payroll_lines (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    period_id    uuid NOT NULL REFERENCES app.payroll_periods(id),
    employee_id  uuid NOT NULL REFERENCES app.employees(id),
    days_worked  numeric(6,2) NOT NULL DEFAULT 0,
    gross_wages  numeric(16,2) NOT NULL DEFAULT 0,
    advances     numeric(16,2) NOT NULL DEFAULT 0,
    deductions   numeric(16,2) NOT NULL DEFAULT 0,
    bonuses      numeric(16,2) NOT NULL DEFAULT 0,
    debt_repaid  numeric(16,2) NOT NULL DEFAULT 0,
    net_due      numeric(16,2) GENERATED ALWAYS AS (gross_wages + bonuses - advances - deductions - debt_repaid) STORED,
    paid_amount  numeric(16,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (period_id, employee_id)
);

-- ---- Expenses ---------------------------------------------------------------------
CREATE TABLE app.expense_categories (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    name       text NOT NULL,
    account_id uuid REFERENCES app.accounts(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, name)
);

CREATE TABLE app.expenses (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    expense_no      text NOT NULL,
    expense_date    date NOT NULL,
    category_id     uuid NOT NULL REFERENCES app.expense_categories(id),
    branch_id       uuid REFERENCES app.branches(id),
    amount          numeric(16,2) NOT NULL CHECK (amount > 0),
    cash_account_id uuid NOT NULL REFERENCES app.cash_accounts(id),
    method          text NOT NULL DEFAULT 'cash' CHECK (method IN ('cash','bank_transfer','cheque','other')),
    payee           text,
    attachment_path text,
    notes           text,
    status          text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','cancelled')),
    approved_at     timestamptz,
    approved_by     uuid REFERENCES app.users(id),
    cancel_reason   text,
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, expense_no),
    CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)
);

-- Normalised form of workbook sheet "حسابات المعدات" (two expense slots per day).
CREATE TABLE app.equipment_expenses (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    equipment_id    uuid NOT NULL REFERENCES app.equipment(id),
    expense_date    date NOT NULL,
    description     text,                               -- workbook "المصروف"
    amount          numeric(16,2) NOT NULL CHECK (amount > 0),
    cash_account_id uuid REFERENCES app.cash_accounts(id),
    notes           text,                               -- workbook "ملاحظه"
    journal_entry_id uuid REFERENCES app.journal_entries(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz
);
CREATE INDEX ix_ee_eq ON app.equipment_expenses (equipment_id, expense_date);

-- ---- Numbering, backups -----------------------------------------------------------
CREATE TABLE app.document_sequences (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid        NOT NULL DEFAULT app.current_tenant_id(),
    doc_type    text NOT NULL,
    prefix      text NOT NULL,
    width       integer NOT NULL DEFAULT 4 CHECK (width BETWEEN 1 AND 12),
    next_value  bigint  NOT NULL DEFAULT 1 CHECK (next_value >= 1),
    origin_note text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    created_by    uuid,
    updated_by    uuid,
    row_version   integer     NOT NULL DEFAULT 1,
    is_deleted    boolean     NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    UNIQUE (tenant_id, doc_type)
);

CREATE TABLE app.backup_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL DEFAULT app.current_tenant_id(),
    started_at  timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    kind        text NOT NULL CHECK (kind IN ('scheduled','manual','pre_update','pre_restore')),
    file_path   text,
    size_bytes  bigint,
    sha256      text,
    encrypted   boolean NOT NULL DEFAULT true,
    status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed','verified')),
    error       text
);

-- ---- Synchronisation scaffolding (central server is NOT built in v1) -------------
CREATE TABLE app.sync_outbox (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id       uuid        NOT NULL,
    entity_table    text        NOT NULL,
    entity_id       uuid        NOT NULL,
    operation       text        NOT NULL CHECK (operation IN ('insert','update','delete')),
    row_version     integer     NOT NULL,
    payload         jsonb       NOT NULL,
    idempotency_key text        NOT NULL UNIQUE,
    created_at      timestamptz NOT NULL DEFAULT now(),
    status          text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','sent','failed','dead')),
    attempts        integer     NOT NULL DEFAULT 0,
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error      text,
    sent_at         timestamptz
);
CREATE INDEX ix_outbox_pending ON app.sync_outbox (next_attempt_at) WHERE status IN ('pending','failed');

CREATE TABLE app.sync_inbox (                              -- idempotent processing of server->client changes
    idempotency_key text PRIMARY KEY,
    received_at     timestamptz NOT NULL DEFAULT now(),
    entity_table    text,
    entity_id       uuid
);

CREATE TABLE app.sync_state (
    tenant_id          uuid PRIMARY KEY,
    last_pushed_outbox_id bigint NOT NULL DEFAULT 0,
    last_pulled_cursor text,
    last_success_at    timestamptz,
    last_error         text,
    server_url         text,
    enabled            boolean NOT NULL DEFAULT false
);

CREATE TABLE app.sync_conflicts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL DEFAULT app.current_tenant_id(),
    entity_table  text NOT NULL,
    entity_id     uuid NOT NULL,
    local_data    jsonb,
    remote_data   jsonb,
    detected_at   timestamptz NOT NULL DEFAULT now(),
    resolution    text CHECK (resolution IN ('local_wins','remote_wins','merged','manual')),
    resolved_at   timestamptz,
    resolved_by   uuid
);

-- ============================ PART B : LOGIC =================================

-- ---- Document numbers (gapless; runs inside caller's transaction) ---------------
CREATE FUNCTION app.next_doc_number(p_doc_type text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_prefix text; v_width int; v_n bigint;
BEGIN
    UPDATE app.document_sequences
       SET next_value = next_value + 1
     WHERE doc_type = p_doc_type AND NOT is_deleted
    RETURNING prefix, width, next_value - 1 INTO v_prefix, v_width, v_n;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown document type: %', p_doc_type;
    END IF;
    RETURN v_prefix || lpad(v_n::text, v_width, '0');
END $$;

-- ---- row_version / updated_at ---------------------------------------------------
CREATE FUNCTION app.trg_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.row_version := OLD.row_version + 1;
    NEW.updated_at  := now();
    RETURN NEW;
END $$;

-- ---- Approved-record lock (headers with a status column) ------------------------
CREATE FUNCTION app.assert_edit_approval(p_table text, p_id uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_appr text;
BEGIN
    v_appr := nullif(current_setting('app.edit_approval_id', true), '');
    IF v_appr IS NULL THEN
        RAISE EXCEPTION 'Record is approved/locked: manager approval required (%.%)', p_table, p_id
            USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM app.edit_approvals ea
     WHERE ea.id = v_appr::uuid AND ea.status = 'granted' AND ea.expires_at > now()
       AND ea.entity_table = p_table AND ea.entity_id = p_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Edit approval is invalid, expired, or for another record' USING ERRCODE = '42501';
    END IF;
END $$;

CREATE FUNCTION app.trg_lock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('approved','cancelled') THEN
            RAISE EXCEPTION 'Approved or cancelled records cannot be deleted; cancel or reverse instead';
        END IF;
        RETURN OLD;
    END IF;
    IF OLD.status IN ('approved','cancelled') THEN
        PERFORM app.assert_edit_approval(TG_TABLE_NAME, OLD.id);
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION app.trg_child_lock_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_parent text := TG_ARGV[0]; v_fk text := TG_ARGV[1]; v_pid uuid; v_status text;
BEGIN
    IF TG_OP = 'DELETE' THEN v_pid := (to_jsonb(OLD) ->> v_fk)::uuid;
    ELSE v_pid := (to_jsonb(NEW) ->> v_fk)::uuid; END IF;
    EXECUTE format('SELECT status FROM app.%I WHERE id = $1', v_parent) INTO v_status USING v_pid;
    IF v_status IN ('approved','cancelled') THEN
        PERFORM app.assert_edit_approval(v_parent, v_pid);
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- Keeps header.lines_total in step with its lines (header remains the single source of the total).
CREATE FUNCTION app.trg_recalc_lines_total() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_header text := TG_ARGV[0]; v_fk text := TG_ARGV[1]; v_pid uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN v_pid := (to_jsonb(OLD) ->> v_fk)::uuid;
    ELSE v_pid := (to_jsonb(NEW) ->> v_fk)::uuid; END IF;
    EXECUTE format(
      'UPDATE app.%I h SET lines_total = COALESCE((SELECT SUM(l.line_total) FROM app.%I l WHERE l.%I = h.id AND NOT l.is_deleted), 0) WHERE h.id = $1',
      v_header, TG_TABLE_NAME, v_fk) USING v_pid;
    RETURN NULL;
END $$;

-- ---- Double-entry integrity -------------------------------------------------------
CREATE FUNCTION app.assert_entry_balanced(p_entry uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_d numeric; v_c numeric; v_n int;
BEGIN
    SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0), COUNT(*)
      INTO v_d, v_c, v_n
      FROM app.journal_lines WHERE entry_id = p_entry AND NOT is_deleted;
    IF v_n < 2 THEN RAISE EXCEPTION 'Journal entry % needs at least two lines', p_entry; END IF;
    IF v_d <> v_c THEN RAISE EXCEPTION 'Journal entry % is unbalanced (debit %, credit %)', p_entry, v_d, v_c; END IF;
    IF v_d = 0 THEN RAISE EXCEPTION 'Journal entry % has zero value', p_entry; END IF;
END $$;

CREATE FUNCTION app.trg_a_je_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'posted' THEN
            RAISE EXCEPTION 'Posted journal entries cannot be deleted; post a reversing entry';
        END IF;
        RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status = 'posted' THEN
        -- the only permitted change: linking the reversing entry
        IF NEW.status = 'posted'
           AND OLD.reversed_by_entry_id IS NULL AND NEW.reversed_by_entry_id IS NOT NULL
           AND (to_jsonb(NEW) - 'reversed_by_entry_id' - 'updated_at' - 'row_version' - 'updated_by')
             = (to_jsonb(OLD) - 'reversed_by_entry_id' - 'updated_at' - 'row_version' - 'updated_by') THEN
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'Posted journal entries are immutable';
    END IF;
    IF NEW.status = 'posted' THEN
        IF EXISTS (SELECT 1 FROM app.accounting_periods p
                    WHERE p.status = 'closed' AND NOT p.is_deleted
                      AND NEW.entry_date BETWEEN p.period_start AND p.period_end) THEN
            RAISE EXCEPTION 'Accounting period is closed for date %', NEW.entry_date;
        END IF;
        IF TG_OP = 'INSERT' THEN
            RAISE EXCEPTION 'Insert journal entries as draft, add lines, then post';
        END IF;
        PERFORM app.assert_entry_balanced(NEW.id);
        NEW.posted_at := COALESCE(NEW.posted_at, now());
    END IF;
    RETURN NEW;
END $$;

CREATE FUNCTION app.trg_a_jl_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_entry uuid; v_status text;
BEGIN
    v_entry := CASE WHEN TG_OP = 'DELETE' THEN OLD.entry_id ELSE NEW.entry_id END;
    SELECT status INTO v_status FROM app.journal_entries WHERE id = v_entry;
    IF v_status = 'posted' THEN
        RAISE EXCEPTION 'Lines of a posted journal entry are immutable';
    END IF;
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

-- ---- Append-only tables ---------------------------------------------------------------
CREATE FUNCTION app.trg_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only (% not allowed)', TG_TABLE_NAME, TG_OP;
END $$;

CREATE FUNCTION app.trg_audit_chain() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_prev text;
BEGIN
    PERFORM pg_advisory_xact_lock(727001);
    SELECT row_hash INTO v_prev FROM app.audit_log ORDER BY seq DESC LIMIT 1;
    NEW.prev_hash := COALESCE(v_prev, repeat('0', 64));
    NEW.row_hash  := encode(sha256(convert_to(concat_ws('|',
        NEW.prev_hash, NEW.id::text, extract(epoch FROM NEW.occurred_at)::text,
        COALESCE(NEW.user_id::text,''), NEW.action, COALESCE(NEW.entity_table,''),
        COALESCE(NEW.entity_id::text,''), COALESCE(NEW.before_data::text,''),
        COALESCE(NEW.after_data::text,'')), 'UTF8')), 'hex');
    RETURN NEW;
END $$;

-- Data-change audit written by the database itself (defence in depth; the app adds business context).
CREATE FUNCTION app.trg_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_old jsonb; v_new jsonb; v_id uuid;
BEGIN
    v_old := to_jsonb(OLD);
    v_new := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
    v_id  := (v_old ->> 'id')::uuid;
    -- editing a draft is not an auditable event; approved/cancelled changes are
    IF TG_OP = 'UPDATE' AND (v_old ->> 'status') = 'draft' AND (v_new ->> 'status') = 'draft' THEN
        RETURN NULL;
    END IF;
    INSERT INTO app.audit_log(user_id, approval_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (nullif(current_setting('app.user_id', true), '')::uuid,
            nullif(current_setting('app.edit_approval_id', true), '')::uuid,
            lower(TG_OP), TG_TABLE_NAME, v_id, v_old, v_new);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_chain BEFORE INSERT ON app.audit_log
    FOR EACH ROW EXECUTE FUNCTION app.trg_audit_chain();
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON app.audit_log
    FOR EACH ROW EXECUTE FUNCTION app.trg_append_only();
CREATE TRIGGER trg_stock_immutable BEFORE UPDATE OR DELETE ON app.stock_movements
    FOR EACH ROW EXECUTE FUNCTION app.trg_append_only();

-- ---- Sync outbox -------------------------------------------------------------------------
CREATE FUNCTION app.trg_outbox() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_row jsonb; v_id uuid; v_ver int; v_op text;
BEGIN
    IF TG_OP = 'DELETE' THEN v_row := to_jsonb(OLD); v_op := 'delete';
    ELSE v_row := to_jsonb(NEW); v_op := lower(TG_OP); END IF;
    v_id  := (v_row ->> 'id')::uuid;
    v_ver := COALESCE((v_row ->> 'row_version')::int, 1);
    INSERT INTO app.sync_outbox(tenant_id, entity_table, entity_id, operation, row_version, payload, idempotency_key)
    VALUES ((v_row ->> 'tenant_id')::uuid, TG_TABLE_NAME, v_id, v_op, v_ver, v_row,
            (v_row ->> 'tenant_id') || ':' || TG_TABLE_NAME || ':' || v_id || ':' || v_ver || ':' || v_op)
    ON CONFLICT (idempotency_key) DO NOTHING;
    RETURN NULL;
END $$;

-- ---- Attach triggers ----------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
    -- row_version / updated_at on every table that has the sync columns
    FOR r IN SELECT c.table_name FROM information_schema.columns c
               JOIN information_schema.tables t
                 ON t.table_schema = c.table_schema AND t.table_name = c.table_name
              WHERE c.table_schema = 'app' AND c.column_name = 'row_version' AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('CREATE TRIGGER trg_m_touch BEFORE UPDATE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.trg_touch()', r.table_name);
        -- outbox for all synced business tables (never users: contains credential hashes)
        IF r.table_name NOT IN ('users','edit_approvals','user_roles','app_settings','document_sequences') THEN
            EXECUTE format('CREATE TRIGGER trg_z_outbox AFTER INSERT OR UPDATE OR DELETE ON app.%I FOR EACH ROW EXECUTE FUNCTION app.trg_outbox()', r.table_name);
        END IF;
    END LOOP;
END $$;

-- Lock guards: approved/cancelled documents need a granted manager approval
CREATE TRIGGER trg_a_lock BEFORE UPDATE OR DELETE ON app.sales_invoices    FOR EACH ROW EXECUTE FUNCTION app.trg_lock_guard();
CREATE TRIGGER trg_a_lock BEFORE UPDATE OR DELETE ON app.purchase_invoices FOR EACH ROW EXECUTE FUNCTION app.trg_lock_guard();
CREATE TRIGGER trg_a_lock BEFORE UPDATE OR DELETE ON app.payments          FOR EACH ROW EXECUTE FUNCTION app.trg_lock_guard();
CREATE TRIGGER trg_a_lock BEFORE UPDATE OR DELETE ON app.expenses          FOR EACH ROW EXECUTE FUNCTION app.trg_lock_guard();
CREATE TRIGGER trg_a_lock BEFORE UPDATE OR DELETE ON app.stock_transfers   FOR EACH ROW EXECUTE FUNCTION app.trg_lock_guard();
CREATE TRIGGER trg_a_lock BEFORE UPDATE OR DELETE ON app.stock_adjustments FOR EACH ROW EXECUTE FUNCTION app.trg_lock_guard();

CREATE TRIGGER trg_a_child_lock BEFORE INSERT OR UPDATE OR DELETE ON app.sales_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION app.trg_child_lock_guard('sales_invoices', 'invoice_id');
CREATE TRIGGER trg_a_child_lock BEFORE INSERT OR UPDATE OR DELETE ON app.purchase_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION app.trg_child_lock_guard('purchase_invoices', 'invoice_id');
CREATE TRIGGER trg_a_child_lock BEFORE INSERT OR UPDATE OR DELETE ON app.payment_allocations
    FOR EACH ROW EXECUTE FUNCTION app.trg_child_lock_guard('payments', 'payment_id');
CREATE TRIGGER trg_a_child_lock BEFORE INSERT OR UPDATE OR DELETE ON app.stock_transfer_lines
    FOR EACH ROW EXECUTE FUNCTION app.trg_child_lock_guard('stock_transfers', 'transfer_id');

CREATE TRIGGER trg_recalc AFTER INSERT OR UPDATE OR DELETE ON app.sales_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION app.trg_recalc_lines_total('sales_invoices', 'invoice_id');
CREATE TRIGGER trg_recalc AFTER INSERT OR UPDATE OR DELETE ON app.purchase_invoice_lines
    FOR EACH ROW EXECUTE FUNCTION app.trg_recalc_lines_total('purchase_invoices', 'invoice_id');

CREATE TRIGGER trg_a_je_guard BEFORE INSERT OR UPDATE OR DELETE ON app.journal_entries
    FOR EACH ROW EXECUTE FUNCTION app.trg_a_je_guard();
CREATE TRIGGER trg_a_jl_guard BEFORE INSERT OR UPDATE OR DELETE ON app.journal_lines
    FOR EACH ROW EXECUTE FUNCTION app.trg_a_jl_guard();

-- Data-change audit on the tables that matter most
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.sales_invoices    FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.purchase_invoices FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.payments          FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.expenses          FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.journal_entries   FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.products          FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.parties           FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.employees         FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();
CREATE TRIGGER trg_x_audit AFTER UPDATE OR DELETE ON app.accounts          FOR EACH ROW EXECUTE FUNCTION app.trg_audit_change();

-- ---- Business functions ------------------------------------------------------------------
-- Reproduces the workbook weekly formula:  days x daily rate - (advances + deductions)  [+ bonuses].
CREATE FUNCTION app.employee_net_due(p_employee uuid, p_from date, p_to date) RETURNS numeric
LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT SUM(a.day_fraction * a.daily_rate_snapshot)
                       FROM app.attendance a
                      WHERE a.employee_id = p_employee AND a.work_date BETWEEN p_from AND p_to AND NOT a.is_deleted), 0)
         + COALESCE((SELECT SUM(CASE t.tx_type WHEN 'bonus' THEN t.amount
                                               WHEN 'advance' THEN -t.amount
                                               WHEN 'deduction' THEN -t.amount ELSE 0 END)
                       FROM app.employee_transactions t
                      WHERE t.employee_id = p_employee AND t.tx_date BETWEEN p_from AND p_to AND NOT t.is_deleted), 0)
$$;

-- ---- Views ------------------------------------------------------------------------------------
CREATE VIEW app.v_stock_on_hand AS
SELECT product_id, branch_id, SUM(quantity) AS qty_on_hand
  FROM app.stock_movements WHERE NOT is_deleted
 GROUP BY product_id, branch_id;

-- Booked vs fulfilled per order line (reservations are derived, never subtracted from physical stock).
CREATE VIEW app.v_order_line_progress AS
SELECT ol.id AS order_line_id, ol.order_id, o.order_type, o.party_id, o.branch_id, ol.product_id,
       ol.qty_ordered,
       COALESCE(f.qty, 0) AS qty_fulfilled,
       GREATEST(ol.qty_ordered - COALESCE(f.qty, 0), 0) AS qty_remaining
  FROM app.order_lines ol
  JOIN app.orders o ON o.id = ol.order_id
  LEFT JOIN LATERAL (
        SELECT SUM(x.qty) AS qty FROM (
            SELECT sil.qty FROM app.sales_invoice_lines sil
              JOIN app.sales_invoices si ON si.id = sil.invoice_id
             WHERE sil.order_line_id = ol.id AND si.status = 'approved' AND si.invoice_type = 'sale' AND NOT sil.is_deleted
            UNION ALL
            SELECT pil.qty FROM app.purchase_invoice_lines pil
              JOIN app.purchase_invoices pv ON pv.id = pil.invoice_id
             WHERE pil.order_line_id = ol.id AND pv.status = 'approved' AND pv.invoice_type = 'purchase' AND NOT pil.is_deleted
        ) x) f ON true
 WHERE o.status = 'open' AND NOT o.is_deleted AND NOT ol.is_deleted;

CREATE VIEW app.v_product_availability AS
SELECT p.id AS product_id, p.code, p.name,
       COALESCE(oh.q, 0)                       AS qty_on_hand,
       COALESCE(rs.q, 0)                       AS qty_reserved,
       COALESCE(oh.q, 0) - COALESCE(rs.q, 0)   AS qty_available,
       COALESCE(inc.q, 0)                      AS qty_incoming
  FROM app.products p
  LEFT JOIN (SELECT product_id, SUM(qty_on_hand) q FROM app.v_stock_on_hand GROUP BY product_id) oh ON oh.product_id = p.id
  LEFT JOIN (SELECT product_id, SUM(qty_remaining) q FROM app.v_order_line_progress WHERE order_type = 'sales' GROUP BY product_id) rs ON rs.product_id = p.id
  LEFT JOIN (SELECT product_id, SUM(qty_remaining) q FROM app.v_order_line_progress WHERE order_type = 'purchase' GROUP BY product_id) inc ON inc.product_id = p.id
 WHERE p.kind = 'goods' AND NOT p.is_deleted;

CREATE VIEW app.v_sales_invoice_balances AS
SELECT si.id AS invoice_id, si.invoice_no, si.party_id, si.net_total,
       COALESCE(a.paid, 0) AS paid,
       si.net_total - COALESCE(a.paid, 0) AS remaining,
       CASE WHEN si.status = 'cancelled' THEN 'cancelled'
            WHEN si.status = 'draft' THEN 'draft'
            WHEN COALESCE(a.paid, 0) = 0 THEN 'unpaid'
            WHEN COALESCE(a.paid, 0) >= si.net_total THEN 'paid'
            ELSE 'partial' END AS payment_status
  FROM app.sales_invoices si
  LEFT JOIN (SELECT pa.sales_invoice_id, SUM(pa.amount) AS paid
               FROM app.payment_allocations pa JOIN app.payments py ON py.id = pa.payment_id
              WHERE py.status = 'approved' AND NOT pa.is_deleted
              GROUP BY pa.sales_invoice_id) a ON a.sales_invoice_id = si.id
 WHERE si.invoice_type = 'sale' AND NOT si.is_deleted;

CREATE VIEW app.v_purchase_invoice_balances AS
SELECT pv.id AS invoice_id, pv.invoice_no, pv.party_id, pv.net_total,
       COALESCE(a.paid, 0) AS paid,
       pv.net_total - COALESCE(a.paid, 0) AS remaining
  FROM app.purchase_invoices pv
  LEFT JOIN (SELECT pa.purchase_invoice_id, SUM(pa.amount) AS paid
               FROM app.payment_allocations pa JOIN app.payments py ON py.id = pa.payment_id
              WHERE py.status = 'approved' AND NOT pa.is_deleted
              GROUP BY pa.purchase_invoice_id) a ON a.purchase_invoice_id = pv.id
 WHERE pv.invoice_type = 'purchase' AND pv.status = 'approved' AND NOT pv.is_deleted;

CREATE VIEW app.v_posted_lines AS
SELECT jl.*, je.entry_no, je.entry_date, je.description AS entry_description,
       a.code AS account_code, a.system_role
  FROM app.journal_lines jl
  JOIN app.journal_entries je ON je.id = jl.entry_id AND je.status = 'posted' AND NOT je.is_deleted
  JOIN app.accounts a ON a.id = jl.account_id
 WHERE NOT jl.is_deleted;

-- Customer balance = debit - credit on 'receivable'; supplier = credit - debit on 'payable'.
CREATE VIEW app.v_party_balances AS
SELECT p.id AS party_id, p.name, p.is_customer, p.is_supplier,
       COALESCE(SUM(v.debit - v.credit) FILTER (WHERE v.system_role = 'receivable'), 0) AS receivable_balance,
       COALESCE(SUM(v.credit - v.debit) FILTER (WHERE v.system_role = 'payable'), 0)    AS payable_balance
  FROM app.parties p
  LEFT JOIN app.v_posted_lines v ON v.party_id = p.id
 WHERE NOT p.is_deleted
 GROUP BY p.id, p.name, p.is_customer, p.is_supplier;

CREATE VIEW app.v_party_statement AS
SELECT v.party_id, v.entry_date, v.entry_no, v.entry_description, v.description, v.debit, v.credit, v.system_role,
       SUM(CASE WHEN v.system_role = 'receivable' THEN v.debit - v.credit ELSE v.credit - v.debit END)
         OVER (PARTITION BY v.party_id, v.system_role ORDER BY v.entry_date, v.entry_no, v.line_no) AS running_balance
  FROM app.v_posted_lines v
 WHERE v.party_id IS NOT NULL AND v.system_role IN ('receivable','payable');

CREATE VIEW app.v_trial_balance AS
SELECT a.code, a.name_ar, a.account_type,
       COALESCE(SUM(v.debit), 0)  AS total_debit,
       COALESCE(SUM(v.credit), 0) AS total_credit,
       COALESCE(SUM(v.debit - v.credit), 0) AS net_balance
  FROM app.accounts a
  LEFT JOIN app.v_posted_lines v ON v.account_id = a.id
 WHERE NOT a.is_deleted
 GROUP BY a.code, a.name_ar, a.account_type;

CREATE VIEW app.v_driver_outstanding AS
SELECT sh.id AS shipment_id, sh.shipment_no, sh.driver_id, sh.invoice_id, sh.departed_at, b.remaining
  FROM app.shipments sh
  JOIN app.v_sales_invoice_balances b ON b.invoice_id = sh.invoice_id
 WHERE sh.status <> 'cancelled' AND NOT sh.is_deleted AND b.remaining > 0;

CREATE VIEW app.v_equipment_expense_by_month AS
SELECT e.id AS equipment_id, e.name, date_trunc('month', x.expense_date)::date AS month, SUM(x.amount) AS total
  FROM app.equipment_expenses x JOIN app.equipment e ON e.id = x.equipment_id
 WHERE NOT x.is_deleted
 GROUP BY e.id, e.name, date_trunc('month', x.expense_date);

-- ======================= PART C : SYSTEM REFERENCE DATA =======================
INSERT INTO app.installation DEFAULT VALUES;

INSERT INTO app.roles (code, name_ar, description, is_system) VALUES
    ('admin',      'المدير',  'Full authority; the only role that can grant edits of approved records', true),
    ('accountant', 'محاسب',   'Daily operations; cannot edit/delete approved records or change settings', true);

INSERT INTO app.permissions (code, module, action)
SELECT m.module || '.' || a.action, m.module, a.action
  FROM (VALUES ('customers'),('suppliers'),('products'),('inventory'),('orders'),('sales'),('purchases'),
               ('payments'),('shipments'),('treasury'),('expenses'),('employees'),('assets'),
               ('accounting'),('reports'),('settings'),('users')) AS m(module)
 CROSS JOIN (VALUES ('view'),('create'),('update')) AS a(action);

INSERT INTO app.permissions (code, module, action) VALUES
    ('sales.approve','sales','approve'), ('purchases.approve','purchases','approve'),
    ('payments.approve','payments','approve'), ('expenses.approve','expenses','approve'),
    ('inventory.approve','inventory','approve'), ('accounting.post','accounting','post'),
    ('records.edit_approved','records','edit_approved'), ('approvals.grant','approvals','grant'),
    ('periods.close','accounting','close_period'), ('backup.manage','backup','manage'),
    ('audit.view','audit','view'), ('reports.export','reports','export');

INSERT INTO app.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM app.roles r CROSS JOIN app.permissions p WHERE r.code = 'admin';

-- Accountant: operational work only (assumption A-9 in agent.md -- confirm with the owner).
INSERT INTO app.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM app.roles r JOIN app.permissions p ON p.code = ANY (ARRAY[
    'customers.view','customers.create','customers.update',
    'suppliers.view','suppliers.create','suppliers.update',
    'products.view','inventory.view',
    'orders.view','orders.create','orders.update',
    'sales.view','sales.create','sales.update','sales.approve',
    'purchases.view','purchases.create','purchases.update','purchases.approve',
    'payments.view','payments.create','payments.update','payments.approve',
    'shipments.view','shipments.create','shipments.update',
    'treasury.view','expenses.view','expenses.create','expenses.approve',
    'employees.view','reports.view'])
 WHERE r.code = 'accountant';

-- Numbering: A#### and B#### are taken from the workbook invoice templates; the rest are PROPOSALS.
INSERT INTO app.document_sequences (doc_type, prefix, width, next_value, origin_note) VALUES
    ('sales_invoice',    'A', 4, 1, 'from workbook template فاتوره (e.g. A0006). Set next_value to continue the paper series.'),
    ('purchase_invoice', 'B', 4, 1, 'from workbook template فاتورة اذن استلام (e.g. B0011). Set next_value to continue.'),
    ('payment_in',       'RC', 5, 1, 'proposal'),
    ('payment_out',      'PM', 5, 1, 'proposal'),
    ('order_sales',      'SO', 5, 1, 'proposal'),
    ('order_purchase',   'PO', 5, 1, 'proposal'),
    ('shipment',         'SH', 5, 1, 'proposal'),
    ('stock_transfer',   'TR', 5, 1, 'proposal'),
    ('expense',          'EX', 5, 1, 'proposal'),
    ('journal_entry',    'JE', 6, 1, 'proposal');

-- TEMPLATE chart of accounts (data_origin = system_seed). The workbook has NO accounting.
-- An accountant must review/approve this before go-live (open question Q-7).
INSERT INTO app.accounts (code, name_ar, account_type, system_role, is_system, data_origin) VALUES
    ('1010','الصندوق','asset','cash',true,'system_seed'),
    ('1020','البنوك','asset','bank',true,'system_seed'),
    ('1100','العملاء','asset','receivable',true,'system_seed'),
    ('1150','سلف الموظفين','asset','employee_advances',true,'system_seed'),
    ('1200','المخزون','asset','inventory',true,'system_seed'),
    ('1500','الأصول الثابتة','asset','fixed_assets',true,'system_seed'),
    ('1590','مجمع الإهلاك','asset','accumulated_depreciation',true,'system_seed'),
    ('2100','الموردون','liability','payable',true,'system_seed'),
    ('2200','مستحقات الموظفين','liability','payroll_payable',true,'system_seed'),
    ('3000','رأس المال','equity','capital',true,'system_seed'),
    ('3900','أرصدة افتتاحية','equity','opening_balance',true,'system_seed'),
    ('4000','إيرادات المبيعات','revenue','sales_revenue',true,'system_seed'),
    ('4100','مرتجعات المبيعات','revenue','sales_returns',true,'system_seed'),
    ('4200','إيراد المشال والتحميل','revenue','handling_revenue',true,'system_seed'),
    ('5000','تكلفة البضاعة المباعة','expense','cogs',true,'system_seed'),
    ('5100','أجور العاملين','expense','wages',true,'system_seed'),
    ('5200','مصروفات المعدات والسيارات','expense','equipment_expense',true,'system_seed'),
    ('5300','مصروفات إدارية وتشغيلية','expense','general_expense',true,'system_seed'),
    ('5400','مصروف الإهلاك','expense','depreciation_expense',true,'system_seed'),
    ('5900','فروق الجرد والتسويات','expense','stock_adjustment',true,'system_seed');

INSERT INTO app.schema_migrations (version, checksum) VALUES ('0001_initial', NULL);

-- ===================== PART D : REAL DATA FROM THE WORKBOOK =====================
-- Source: يوميه.xlsx, sheet "الاعدادات" (settings) and the invoice letterhead.
-- All rows below are REAL values copied from the workbook (data_origin = 'excel_import').
-- Spelling is preserved exactly so that the future importer can match names.
-- Not included here on purpose (loaded later by the importer, after review):
--   customers, suppliers, transactions, employees (conflicting daily rates, see agent.md A-6).
-- Note: a workbook price of 0 is stored as 0 (probable meaning "no price set", see A-2).

INSERT INTO app.company_profile (name_ar, name_en, tagline, address, phones) VALUES ('شركة الرضا للتوريدات','AL REDA SUPPLIES CO.','مواد البناء و التوريدات العامه','شارع عشماوي كرداسه','محمد : 01030343576 / ابراهيم : 01008681338 / المكتب : 01063794169');

INSERT INTO app.units (name) VALUES
    ('م³'),
    ('طن'),
    ('شكاره'),
    ('الف طوبه'),
    ('القطعه');

INSERT INTO app.products (code, name, kind, unit_id, default_sale_price, data_origin) VALUES
    ('A01', 'زلطة فولي ابيض', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 430, 'excel_import'),
    ('A02', 'زلطة فولي اسود', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 680, 'excel_import'),
    ('A03', 'زلطة مخلوطي', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 450, 'excel_import'),
    ('A04', 'زلطه احلال', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 0, 'excel_import'),
    ('A05', 'سن اثنين', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 450, 'excel_import'),
    ('B01', 'رملة مهزوزة', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 230, 'excel_import'),
    ('B02', 'رديم', 'goods', (SELECT id FROM app.units WHERE name = 'م³'), 100, 'excel_import'),
    ('C01', 'اسمنت السهم 42', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 4100, 'excel_import'),
    ('C02', 'اسمنت السهم 52', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 0, 'excel_import'),
    ('C03', 'اسمنت سويتر', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 4100, 'excel_import'),
    ('C04', 'اسمنت عمران', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 0, 'excel_import'),
    ('C05', 'اسمنت وادي النيل', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 0, 'excel_import'),
    ('C06', 'اسمنت القرنك', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 0, 'excel_import'),
    ('C07', 'اسمنت الفهد', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 0, 'excel_import'),
    ('D01', 'جبس سيناء', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 3300, 'excel_import'),
    ('D02', 'جبس القوميه', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 2800, 'excel_import'),
    ('E01', 'اسمنت الفيروز', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 0, 'excel_import'),
    ('E02', 'اسمنت ابيض التاج', 'goods', (SELECT id FROM app.units WHERE name = 'طن'), 4500, 'excel_import'),
    ('F01', 'بودره', 'goods', (SELECT id FROM app.units WHERE name = 'شكاره'), 0, 'excel_import'),
    ('G01', 'طوب احمر 20سم دوبل', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('G02', 'طوب احمر 24سم دوبل', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('G03', 'طوب احمر فرداني', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('H01', 'طوب مسمط الي', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('H02', 'طوب مسمط نصف الي', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('I01', 'طوب بطاريه', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('I02', 'بلوك ابيض', 'goods', (SELECT id FROM app.units WHERE name = 'الف طوبه'), 0, 'excel_import'),
    ('J01', 'عتب 80سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J02', 'عتب 100سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J03', 'عتب 120سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J04', 'عتب 140سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J05', 'عتب 150سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J06', 'عتب 160سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J07', 'عتب 170سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J08', 'عتب 180سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J09', 'عتب 190سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J10', 'عتب 200سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J11', 'عتب 210سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J12', 'عتب 220سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J13', 'عتب 230سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J14', 'عتب 240سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J15', 'عتب 250سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import'),
    ('J16', 'عتب 260سم', 'goods', (SELECT id FROM app.units WHERE name = 'القطعه'), 0, 'excel_import');

-- Services listed in settings (no code, unit or price in the workbook)
INSERT INTO app.products (name, kind, default_sale_price, data_origin) VALUES
    ('نقل مخلفات', 'service', NULL, 'excel_import'),
    ('لودر كبير', 'service', NULL, 'excel_import'),
    ('لودر صغير', 'service', NULL, 'excel_import'),
    ('حفاره', 'service', NULL, 'excel_import');

INSERT INTO app.equipment (code, name, kind, vehicle_description, plate_no, data_origin) VALUES
    ('M01', 'لودر كبير', 'loader', NULL, NULL, 'excel_import'),
    ('M02', 'لودر صغير', 'loader', NULL, NULL, 'excel_import'),
    ('M03', 'عربه 12 م', 'vehicle', 'صفراء', NULL, 'excel_import'),
    ('M04', 'عربه 4 م', 'vehicle', 'زرقاء', NULL, 'excel_import'),
    ('M05', 'عربه 3م مازدا', 'vehicle', 'مازدا بيضاء', NULL, 'excel_import'),
    ('M06', 'عربه 3م دهاتسو', 'vehicle', 'حمراء دهاتسو', NULL, 'excel_import'),
    ('M07', 'عربه 3م جامبو', 'vehicle', 'حمراء جديده جامبو', NULL, 'excel_import');

COMMIT;
