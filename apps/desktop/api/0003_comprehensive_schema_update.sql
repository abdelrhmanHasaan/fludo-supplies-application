-- Migration 0003: Comprehensive Schema Update for Fludo Supplies ERP
-- Covers: Free-text Units, Line/Header Discounts, Shipments Destination,
-- Auto-sequences (P0001, C0001, S0001, E0001), Multi-type Empty-start Cash Accounts,
-- Employee Transaction Reasons & Attendance Statuses, and Unified Party Activity/Summary Views.

BEGIN;

-- ------------------------------------------------------------------------------------------------
-- 1. Free-Text Units & Autocomplete
-- ------------------------------------------------------------------------------------------------
ALTER TABLE app.products ADD COLUMN IF NOT EXISTS unit_name text;
ALTER TABLE app.sales_invoice_lines ADD COLUMN IF NOT EXISTS unit_name text;
ALTER TABLE app.purchase_invoice_lines ADD COLUMN IF NOT EXISTS unit_name text;
ALTER TABLE app.order_lines ADD COLUMN IF NOT EXISTS unit_name text;

-- Drop check constraint requiring unit_id on non-service products
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.constraint_column_usage
        WHERE table_schema = 'app' AND table_name = 'products' AND column_name = 'unit_id'
    ) LOOP
        EXECUTE 'ALTER TABLE app.products DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

ALTER TABLE app.products ALTER COLUMN unit_id DROP NOT NULL;

-- Temporarily bypass guard triggers during migration backfill
SET session_replication_role = replica;

-- Populate existing unit_name values from units table
UPDATE app.products p
SET unit_name = u.name
FROM app.units u
WHERE p.unit_id = u.id AND (p.unit_name IS NULL OR p.unit_name = '');

UPDATE app.sales_invoice_lines l
SET unit_name = u.name
FROM app.units u
WHERE l.unit_id = u.id AND (l.unit_name IS NULL OR l.unit_name = '');

UPDATE app.purchase_invoice_lines l
SET unit_name = u.name
FROM app.units u
WHERE l.unit_id = u.id AND (l.unit_name IS NULL OR l.unit_name = '');

UPDATE app.order_lines l
SET unit_name = p.unit_name
FROM app.products p
WHERE l.product_id = p.id AND (l.unit_name IS NULL OR l.unit_name = '');

SET session_replication_role = DEFAULT;

-- Auto-register new units into app.units for autocomplete suggestions
CREATE OR REPLACE FUNCTION app.trg_auto_register_unit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.unit_name IS NOT NULL AND trim(NEW.unit_name) <> '' THEN
        INSERT INTO app.units (tenant_id, name)
        VALUES (COALESCE(NEW.tenant_id, app.current_tenant_id()), trim(NEW.unit_name))
        ON CONFLICT (tenant_id, name) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unit_auto_product ON app.products;
CREATE TRIGGER trg_unit_auto_product
BEFORE INSERT OR UPDATE OF unit_name ON app.products
FOR EACH ROW EXECUTE FUNCTION app.trg_auto_register_unit();

DROP TRIGGER IF EXISTS trg_unit_auto_sil ON app.sales_invoice_lines;
CREATE TRIGGER trg_unit_auto_sil
BEFORE INSERT OR UPDATE OF unit_name ON app.sales_invoice_lines
FOR EACH ROW EXECUTE FUNCTION app.trg_auto_register_unit();

DROP TRIGGER IF EXISTS trg_unit_auto_pil ON app.purchase_invoice_lines;
CREATE TRIGGER trg_unit_auto_pil
BEFORE INSERT OR UPDATE OF unit_name ON app.purchase_invoice_lines
FOR EACH ROW EXECUTE FUNCTION app.trg_auto_register_unit();

DROP TRIGGER IF EXISTS trg_unit_auto_ol ON app.order_lines;
CREATE TRIGGER trg_unit_auto_ol
BEFORE INSERT OR UPDATE OF unit_name ON app.order_lines
FOR EACH ROW EXECUTE FUNCTION app.trg_auto_register_unit();


