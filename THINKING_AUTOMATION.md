# Fludo ERP — Thinking Automation & Memory Engine

> **Purpose:** This file acts as an active cognitive state engine. If the execution is stopped, paused, or restarted at any point, reading this document instantly restores 100% of the active context, architectural decisions, completed work, and exact next steps.

---

## 1. Current State & Memory Snapshot

* **System Identity:** Antigravity Autonomous Lead Architect & Senior Fullstack Engineer.
* **Current Phase:** All Core Phases & User Customization Milestones 100% COMPLETE & VERIFIED.
* **Active Goal:** Build, test, package, and publish the complete enterprise-grade, offline-first Windows ERP for Building-Materials Yard (Fludo ERP), featuring:
  - 14 full business workflow modules.
  - Dynamic company & admin onboarding wizard (`FirstRunWizard.tsx` & `CompanyContext.tsx`).
  - Revamped executive Main Menu with direct cards and live KPIs.
  - Universal Excel & SQL data portability (tested with both legacy workbook and standard tabular files).
  - Standalone Windows `.exe` setup installer.
  - Remote GitHub synchronization with `https://github.com/abdelrhmanHasaan/fludo-supplies-application.git`.
* **Safety Mandate:** The attached client database `database.sql` is strictly preserved untouched. Isolated PostgreSQL runs on port 5433 with full schema and seed data.
* **Automated UI Testing Results:**
  - Standard Test Suite: 17/17 tests passed with zero errors. All 17 screenshots captured in `tests/screenshots/`.
  - Deep Interaction & Reactivity Test Suite: 7/7 comprehensive multi-step interaction flows passed with zero console and zero HTTP errors (`tests/screenshots_deep/`).
  - Trial balance difference: Strictly `0.00`.
* **Dynamic Company & Onboarding Architecture:**
  - Database: `app.company_profile` stores `name_ar`, `name_en`, `tagline`, `address`, `phones`, `logo_path`.
  - API Routes: `GET /api/company/profile`, `PUT /api/company/profile`, `POST /api/company/setup`.
  - UI Reactivity: `CompanyContext` provides live brand name and auto-computes logo initial (`logoLetter`) from Arabic name, updating Sidebar, Navbar, Invoice prints, Statements, and Reports dynamically.
  - First-Run Wizard: Prompts on initial launch if setup is not marked complete, allowing instant entry of company details, admin credentials, and manager PIN.
* **Data Portability Engine:**
  - Route `/api/data/template/excel` provides a clean 3-sheet starter workbook (`العملاء`, `الموردين`, `المنتجات والأسعار`).
  - Versatile parser in `importer.ts` recognizes both standard header columns and legacy daily workbook block structures.
  - Fixed SQL query in `exporter.ts` (`quantity` column alignment).
* **Packaged Electron Blank Screen Resolution (Step 015):**
  - Resolved Vite `base: './'` relative path issue.
  - Bundled backend production dependencies inside `app.asar`.
  - Deleted `ELECTRON_RUN_AS_NODE` at runtime entry.
* **Security & Credentials (Zero Hardcoded Defaults):**
  - No default credentials or hardcoded passwords exist in codebase or database.
  - Setup Wizard initiates on empty install via `FirstRunWizard.tsx` (`POST /api/auth/setup`).
  - Passwords and 4-digit Manager PIN are securely hashed with Argon2id (64MB memory, 3 iterations, 4 parallelism).

---

## 2. Decision Record & Constraints

1. **Database Isolation Strategy (Port 5433):**
   - The user has an existing PostgreSQL 18 service on port 5432.
   - We must never disturb or modify the client's existing database.
   - We initialize a dedicated database cluster in `./data/pgdata` listening on `127.0.0.1:5433` (matching `agent.md` §6.1).
   - This ensures full isolation, zero port collisions, and reproducible packaging for the client PC installer.

