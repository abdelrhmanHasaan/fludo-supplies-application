# todo.md — Development & Testing Checklist

Legend: `[x]` = done **and evidenced**; `[ ]` = not done. Nothing is checked unless it truly happened.
Current state: documentation produced, workbook analysed, SQL schema written and statically reviewed; **no code, no executed SQL, no installer, no tests exist yet.**

---

## 0. Governance
- [ ] Owner reviews `agent.md`, `security.md`, `tip.md`, `database.sql`, `todo.md` (Stage 7 approval gate)
- [ ] Owner answers open questions Q-1 … Q-12 (agent.md §13.2)
- [ ] Owner confirms/rejects assumptions A-1 … A-10 (agent.md §13.1)
- [ ] Stack decision recorded as ADR-0001
- [ ] Repository created, branching & CI defined

## 1. Workbook analysis
- [x] All 10 sheets inventoried (purpose, size, formulas)
- [x] Settings sheet read: 42 products, 7 employees, 4 services, 7 machines
- [x] Invoice, receipt and statement templates analysed
- [x] Customer ledger structure decoded (26 blocks, row semantics, formulas)
- [x] Supplier ledger structure decoded (9 blocks)
- [x] Employee weekly and monthly sheets decoded
- [x] Equipment sheet decoded
- [x] Totals recomputed from cached values (customers 3,395,835 / 3,284,590; suppliers 1,772,044 / 948,070)
- [x] Defects D-1 … D-13 documented
- [ ] Open Excel in desktop Excel to confirm no hidden names/links/macros beyond what openpyxl exposes (data-validation lists on equipment sheet F9:F26/I9:I26 could not be read: formula source missing)
- [ ] Owner walkthrough of the sheet "الرئيسيه" (empty — confirm nothing was lost)
- [ ] Compare workbook cached values against a fresh recalculation in Excel/LibreOffice

## 2. Requirements validation
- [x] Workbook ↔ `details` gap analysis (agent.md §4)
- [ ] Owner signs the gap list (what is v1 scope vs later)
- [ ] Booking-debt rule decided (Q-1)
- [ ] Costing method decided (Q-8)
- [ ] Branch list, cashboxes, banks and opening stock collected (Q-9)
- [ ] Invoice paper size/format and legal fields confirmed (Q-10)
- [ ] External accountant reviews template chart of accounts (Q-7)
- [ ] Acceptance scenarios from `details` §18 turned into test scripts

## 3. Database implementation
- [x] `database.sql` written (50 tables, 11 views, 15 functions, triggers, seed)
- [x] Static checks: balanced parentheses, no forward FK references
- [ ] **Execute on a fresh PostgreSQL 16** with `ON_ERROR_STOP` and fix errors
- [ ] Split into versioned migrations (`0001_initial`, …) and add `schema_migrations` checksum tooling
- [ ] Create DB roles (`erp_owner`, `erp_app`, `erp_backup`) and grants; revoke `PUBLIC`
- [ ] pgTAP tests: balanced journal, immutable posted entries, closed-period guard
- [ ] pgTAP tests: lock triggers (approved/cancelled), approval validity (expired, wrong record, reuse)
- [ ] pgTAP tests: append-only `stock_movements` and `audit_log`; hash-chain verification function
- [ ] Verify `trg_recalc_lines_total` and header-lock interaction (approval session)
- [ ] Verify outbox triggers produce one row per change with unique idempotency keys
- [ ] Review indexes with realistic data volume (≥ 100 k invoices)
- [ ] Decide on RLS for future server schema (separate central DDL)
- [ ] Part D (workbook reference data) loads cleanly and is optional in the installer

