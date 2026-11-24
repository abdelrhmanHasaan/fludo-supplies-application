-- Migration 0004: FigJam Overhaul Schema Update for Fludo Supplies ERP
-- Covers: Activity/Delivery Locations (branches vs party places), Line Mode (reserve vs on_account),
-- Invoice Prints History, Cash Movements (Manual Deposit / Withdraw),
-- Party Alarms Countdown View (v_party_alarms),
-- Comprehensive Reservation Lines Progress View (v_reservation_lines),
-- Enhanced 10-Metric Dashboard View (v_dashboard_metrics with premises & equipment expenses),
-- and Unified Hierarchical Party Activity View with activity groups (goods, payment, reservation, invoice_print).

BEGIN;
SET session_replication_role = 'replica';

-- ------------------------------------------------------------------------------------------------
-- 1. Locations for Delivery and Receipt (Branches vs Customer/Party Place)
-- ------------------------------------------------------------------------------------------------
ALTER TABLE app.sales_invoices ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE app.sales_invoices ADD COLUMN IF NOT EXISTS location_type text DEFAULT 'site' CHECK (location_type IN ('site', 'party_place'));
ALTER TABLE app.sales_invoices ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES app.branches(id);
ALTER TABLE app.sales_invoices ADD COLUMN IF NOT EXISTS place_party_id uuid REFERENCES app.parties(id);

-- Ensure site_id backfilled from branch_id if empty
UPDATE app.sales_invoices SET site_id = branch_id WHERE site_id IS NULL AND branch_id IS NOT NULL;

ALTER TABLE app.purchase_invoices ALTER COLUMN branch_id DROP NOT NULL;
ALTER TABLE app.purchase_invoices ADD COLUMN IF NOT EXISTS location_type text DEFAULT 'site' CHECK (location_type IN ('site', 'party_place'));
ALTER TABLE app.purchase_invoices ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES app.branches(id);
ALTER TABLE app.purchase_invoices ADD COLUMN IF NOT EXISTS place_party_id uuid REFERENCES app.parties(id);

UPDATE app.purchase_invoices SET site_id = branch_id WHERE site_id IS NULL AND branch_id IS NOT NULL;

-- Line Mode on sales and purchase invoice lines ('on_account' or 'reserve')
ALTER TABLE app.sales_invoice_lines ADD COLUMN IF NOT EXISTS line_mode text DEFAULT 'on_account' CHECK (line_mode IN ('reserve', 'on_account'));
ALTER TABLE app.purchase_invoice_lines ADD COLUMN IF NOT EXISTS line_mode text DEFAULT 'on_account' CHECK (line_mode IN ('reserve', 'on_account'));


-- ------------------------------------------------------------------------------------------------
-- 2. Invoice Prints History (Plain vs With Carried Balance Snapshot)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.invoice_prints (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL DEFAULT app.current_tenant_id(),
    invoice_id              uuid NOT NULL,
    invoice_kind            text NOT NULL DEFAULT 'sale' CHECK (invoice_kind IN ('sale', 'purchase')),
    printed_at              timestamptz NOT NULL DEFAULT now(),
    printed_by              uuid REFERENCES app.users(id),
    mode                    text NOT NULL DEFAULT 'plain' CHECK (mode IN ('plain', 'with_carry')),
    carried_balance_snapshot numeric(16,2) NOT NULL DEFAULT 0,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    row_version             integer NOT NULL DEFAULT 1,
    is_deleted              boolean NOT NULL DEFAULT false,
    deleted_at              timestamptz
);

DROP TRIGGER IF EXISTS trg_invoice_prints_sync ON app.invoice_prints;
CREATE TRIGGER trg_invoice_prints_sync
AFTER INSERT OR UPDATE OR DELETE ON app.invoice_prints
FOR EACH ROW EXECUTE FUNCTION app.trg_outbox();


-- ------------------------------------------------------------------------------------------------
-- 3. Cash Movements (Manual Deposit / Withdrawal for Treasury)
-- ------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.cash_movements (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               uuid NOT NULL DEFAULT app.current_tenant_id(),
    cash_account_id         uuid NOT NULL REFERENCES app.cash_accounts(id),
    direction               text NOT NULL CHECK (direction IN ('in', 'out')),
    amount                  numeric(16,2) NOT NULL CHECK (amount > 0),
    note                    text,
    movement_date           date NOT NULL DEFAULT CURRENT_DATE,
    journal_entry_id        uuid REFERENCES app.journal_entries(id),
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    row_version             integer NOT NULL DEFAULT 1,
    is_deleted              boolean NOT NULL DEFAULT false,
    deleted_at              timestamptz
);

DROP TRIGGER IF EXISTS trg_cash_movements_sync ON app.cash_movements;
CREATE TRIGGER trg_cash_movements_sync
AFTER INSERT OR UPDATE OR DELETE ON app.cash_movements
FOR EACH ROW EXECUTE FUNCTION app.trg_outbox();