-- ------------------------------------------------------------------------------------------------
-- 2. Line & Header Discounts with Database-Level Net Total Calculations
-- ------------------------------------------------------------------------------------------------
-- Add discount_amount to line tables
ALTER TABLE app.sales_invoice_lines ADD COLUMN IF NOT EXISTS discount_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE app.purchase_invoice_lines ADD COLUMN IF NOT EXISTS discount_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

-- Add discount_amount to header tables
ALTER TABLE app.sales_invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE app.purchase_invoices ADD COLUMN IF NOT EXISTS discount_amount numeric(16,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0);

-- Recreate generated columns for sales_invoice_lines
ALTER TABLE app.sales_invoice_lines DROP COLUMN IF EXISTS line_total CASCADE;
ALTER TABLE app.sales_invoice_lines ADD COLUMN line_total numeric(16,2) GENERATED ALWAYS AS (round(qty * unit_price - discount_amount, 2)) STORED;

-- Recreate generated columns for purchase_invoice_lines
ALTER TABLE app.purchase_invoice_lines DROP COLUMN IF EXISTS line_total CASCADE;
ALTER TABLE app.purchase_invoice_lines ADD COLUMN line_total numeric(16,2) GENERATED ALWAYS AS (round(qty * unit_price - discount_amount, 2)) STORED;

-- Recreate generated net totals for sales_invoices (cascading dependent views)
ALTER TABLE app.sales_invoices DROP COLUMN IF EXISTS amount_due_snapshot CASCADE;
ALTER TABLE app.sales_invoices DROP COLUMN IF EXISTS net_total CASCADE;
ALTER TABLE app.sales_invoices ADD COLUMN net_total numeric(16,2) GENERATED ALWAYS AS (round(lines_total + handling_fee - discount_amount, 2)) STORED;
ALTER TABLE app.sales_invoices ADD COLUMN amount_due_snapshot numeric(16,2) GENERATED ALWAYS AS (round(lines_total + handling_fee - discount_amount + previous_balance_snapshot, 2)) STORED;

-- Recreate generated net totals for purchase_invoices (cascading dependent views)
ALTER TABLE app.purchase_invoices DROP COLUMN IF EXISTS amount_due_snapshot CASCADE;
ALTER TABLE app.purchase_invoices DROP COLUMN IF EXISTS net_total CASCADE;
ALTER TABLE app.purchase_invoices ADD COLUMN net_total numeric(16,2) GENERATED ALWAYS AS (round(lines_total + handling_fee - discount_amount, 2)) STORED;
ALTER TABLE app.purchase_invoices ADD COLUMN amount_due_snapshot numeric(16,2) GENERATED ALWAYS AS (round(lines_total + handling_fee - discount_amount + previous_balance_snapshot, 2)) STORED;

-- Recreate dependent views that were cascaded
CREATE OR REPLACE VIEW app.v_sales_invoice_balances AS
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

CREATE OR REPLACE VIEW app.v_purchase_invoice_balances AS
SELECT pv.id AS invoice_id, pv.invoice_no, pv.party_id, pv.net_total,
       COALESCE(a.paid, 0) AS paid,
       pv.net_total - COALESCE(a.paid, 0) AS remaining
  FROM app.purchase_invoices pv
  LEFT JOIN (SELECT pa.purchase_invoice_id, SUM(pa.amount) AS paid
               FROM app.payment_allocations pa JOIN app.payments py ON py.id = pa.payment_id
              WHERE py.status = 'approved' AND NOT pa.is_deleted
              GROUP BY pa.purchase_invoice_id) a ON a.purchase_invoice_id = pv.id
 WHERE pv.invoice_type = 'purchase' AND pv.status = 'approved' AND NOT pv.is_deleted;

CREATE OR REPLACE VIEW app.v_driver_outstanding AS
SELECT sh.id AS shipment_id, sh.shipment_no, sh.driver_id, sh.invoice_id, sh.departed_at, b.remaining
  FROM app.shipments sh
  JOIN app.v_sales_invoice_balances b ON b.invoice_id = sh.invoice_id
 WHERE sh.status <> 'cancelled' AND NOT sh.is_deleted AND b.remaining > 0;


