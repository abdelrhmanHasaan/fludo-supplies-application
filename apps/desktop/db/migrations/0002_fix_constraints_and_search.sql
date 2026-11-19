-- Migration 0002: Seed default branch, Arabic normalization function, and Full-Text/Trigram Search
BEGIN;

-- 1. Ensure pg_trgm extension is available
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Seed default MAIN branch if not exists
INSERT INTO app.branches (code, name, address, is_active)
SELECT 'MAIN', 'المقر الرئيسي', 'شارع عشماوي — كرداسة', true
WHERE NOT EXISTS (SELECT 1 FROM app.branches WHERE code = 'MAIN');

-- 3. Associate any unassigned cash accounts to the default branch
UPDATE app.cash_accounts
SET branch_id = (SELECT id FROM app.branches WHERE code = 'MAIN' LIMIT 1)
WHERE branch_id IS NULL;

-- 4. Arabic Text Normalization Function
CREATE OR REPLACE FUNCTION app.normalize_ar(p_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_res text;
BEGIN
    IF p_text IS NULL THEN
        RETURN '';
    END IF;
    v_res := lower(trim(p_text));
    -- Remove tatweel (ـ)
    v_res := regexp_replace(v_res, 'ـ', '', 'g');
    -- Remove diacritics / tashkeel
    v_res := regexp_replace(v_res, '[\u064B-\u065F\u0670]', '', 'g');
    -- Normalize Alef (أ إ آ -> ا)
    v_res := regexp_replace(v_res, '[أإآ]', 'ا', 'g');
    -- Normalize Taa Marbuta (ة -> ه)
    v_res := regexp_replace(v_res, 'ة', 'ه', 'g');
    -- Normalize Yaa (ى -> ي)
    v_res := regexp_replace(v_res, 'ى', 'ي', 'g');
    -- Normalize Arabic-Indic numbers (٠-٩ -> 0-9)
    v_res := translate(v_res, '٠١٢٣٤٥٦٧٨٩', '0123456789');
    RETURN v_res;
END;
$$;

-- 5. Add search_text generated columns and GIN trigram indexes
-- Products
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'products' AND column_name = 'search_text') THEN
        ALTER TABLE app.products ADD COLUMN search_text text GENERATED ALWAYS AS (
            code || ' ' || name || ' ' || app.normalize_ar(name)
        ) STORED;
        CREATE INDEX IF NOT EXISTS ix_products_search_trgm ON app.products USING gin (search_text gin_trgm_ops);
    END IF;
END $$;

-- Parties (Customers & Suppliers)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'parties' AND column_name = 'search_text') THEN
        ALTER TABLE app.parties ADD COLUMN search_text text GENERATED ALWAYS AS (
            name || ' ' || COALESCE(phone, '') || ' ' || app.normalize_ar(name)
        ) STORED;
        CREATE INDEX IF NOT EXISTS ix_parties_search_trgm ON app.parties USING gin (search_text gin_trgm_ops);
    END IF;
END $$;

-- Employees
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'employees' AND column_name = 'search_text') THEN
        ALTER TABLE app.employees ADD COLUMN search_text text GENERATED ALWAYS AS (
            COALESCE(code, '') || ' ' || full_name || ' ' || COALESCE(phone, '') || ' ' || app.normalize_ar(full_name)
        ) STORED;
        CREATE INDEX IF NOT EXISTS ix_employees_search_trgm ON app.employees USING gin (search_text gin_trgm_ops);
    END IF;
END $$;

-- Equipment
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'app' AND table_name = 'equipment' AND column_name = 'search_text') THEN
        ALTER TABLE app.equipment ADD COLUMN search_text text GENERATED ALWAYS AS (
            COALESCE(code, '') || ' ' || name || ' ' || COALESCE(plate_no, '') || ' ' || app.normalize_ar(name)
        ) STORED;
        CREATE INDEX IF NOT EXISTS ix_equipment_search_trgm ON app.equipment USING gin (search_text gin_trgm_ops);
    END IF;
END $$;

-- Record migration in schema_migrations
INSERT INTO app.schema_migrations (version, checksum)
VALUES ('0002_fix_constraints_and_search', md5('0002_fix_constraints_and_search'))
ON CONFLICT (version) DO NOTHING;

COMMIT;