-- ------------------------------------------------------------------------------------------------
-- 4. Party Alarms View (Due Date Countdown and Outstanding Balance)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_party_alarms AS
SELECT 
    s.party_id,
    s.party_name,
    s.party_code,
    s.party_phone,
    s.is_customer,
    s.is_supplier,
    p.settlement_due_date,
    (p.settlement_due_date - CURRENT_DATE)::integer AS countdown_days,
    s.net_balance,
    s.balance_type,
    p.notes AS party_notes
FROM app.v_party_summary s
JOIN app.parties p ON p.id = s.party_id
WHERE p.settlement_due_date IS NOT NULL
  AND p.settlement_due_date <= CURRENT_DATE
  AND (
      (s.is_customer AND s.net_balance > 0) OR
      (s.is_supplier AND s.net_balance < 0)
  )
  AND NOT p.is_deleted;


-- ------------------------------------------------------------------------------------------------
-- 5. Comprehensive Reservation Lines View (v_reservation_lines)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_reservation_lines AS
WITH order_payments AS (
    SELECT 
        order_id, 
        COALESCE(SUM(amount), 0) AS total_order_paid
    FROM app.payments
    WHERE order_id IS NOT NULL AND status = 'approved' AND NOT is_deleted
    GROUP BY order_id
),
order_totals AS (
    SELECT 
        order_id,
        COALESCE(SUM(line_total), 0) AS total_order_lines
    FROM app.order_lines
    WHERE NOT is_deleted
    GROUP BY order_id
),
line_fulfillment AS (
    SELECT 
        sil.order_line_id,
        COALESCE(SUM(sil.qty), 0) AS qty_delivered
    FROM app.sales_invoice_lines sil
    JOIN app.sales_invoices si ON si.id = sil.invoice_id
    WHERE sil.order_line_id IS NOT NULL AND si.status = 'approved' AND NOT sil.is_deleted AND NOT si.is_deleted
    GROUP BY sil.order_line_id
)
SELECT 
    o.party_id,
    o.id AS order_id,
    o.order_no,
    o.order_type,
    ol.id AS order_line_id,
    ol.line_no,
    p.id AS product_id,
    p.name AS product,
    COALESCE(p.code, '') AS code,
    COALESCE(ol.unit_name, p.unit_name, '') AS unit_name,
    ol.qty_ordered,
    ol.unit_price,
    ol.line_total,
    -- Proportionally allocated paid amount across order lines
    ROUND(
        CASE 
            WHEN COALESCE(ot.total_order_lines, 0) > 0 THEN
                COALESCE(op.total_order_paid, 0) * (ol.line_total / ot.total_order_lines)
            ELSE 0
        END, 2
    ) AS paid_allocated,
    -- Remaining price to be paid for this line
    GREATEST(
        ol.line_total - ROUND(
            CASE 
                WHEN COALESCE(ot.total_order_lines, 0) > 0 THEN
                    COALESCE(op.total_order_paid, 0) * (ol.line_total / ot.total_order_lines)
                ELSE 0
            END, 2
        ), 0
    ) AS price_remaining,
    -- Quantity delivered so far
    COALESCE(lf.qty_delivered, 0) AS qty_delivered,
    -- Remaining quantity to be delivered
    GREATEST(ol.qty_ordered - COALESCE(lf.qty_delivered, 0), 0) AS qty_remaining,
    ol.created_at
FROM app.order_lines ol
JOIN app.orders o ON o.id = ol.order_id
JOIN app.products p ON p.id = ol.product_id
LEFT JOIN order_totals ot ON ot.order_id = o.id
LEFT JOIN order_payments op ON op.order_id = o.id
LEFT JOIN line_fulfillment lf ON lf.order_line_id = ol.id
WHERE NOT ol.is_deleted AND NOT o.is_deleted;