-- ------------------------------------------------------------------------------------------------
-- 3. Shipments Destination
-- ------------------------------------------------------------------------------------------------
ALTER TABLE app.shipments ADD COLUMN IF NOT EXISTS destination text;


-- ------------------------------------------------------------------------------------------------
-- 4. Document Sequences for Product, Customer, Supplier, and Employee
-- ------------------------------------------------------------------------------------------------
INSERT INTO app.document_sequences (doc_type, prefix, width, next_value, origin_note)
VALUES
    ('product',  'P', 4, 1, 'Auto sequence for products: P0001'),
    ('customer', 'C', 4, 1, 'Auto sequence for customers: C0001'),
    ('supplier', 'S', 4, 1, 'Auto sequence for suppliers: S0001'),
    ('employee', 'E', 4, 1, 'Auto sequence for employees: E0001')
ON CONFLICT (tenant_id, doc_type) DO NOTHING;

-- Document sequences alias and triggers
CREATE OR REPLACE FUNCTION app.next_document_no(p_doc_type text)
RETURNS text LANGUAGE sql AS $$
    SELECT app.next_doc_number(p_doc_type);
$$;

-- Auto-code triggers
CREATE OR REPLACE FUNCTION app.trg_product_auto_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS NULL OR trim(NEW.code) = '' THEN
        NEW.code := app.next_doc_number('product');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_p_auto_code ON app.products;
CREATE TRIGGER trg_p_auto_code
BEFORE INSERT ON app.products
FOR EACH ROW EXECUTE FUNCTION app.trg_product_auto_code();

CREATE OR REPLACE FUNCTION app.trg_party_auto_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS NULL OR trim(NEW.code) = '' THEN
        IF NEW.is_customer THEN
            NEW.code := app.next_doc_number('customer');
        ELSIF NEW.is_supplier THEN
            NEW.code := app.next_doc_number('supplier');
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_party_auto_code ON app.parties;
CREATE TRIGGER trg_party_auto_code
BEFORE INSERT ON app.parties
FOR EACH ROW EXECUTE FUNCTION app.trg_party_auto_code();

CREATE OR REPLACE FUNCTION app.trg_employee_auto_code()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.code IS NULL OR trim(NEW.code) = '' THEN
        NEW.code := app.next_doc_number('employee');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_emp_auto_code ON app.employees;
CREATE TRIGGER trg_emp_auto_code
BEFORE INSERT ON app.employees
FOR EACH ROW EXECUTE FUNCTION app.trg_employee_auto_code();


-- ------------------------------------------------------------------------------------------------
-- 5. Multi-Kind Empty-Start Cash Accounts & Transfers
-- ------------------------------------------------------------------------------------------------
DO $$
DECLARE
    r record;
BEGIN
    FOR r IN (
        SELECT constraint_name
        FROM information_schema.check_constraints
        WHERE constraint_name LIKE '%cash_accounts%kind%'
    ) LOOP
        EXECUTE 'ALTER TABLE app.cash_accounts DROP CONSTRAINT IF EXISTS ' || quote_ident(r.constraint_name);
    END LOOP;
END $$;

UPDATE app.cash_accounts SET kind = 'cash' WHERE kind = 'cashbox';
ALTER TABLE app.cash_accounts ADD CONSTRAINT cash_accounts_kind_check CHECK (kind IN ('cash', 'wallet', 'bank', 'other'));
ALTER TABLE app.cash_accounts ADD COLUMN IF NOT EXISTS opening_balance numeric(16,2) NOT NULL DEFAULT 0;
ALTER TABLE app.cash_accounts ALTER COLUMN account_id DROP NOT NULL;