2. **Backend Architecture (`services/api`):**
   - Runtime: Node.js 24 + TypeScript.
   - Framework: Fastify (ultra-fast, typed, modular).
   - Database layer: `pg` pool with pure parameterized SQL queries (no ORM magic, zero SQL injection risk).
   - Financial accuracy: Precise decimal arithmetic (using strings/cents/bignumber) for all currency and quantities; trial balance differences must strictly evaluate to `0.00`.
   - Security: Argon2id password hashing, 4-digit Manager PIN bound to session & record-specific grants with 5-minute expiry, SHA-256 hash-chained immutable audit log.
   - Two-way Data Portability:
     - Excel import: block-aware parsing of `يوميه.xlsx` (26 customer blocks, 9 supplier blocks, settings).
     - Excel export: export any table, statement, invoice, or report using `exceljs`.
     - SQL export: generate clean `.sql` dumps of the schema and data.
     - SQL import: execute verified `.sql` migrations or data restores.

3. **Frontend Architecture (`apps/ui`):**
   - React + Vite + Tailwind CSS with native RTL direction (`dir="rtl"`).
   - Font: Cairo / Tajawal bundled locally for crisp Arabic typography.
   - Complete 14-section workflow matching `details` and `agent.md`:
     1. الرئيسية (Dashboard)
     2. اليومية (Daily Fast Transaction Wizard)
     3. العملاء (Customers & Statements)
     4. الموردين (Suppliers & Payables)
     5. المخزون (Inventory & Stock Availability)
     6. المنتجات والأسعار (Products & Price catalogue)
     7. الفواتير (Invoices & Carried Balances)
     8. الشحنات والسائقين (Shipments & Driver Cash)
     9. الخزينة والبنوك (Treasury & Cash Accounts)
     10. المصروفات (Expenses)
     11. الأصول والمعدات (Equipment & Vehicle Expenses)
     12. الموظفين (Employees, Attendance & Payroll)
     13. التقارير (Reports & Financial Statements)
     14. الإعدادات والصلاحيات (Settings, Security, Backup, Import/Export)

4. **Desktop Integration & Packaging (`apps/desktop` & `installer`):**
   - Electron shell with strict security (`contextIsolation: true`, `nodeIntegration: false`, sandbox).
   - Automatic background lifecycle management for local PostgreSQL (5433) and local Fastify API.
   - Windows `.exe` setup installer built via `electron-builder` and Inno Setup script.

---

## 3. Immediate Execution Plan

1. **Step 1:** Spin up the isolated PostgreSQL cluster on port 5433:
   - Run `initdb` with UTF-8 encoding in `./data/pgdata`.
   - Configure `postgresql.conf` (port = 5433, listen_addresses = '127.0.0.1').
   - Configure `pg_hba.conf` (scram-sha-256 / trust for localhost dev).
   - Start the PostgreSQL server process on port 5433.
2. **Step 2:** Generate versioned migrations and execute schema on port 5433:
   - Create database `fludo_erp`.
   - Apply DDL cleanly and verify all 50 tables, 11 views, and triggers.
3. **Step 3:** Implement the backend services in `services/api`:
   - Fastify server, DB pool, auth, RBAC, PIN approval, audit log with hash chain.
   - Domain modules: Products, Parties, Invoices, Bookings, Stock, Treasury, Payroll, Equipment, Expenses, Reports.
   - Excel Import/Export and SQL Import/Export.
4. **Step 4:** Implement the frontend application in `apps/ui`:
   - Full 14-screen Arabic RTL UI with responsive, accessible, high-performance design.
   - Visual invoice print layouts, customer statement timeline, daily transaction wizard.
5. **Step 5:** Electron desktop packaging & Windows `.exe` setup installer.
6. **Step 6:** Comprehensive automated testing and UI verification on Windows.

---

## 4. Context Resumption Protocol

If stopped or interrupted:
1. Open this file (`THINKING_AUTOMATION.md`) and `AUDIT_LOG_TODO.md`.
2. Check PostgreSQL status on port 5433: `Get-NetTCPConnection -LocalPort 5433`.
3. Check background processes and current files in `services/api` and `apps/ui`.
4. Pick up the next unchecked task in `AUDIT_LOG_TODO.md` and continue autonomously.