## 4. Backend implementation
- [ ] Project skeleton, config, structured logging with redaction
- [ ] Auth: Argon2id, lockout, sessions, forced password change
- [ ] RBAC middleware, deny-by-default, authorization matrix test
- [ ] Manager approval flow (PIN + session binding, rate limit, `edit_approvals`)
- [ ] Setting of `app.user_id` / `app.edit_approval_id` per transaction
- [ ] Document numbering service (`app.next_doc_number`)
- [ ] Master-data services: products, prices, parties, sections, employees, equipment, branches
- [ ] Orders/bookings service with derived reservation
- [ ] Sales invoice service: draft → approve → cancel; carried-balance snapshot; handling fee; returns
- [ ] Purchase receipt service; returns
- [ ] Payment service with allocations; driver collections
- [ ] Stock service: movements, transfers, adjustments, availability queries
- [ ] Posting engine (journal for every document type) + reversal on edit/cancel
- [ ] Treasury: cash accounts, transfers, cash counts
- [ ] Expenses, equipment expenses
- [ ] Payroll: attendance, advances, deductions, bonuses, debt repayment, weekly/monthly settlement
- [ ] Reports: statements, trial balance, income statement, balance sheet, cash flow, monthly pack
- [ ] Period close with snapshot
- [ ] Audit service + hash-chain verifier
- [ ] Backup/restore service (encrypted, verified)
- [ ] Sync outbox reader and worker skeleton (disabled)
- [ ] Excel importer (staging, validation, review API, load)

## 5. Frontend implementation
- [ ] Electron shell hardening (contextIsolation, sandbox, CSP)
- [ ] RTL design system, fonts bundled, themes
- [ ] Login, lock screen, change password
- [ ] Sidebar + 14 sections routing
- [ ] Dashboard (day/week/month/custom filters)
- [ ] Daily screen with the 17 transaction types
- [ ] Customers: list, search, profile, timeline, statement print
- [ ] Suppliers: list, profile, pending purchases
- [ ] Products & prices with override highlight
- [ ] Inventory per product/branch (physical, reserved, available, incoming)
- [ ] Invoices: shipment invoice + comprehensive statement; print templates
- [ ] Shipments & drivers screen (cash outstanding)
- [ ] Treasury & banks, expenses, assets & equipment
- [ ] Employees: attendance grid, advances, statements
- [ ] Reports & export (PDF/Excel)
- [ ] Settings, users, roles, approvals inbox, audit viewer
- [ ] Importer review UI
- [ ] Accessibility pass, keyboard shortcuts, Arabic error messages

## 6. Business logic verification
- [ ] Line total = qty × price, rounding rules, 2-decimals everywhere
- [ ] Price default pre-fills; override affects that line only; snapshot stored; old invoices unchanged
- [ ] Booking → partial delivery → remaining correct; reservation never reduces physical stock
- [ ] Supplier incoming quantity not counted as stock before receipt
- [ ] Carried balance shown, **not** re-posted; credit balance reduces amount due
- [ ] Payment allocation: partial, over-allocation blocked, to older invoice
- [ ] Customer balance equals Σ posted receivable lines for the party
- [ ] `details` §18 scenario end-to-end (booking 40 t + 100,000 → delivery 15 t → invoice with 2,000 carried → driver cash → statement)
- [ ] Weekly payroll example: 250/day × 20 days − 2,000 − 200 + 300 = 3,100
- [ ] Workbook employee example: opening debt 26,800 − 1,100 = 25,700
- [ ] Equipment totals per machine equal manual sum (fix of D-1 proven with test data)
- [ ] Trial balance difference = 0.00 after every test scenario
- [ ] Reversal of an edited approved invoice restores stock and ledger exactly

## 7. Excel import verification
- [ ] 26 customer blocks detected (25 named + 1 empty); 9 supplier blocks detected
- [ ] 107 customer line items and 25 payment cells imported / accounted for
- [ ] Recomputed totals equal 3,395,835 / 3,284,590 / 1,772,044 / 948,070 (or differences itemised)
- [ ] 55 text dates and suspicious date (supplier row 15) resolved with owner
- [ ] Product-name mapping completed (`سن2`, `زلط`, `اسمن`, …)
- [ ] Duplicate party (معاذ رمضان) merged correctly; netting decision applied (Q-3)
- [ ] Three credit-balance customers handled per Q-11
- [ ] Opening-balance supplier line “مرحل” converted to an opening entry
- [ ] Import is repeatable and idempotent (re-run does not duplicate)