-- Dedicated Cash Transfers Table
CREATE TABLE IF NOT EXISTS app.cash_transfers (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL DEFAULT app.current_tenant_id(),
    transfer_no   text NOT NULL,
    transfer_date date NOT NULL DEFAULT CURRENT_DATE,
    from_account_id uuid NOT NULL REFERENCES app.cash_accounts(id),
    to_account_id   uuid NOT NULL REFERENCES app.cash_accounts(id),
    amount        numeric(16,2) NOT NULL CHECK (amount > 0),
    notes         text,
    status        text NOT NULL DEFAULT 'approved' CHECK (status IN ('draft', 'approved', 'cancelled')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    row_version   integer NOT NULL DEFAULT 1,
    is_deleted    boolean NOT NULL DEFAULT false,
    deleted_at    timestamptz,
    CHECK (from_account_id <> to_account_id)
);

INSERT INTO app.document_sequences (doc_type, prefix, width, next_value, origin_note)
VALUES ('cash_transfer', 'TR', 5, 1, 'Auto sequence for cash transfers')
ON CONFLICT (tenant_id, doc_type) DO NOTHING;


-- ------------------------------------------------------------------------------------------------
-- 6. Employee Transactions Reasons & Explicit Attendance Statuses
-- ------------------------------------------------------------------------------------------------
ALTER TABLE app.employee_transactions ADD COLUMN IF NOT EXISTS reason text;

-- Enforce reason for deduction, advance, bonus
DO $$
BEGIN
    ALTER TABLE app.employee_transactions DROP CONSTRAINT IF EXISTS chk_emp_tx_reason;
    ALTER TABLE app.employee_transactions ADD CONSTRAINT chk_emp_tx_reason
    CHECK (tx_type NOT IN ('advance', 'deduction', 'bonus') OR (reason IS NOT NULL AND trim(reason) <> ''));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- Attendance status
ALTER TABLE app.attendance ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'present';

DO $$
BEGIN
    ALTER TABLE app.attendance DROP CONSTRAINT IF EXISTS chk_attendance_status;
    ALTER TABLE app.attendance ADD CONSTRAINT chk_attendance_status
    CHECK (status IN ('present', 'half', 'absent', 'leave'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

UPDATE app.attendance
SET status = CASE
    WHEN day_fraction >= 1 THEN 'present'
    WHEN day_fraction > 0 THEN 'half'
    ELSE 'absent'
END
WHERE status IS NULL;


-- ------------------------------------------------------------------------------------------------
-- 7. Unified Party Activity View (v_party_activity)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_party_activity AS
WITH raw_events AS (
    -- Sales Invoices (Debit for Customers)
    SELECT
        si.party_id,
        si.invoice_date::timestamp with time zone AS occurred_at,
        CASE
            WHEN si.invoice_type = 'return' THEN 'sale_return'
            ELSE 'sale'
        END AS activity_type,
        si.id AS document_id,
        si.invoice_no AS document_no,
        'فاتورة مبيعات ' || si.invoice_no || COALESCE(' - ' || si.notes, '') AS description,
        CASE WHEN si.invoice_type = 'return' THEN 0 ELSE si.net_total END AS amount_debit,
        CASE WHEN si.invoice_type = 'return' THEN si.net_total ELSE 0 END AS amount_credit,
        1 AS type_order,
        NULL::uuid AS cash_account_id
    FROM app.sales_invoices si
    WHERE si.status = 'approved' AND NOT si.is_deleted

    UNION ALL

    -- Purchase Invoices (Credit for Suppliers)
    SELECT
        pi.party_id,
        pi.invoice_date::timestamp with time zone AS occurred_at,
        CASE
            WHEN pi.invoice_type = 'return' THEN 'purchase_return'
            ELSE 'purchase'
        END AS activity_type,
        pi.id AS document_id,
        pi.invoice_no AS document_no,
        'فاتورة مشتريات ' || pi.invoice_no || COALESCE(' - ' || pi.notes, '') AS description,
        CASE WHEN pi.invoice_type = 'return' THEN pi.net_total ELSE 0 END AS amount_debit,
        CASE WHEN pi.invoice_type = 'return' THEN 0 ELSE pi.net_total END AS amount_credit,
        1 AS type_order,
        NULL::uuid AS cash_account_id
    FROM app.purchase_invoices pi
    WHERE pi.status = 'approved' AND NOT pi.is_deleted

    UNION ALL

    -- Payments (Direction IN = Customer paid us -> Credit; Direction OUT = We paid supplier -> Debit)
    SELECT
        p.party_id,
        p.payment_date::timestamp with time zone AS occurred_at,
        CASE
            WHEN p.direction = 'in' THEN 'payment_in'
            ELSE 'payment_out'
        END AS activity_type,
        p.id AS document_id,
        p.payment_no AS document_no,
        'سند ' || (CASE WHEN p.direction = 'in' THEN 'قبض ' ELSE 'صرف ' END) || p.payment_no || COALESCE(' - ' || p.notes, '') AS description,
        CASE WHEN p.direction = 'out' THEN p.amount ELSE 0 END AS amount_debit,
        CASE WHEN p.direction = 'in' THEN p.amount ELSE 0 END AS amount_credit,
        2 AS type_order,
        p.cash_account_id
    FROM app.payments p
    WHERE p.status = 'approved' AND NOT p.is_deleted

    UNION ALL

    -- Reservations from Open Orders
    SELECT
        o.party_id,
        o.order_date::timestamp with time zone AS occurred_at,
        'reservation' AS activity_type,
        o.id AS document_id,
        o.order_no AS document_no,
        'طلب حجز ' || o.order_no || COALESCE(' - ' || o.notes, '') AS description,
        0 AS amount_debit,
        0 AS amount_credit,
        0 AS type_order,
        NULL::uuid AS cash_account_id
    FROM app.orders o
    WHERE o.status = 'open' AND NOT o.is_deleted
)
SELECT
    party_id,
    occurred_at,
    activity_type,
    document_id,
    document_no,
    description,
    amount_debit,
    amount_credit,
    cash_account_id,
    SUM(amount_debit - amount_credit) OVER (
        PARTITION BY party_id
        ORDER BY occurred_at ASC, type_order ASC, document_id ASC
    ) AS running_balance
FROM raw_events;


-- ------------------------------------------------------------------------------------------------
-- 8. Unified Party Summary View (v_party_summary)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_party_summary AS
SELECT
    p.id AS party_id,
    p.name AS party_name,
    p.code AS party_code,
    p.phone AS party_phone,
    p.is_customer,
    p.is_supplier,
    p.is_active,
    -- Total Purchases
    COALESCE(
        CASE
            WHEN p.is_customer THEN (
                SELECT SUM(si.net_total)
                FROM app.sales_invoices si
                WHERE si.party_id = p.id AND si.status = 'approved' AND si.invoice_type = 'sale' AND NOT si.is_deleted
            )
            ELSE (
                SELECT SUM(pi.net_total)
                FROM app.purchase_invoices pi
                WHERE pi.party_id = p.id AND pi.status = 'approved' AND pi.invoice_type = 'purchase' AND NOT pi.is_deleted
            )
        END, 0
    ) AS total_purchases,
    -- Total Payments
    COALESCE(
        CASE
            WHEN p.is_customer THEN (
                SELECT SUM(pay.amount)
                FROM app.payments pay
                WHERE pay.party_id = p.id AND pay.status = 'approved' AND pay.direction = 'in' AND NOT pay.is_deleted
            )
            ELSE (
                SELECT SUM(pay.amount)
                FROM app.payments pay
                WHERE pay.party_id = p.id AND pay.status = 'approved' AND pay.direction = 'out' AND NOT pay.is_deleted
            )
        END, 0
    ) AS total_payments,
    -- Reserved Undelivered Quantity
    COALESCE((
        SELECT SUM(ol.qty_ordered)
        FROM app.orders o
        JOIN app.order_lines ol ON ol.order_id = o.id
        WHERE o.party_id = p.id AND o.status = 'open' AND NOT o.is_deleted AND NOT ol.is_deleted
    ), 0) AS reserved_undelivered,
    -- Net Balance: For customer, positive = owes us ('عليه'); for supplier, positive = we owe them ('له')
    COALESCE((
        SELECT running_balance
        FROM app.v_party_activity a
        WHERE a.party_id = p.id
        ORDER BY a.occurred_at DESC, a.document_id DESC
        LIMIT 1
    ), 0) AS net_balance,
    -- Balance Type
    CASE
        WHEN p.is_customer THEN
            CASE
                WHEN COALESCE((
                    SELECT running_balance
                    FROM app.v_party_activity a
                    WHERE a.party_id = p.id
                    ORDER BY a.occurred_at DESC, a.document_id DESC
                    LIMIT 1
                ), 0) > 0 THEN 'عليه'
                WHEN COALESCE((
                    SELECT running_balance
                    FROM app.v_party_activity a
                    WHERE a.party_id = p.id
                    ORDER BY a.occurred_at DESC, a.document_id DESC
                    LIMIT 1
                ), 0) < 0 THEN 'له'
                ELSE 'خالص'
            END
        ELSE
            CASE
                WHEN COALESCE((
                    SELECT running_balance
                    FROM app.v_party_activity a
                    WHERE a.party_id = p.id
                    ORDER BY a.occurred_at DESC, a.document_id DESC
                    LIMIT 1
                ), 0) < 0 THEN 'له'
                WHEN COALESCE((
                    SELECT running_balance
                    FROM app.v_party_activity a
                    WHERE a.party_id = p.id
                    ORDER BY a.occurred_at DESC, a.document_id DESC
                    LIMIT 1
                ), 0) > 0 THEN 'عليه'
                ELSE 'خالص'
            END
    END AS balance_type
FROM app.parties p
WHERE NOT p.is_deleted;


-- ------------------------------------------------------------------------------------------------
-- 9. Dashboard 8 Core Metrics View (v_dashboard_metrics)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_dashboard_metrics AS
SELECT
    -- 1. الفلوس اللي لينا: إجمالي مديونيات العملاء (الأرصدة المدينة فقط)
    COALESCE((
        SELECT SUM(net_balance)
        FROM app.v_party_summary
        WHERE is_customer = true AND net_balance > 0
    ), 0) AS total_receivables,

    -- 2. الفلوس اللي علينا: إجمالي مستحقات الموردين (الأرصدة الدائنة فقط)
    COALESCE((
        SELECT SUM(abs(net_balance))
        FROM app.v_party_summary
        WHERE is_supplier = true AND net_balance < 0
    ), 0) AS total_payables,

    -- 3. السيولة النقدية الحالية: مجموع أرصدة كل الخزائن والمحافظ والحسابات البنكية
    COALESCE((
        SELECT SUM(
            ca.opening_balance +
            COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'in' AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'out' AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.expenses WHERE cash_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.employee_transactions WHERE cash_account_id = ca.id AND tx_type = 'advance' AND NOT is_deleted), 0)
        )
        FROM app.cash_accounts ca
        WHERE ca.is_active = true AND NOT ca.is_deleted
    ), 0) AS current_liquidity,

    -- 4. مبيعات الشهر الحالي: فواتير البيع المعتمدة في الشهر الميلادي الحالي (صافي بعد الخصم)
    COALESCE((
        SELECT SUM(net_total)
        FROM app.sales_invoices
        WHERE status = 'approved'
          AND invoice_type = 'sale'
          AND NOT is_deleted
          AND invoice_date >= date_trunc('month', CURRENT_DATE)::date
          AND invoice_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0) AS current_month_sales,

    -- 5. مبيعات اليوم: فواتير البيع المعتمدة اليوم (صافي بعد الخصم)
    COALESCE((
        SELECT SUM(net_total)
        FROM app.sales_invoices
        WHERE status = 'approved'
          AND invoice_type = 'sale'
          AND NOT is_deleted
          AND invoice_date = CURRENT_DATE
    ), 0) AS today_sales,

    -- 6. عدد العملاء النشطين
    COALESCE((
        SELECT COUNT(*)
        FROM app.parties
        WHERE is_customer = true AND is_active = true AND NOT is_deleted
    ), 0) AS active_customers_count,

    -- 7. عدد الموردين النشطين
    COALESCE((
        SELECT COUNT(*)
        FROM app.parties
        WHERE is_supplier = true AND is_active = true AND NOT is_deleted
    ), 0) AS active_suppliers_count,

    -- 8. عدد الموظفين النشطين
    COALESCE((
        SELECT COUNT(*)
        FROM app.employees
        WHERE is_active = true AND NOT is_deleted
    ), 0) AS active_employees_count;


-- ------------------------------------------------------------------------------------------------
-- Record Migration
-- ------------------------------------------------------------------------------------------------
INSERT INTO app.schema_migrations (version, checksum)
VALUES ('0003_comprehensive_schema_update', md5('0003_comprehensive_schema_update'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