-- ------------------------------------------------------------------------------------------------
-- 6. Unified Hierarchical Party Activity View (v_party_activity)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_party_activity AS
WITH raw_events AS (
    -- 1. Sales Invoices (goods delivery / sales)
    SELECT
        si.party_id,
        si.invoice_date::timestamp with time zone AS occurred_at,
        CASE
            WHEN si.invoice_type = 'return' THEN 'sale_return'
            ELSE 'sale'
        END AS activity_type,
        'goods' AS activity_group,
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

    -- 2. Purchase Invoices (goods received / purchases)
    SELECT
        pi.party_id,
        pi.invoice_date::timestamp with time zone AS occurred_at,
        CASE
            WHEN pi.invoice_type = 'return' THEN 'purchase_return'
            ELSE 'purchase'
        END AS activity_type,
        'goods' AS activity_group,
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

    -- 3. Payments (Saddad / Tahseel)
    SELECT
        p.party_id,
        p.payment_date::timestamp with time zone AS occurred_at,
        CASE
            WHEN p.direction = 'in' THEN 'payment_in'
            ELSE 'payment_out'
        END AS activity_type,
        'payment' AS activity_group,
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

    -- 4. Reservations (Hajz from Open Orders)
    SELECT
        o.party_id,
        o.order_date::timestamp with time zone AS occurred_at,
        'reservation' AS activity_type,
        'reservation' AS activity_group,
        o.id AS document_id,
        o.order_no AS document_no,
        'طلب حجز ' || o.order_no || COALESCE(' - ' || o.notes, '') AS description,
        0 AS amount_debit,
        0 AS amount_credit,
        0 AS type_order,
        NULL::uuid AS cash_account_id
    FROM app.orders o
    WHERE o.status = 'open' AND NOT o.is_deleted

    UNION ALL

    -- 5. Invoice Prints (Tab'a)
    SELECT
        si.party_id,
        ip.printed_at AS occurred_at,
        'invoice_print' AS activity_type,
        'invoice_print' AS activity_group,
        ip.id AS document_id,
        si.invoice_no AS document_no,
        'طباعة فاتورة ' || si.invoice_no || (CASE WHEN ip.mode = 'with_carry' THEN ' (مع الترحيل)' ELSE '' END) AS description,
        0 AS amount_debit,
        0 AS amount_credit,
        3 AS type_order,
        NULL::uuid AS cash_account_id
    FROM app.invoice_prints ip
    JOIN app.sales_invoices si ON si.id = ip.invoice_id
    WHERE ip.invoice_kind = 'sale' AND NOT ip.is_deleted
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
    ) AS running_balance,
    activity_group
FROM raw_events;


-- ------------------------------------------------------------------------------------------------
-- 7. Enhanced 10-Metric Dashboard View (v_dashboard_metrics)
-- ------------------------------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.v_dashboard_metrics AS
SELECT
    -- 1. الفلوس اللي لينا: إجمالي مديونيات العملاء
    COALESCE((
        SELECT SUM(net_balance)
        FROM app.v_party_summary
        WHERE is_customer = true AND net_balance > 0
    ), 0) AS total_receivables,

    -- 2. الفلوس اللي علينا: إجمالي مستحقات الموردين
    COALESCE((
        SELECT SUM(abs(net_balance))
        FROM app.v_party_summary
        WHERE is_supplier = true AND net_balance < 0
    ), 0) AS total_payables,

    -- 3. إجمالي السيولة الحالية: كل الخزائن والمحافظ والحسابات البنكية (شاملة حركات النقدية اليدوية والتحويلات)
    COALESCE((
        SELECT SUM(
            ca.opening_balance +
            COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'in' AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.payments WHERE cash_account_id = ca.id AND direction = 'out' AND status = 'approved' AND NOT is_deleted), 0) +
            COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'in' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.cash_movements WHERE cash_account_id = ca.id AND direction = 'out' AND NOT is_deleted), 0) +
            COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE to_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.cash_transfers WHERE from_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.expenses WHERE cash_account_id = ca.id AND status = 'approved' AND NOT is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.equipment_expenses ee JOIN app.equipment eq ON eq.id = ee.equipment_id WHERE NOT ee.is_deleted), 0) -
            COALESCE((SELECT SUM(amount) FROM app.employee_transactions WHERE cash_account_id = ca.id AND tx_type = 'advance' AND NOT is_deleted), 0)
        )
        FROM app.cash_accounts ca
        WHERE ca.is_active = true AND NOT ca.is_deleted
    ), 0) AS current_liquidity,

    -- 4. مبيعات الشهر الحالي
    COALESCE((
        SELECT SUM(net_total)
        FROM app.sales_invoices
        WHERE status = 'approved'
          AND invoice_type = 'sale'
          AND NOT is_deleted
          AND invoice_date >= date_trunc('month', CURRENT_DATE)::date
          AND invoice_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0) AS current_month_sales,

    -- 5. مبيعات اليوم
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
    ), 0) AS active_employees_count,

    -- 9. مصاريف المكان لهذا الشهر: المصروفات العامة والنثرية + سلف ومصروفات الموظفين
    COALESCE((
        SELECT SUM(amount)
        FROM app.expenses
        WHERE status = 'approved'
          AND NOT is_deleted
          AND expense_date >= date_trunc('month', CURRENT_DATE)::date
          AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0) +
    COALESCE((
        SELECT SUM(amount)
        FROM app.employee_transactions
        WHERE NOT is_deleted
          AND tx_type IN ('advance', 'salary')
          AND tx_date >= date_trunc('month', CURRENT_DATE)::date
          AND tx_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0) AS current_month_premises_expenses,

    -- 10. مصاريف المعدات لهذا الشهر: مصروفات تشغيل وصيانة ووقود المعدات
    COALESCE((
        SELECT SUM(amount)
        FROM app.equipment_expenses
        WHERE NOT is_deleted
          AND expense_date >= date_trunc('month', CURRENT_DATE)::date
          AND expense_date < (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date
    ), 0) AS current_month_equipment_expenses;


-- ------------------------------------------------------------------------------------------------
-- Record Migration
-- ------------------------------------------------------------------------------------------------
INSERT INTO app.schema_migrations (version, checksum)
VALUES ('0004_figjam_overhaul', md5('0004_figjam_overhaul'))
ON CONFLICT (version) DO NOTHING;

SET session_replication_role = 'origin';
COMMIT;