## 8. Security testing (see security.md §11–§12)
- [ ] SAST + dependency audit + secret scan in CI
- [ ] Authorization matrix: every endpoint × role
- [ ] Accountant cannot edit/delete approved items via UI, API **or** direct SQL
- [ ] PIN brute-force/lockout test; approval bound to record and expiry
- [ ] SQL injection & XSS payload suite (UI, PDF, CSV export)
- [ ] Electron: no Node in renderer, CSP, navigation blocked
- [ ] Local API token / Host / Origin checks
- [ ] PostgreSQL not reachable from LAN (port scan)
- [ ] Audit hash chain tamper detection test
- [ ] Backup tamper/wrong-key tests
- [ ] No secrets in logs/installer/config (scan)
- [ ] External penetration test; findings triaged

## 9. Functional testing
- [ ] Unit tests for domain logic (≥ 90 % branch coverage on money code)
- [ ] API integration tests against a real PostgreSQL
- [ ] E2E (Playwright) for the main workflows in Arabic RTL
- [ ] Concurrency: two users approving the same invoice/payment
- [ ] Rounding and large-number tests
- [ ] Print layout tests on the customer's real printer (A4/A5)
- [ ] Usability test with the real accountant (task timing, error rate)

## 10. Offline testing
- [ ] Full install and daily operation with no network adapter enabled
- [ ] No outbound connection attempts in v1 (packet capture)
- [ ] Sync worker disabled by default and harmless when enabled without a server
- [ ] Power loss during a transaction → no partial documents after restart
- [ ] Clock change handling (backwards jump alert)

## 11. Backup & recovery testing
- [ ] Scheduled backup runs, is encrypted, checksum recorded
- [ ] Weekly automatic test-restore marks backup `verified`
- [ ] Restore onto a clean VM reproduces business totals exactly
- [ ] Corrupted/tampered backup detected; wrong key refused
- [ ] Pre-update and pre-restore backups taken automatically
- [ ] Alert when last good backup > 48 h or disk space low

## 12. Performance testing
- [ ] Seed synthetic data: 100 k invoices, 500 k lines, 1 M stock movements, 2 M journal lines
- [ ] Daily screen open < 1 s; product autocomplete < 100 ms; customer statement < 2 s
- [ ] Dashboard queries < 2 s (add materialised views if needed)
- [ ] Monthly pack PDF/Excel generation within an agreed limit
- [ ] Memory/CPU footprint acceptable on a low-end PC (4 GB RAM)

## 13. Synchronization readiness (no server built)
- [x] UUID keys, `tenant_id`, `row_version`, soft delete in schema
- [x] Outbox table + trigger written; inbox/state/conflict tables written
- [ ] Outbox trigger verified on live PostgreSQL
- [ ] Replay test: apply outbox into a scratch DB → identical business data
- [ ] Idempotent re-apply test (same batch twice = no change)
- [ ] Conflict scenarios documented and unit-tested (master-data concurrent edit)
- [ ] Sync API contract drafted (OpenAPI) — design only
- [ ] Per-tenant RLS design reviewed for the future central schema

## 14. Installation testing
- [ ] Installer builds, is code-signed
- [ ] Clean Windows 10 and 11 VMs: install < 15 min, no technical input
- [ ] PostgreSQL service, port 5433, localhost-only, roles created, secrets in DPAPI
- [ ] First-admin wizard incl. PIN; weak password rejected
- [ ] Optional reference-data load (Part D) works / skips
- [ ] Backup schedule configured at install
- [ ] Update from N to N+1 preserves data; forced failure rolls back and restores
- [ ] Uninstall keeps data unless explicitly confirmed
- [ ] Antivirus/SmartScreen behaviour documented
- [ ] Diagnostics zip contains no personal data

## 15. Stage 6 consistency review
- [x] Numbers in `agent.md` recomputed from the workbook by script
- [x] Counts (tables, views, functions) in `agent.md` match `database.sql`
- [ ] Re-review after owner answers Q-1…Q-12 and after SQL execution
- [ ] Every table in `database.sql` mapped to a screen or report
- [ ] Every `details` requirement mapped to a test case

## 16. Final release acceptance
- [ ] All Priority-1 workflows pass on the pilot dataset (real workbook import)
- [ ] 1-month parallel run vs Excel with weekly reconciliation signed by the owner
- [ ] Zero critical/high security findings
- [ ] Backup/restore drill passed on a clean machine
- [ ] Documentation (Arabic user guide, admin guide, support runbook) complete
- [ ] License/activation flow tested, read-only expiry mode verified
- [ ] Owner sign-off recorded
