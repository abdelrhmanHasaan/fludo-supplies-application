# tip.md — Honest Technical & Product Recommendations

Blunt advice from analysing `يوميه.xlsx` and the `details` specification. Complexity: **S** (days) · **M** (1–3 weeks) · **L** (a month+). Every point cites what the workbook actually does today.

---

## 0. The five things that matter most

1. **Scope is the biggest risk.** The workbook covers ≈ 35 % of what `details` asks for (parties, products, bookings/sales, payments, employees, equipment). Multi-branch stock, banks, double-entry accounting, shipments, depreciation and period close are *new products*. Ship in phases (agent.md §10); sell Phase 3 first — it already replaces the daily Excel work.
2. **Resolve Q-1 before writing code.** Excel treats a booking as customer debt immediately (e.g. 140 t × 3,850 = 539,000 although 25 t were delivered). `details` wants debt at delivery. Wrong choice = every balance on screen disagrees with the owner's mental model.
3. **The import is half the project.** 1,513 formulas, 890 merged cells, mixed text/real dates, free-typed product names. Budget real time for the importer + review screen, and use its totals (3,395,835 / 3,284,590 / 1,772,044 / 948,070) as acceptance tests.
4. **Fix the money model once, centrally**: one posting engine, no screen ever writes balances. This is what makes “record once” true and what the workbook cannot do.
5. **Do not rely on a 4-digit PIN.** Keep the owner's PIN idea but bind it to a manager session, per-record, time-boxed, rate-limited (security.md §5.1).

---

## 1. Features — current state, improvement, why, complexity, risks, future

### 1.1 Products & prices (الاعدادات → المنتجات والأسعار)
* **Today:** 42 products, unit, code, “سعر اليوم”; prices are typed per line anyway (cement sold at 3,850 vs catalogue 4,100); 31 of 42 products show price 0; names re-typed inconsistently in ledgers (`سن2`, `سن 2`, `سن اثنين`).
* **Improve:** product picker with autocomplete (name/code/barcode), default price pre-filled but editable per line, price snapshot kept; *price list history* (effective-from dates); price-override report (who sold below/above catalogue); product merge tool for duplicates.
* **Why:** reports by product are impossible today; margin leaks go unseen.
* **Complexity:** S (picker, snapshot) · M (price history, override report).
* **Risks:** users over-edit prices; add a permission/threshold (“discount > X % needs approval”).
* **Future:** customer-specific price lists, quantity tiers, supplier price comparison, price-change alerts when cement price moves.

### 1.2 Customers & ledger (حسابات العملاء)
* **Today:** vertical Excel blocks; totals via hard-coded ranges (D-8); credit balances exist (−720,000 across 3 customers); labelled sub-accounts (“حساب الاسمنت/المون”); collection date cell unused.
* **Improve:** real statement view (timeline, running balance, filters by section/product/date); **aging buckets (0-30/31-60/61-90/90+)**; credit limit with soft warning; promised-payment date with reminders; WhatsApp-ready statement PDF; duplicate-customer detector (phone + fuzzy name); “customer is also supplier” badge and a **netting** screen.
* **Why:** collecting money faster is the single most valuable feature for this business.
* **Complexity:** M.
* **Risks:** the agent/end-customer structure (عز الدين → علاء نمنم) is ambiguous (A-4); wrong hierarchy = wrong statements. Confirm with the owner.
* **Future:** SMS/WhatsApp reminders (needs internet → optional module), customer portal later via the central server.

### 1.3 Bookings (الحجوزات)
* **Today:** `حجز` rows; remaining = booked − received; negative remaining when delivery has no booking line; running sum in `P14`.
* **Improve:** first-class *Booking* document with its own prepayment, delivery progress bar (140 booked / 25 delivered / 115 left), expiry date, price lock (“price guaranteed until”), partial cancellation, auto-allocation of deliveries to the oldest booking.
* **Why:** prepayments are large (cement bookings of 400–500k); price-lock disputes are the likely friction point.
* **Complexity:** M. **Risks:** reserved-vs-available rules must be exactly as in `details` §9 (reservation never reduces physical stock). Test heavily.
* **Future:** supplier-side booking matching (“we booked 100 t at supplier X for customer Y”).

### 1.4 Sales invoices & shipment invoices
* **Today:** 10-line template, typed number `A0006` and date, `سداد` and `صافي`; no driver/vehicle/branch, no handling fee, no carried balance.
* **Improve:** gapless numbering; one-click “invoice for this shipment”; **carried-balance block** (display-only, never re-posted); handling fee; amount in words (Arabic tafqeet) auto-generated; QR with invoice no.; print preview identical to the paper the customer already knows; return invoices; cancel with reason (never delete).
* **Why:** removes numbering errors and the “who owes what” argument at the gate.
* **Complexity:** M (tafqeet S, carried balance M because of credit-balance handling).
* **Risks:** the carried balance must never become a second debt — enforce in code *and* tests (`previous_balance_snapshot` is excluded from posting). Egyptian e-invoicing (ETA) rules may apply to the customer — **verify legal requirements with the owner's accountant; this document does not assume them**.
* **Future:** ETA e-invoice integration module, barcode/QR scanning at the gate.

### 1.5 Payments & collections
* **Today:** `مقدم من العميل` column; `سداد` at invoice bottom; no cash-box, no method, no link to invoices.
* **Improve:** payment document with allocation to specific invoices or “on account”; cashbox/bank selection; receipt voucher printing; **driver collections** (money returns later) tracked per driver; cash count/reconciliation screen.
* **Why:** matches `details` §10/§11 and closes the biggest leakage point (cash with drivers).
* **Complexity:** M. **Risks:** over-allocation, allocation to cancelled invoices (DB/API checks).
* **Future:** cheque register with due dates, bank statement import for reconciliation.

### 1.6 Suppliers & purchasing
* **Today:** same ledger idea; **opening balance stored as a fake line** (“مرحل”, qty 1 × 308,150); `P` remaining at supplier; one supplier is also a customer.
* **Improve:** purchase orders → receipts (`اذن استلام`) → supplier invoice match; due-date tracking; price history per supplier/product; opening balance as a proper journal entry; netting with customer side.
* **Why:** supplier payables (823,974) is the second-largest number after receivables.
* **Complexity:** M. **Risks:** goods received vs invoiced mismatch; define a rule early (receipt creates liability).
* **Future:** best-price suggestion per product, supplier scorecards.

### 1.7 Inventory (not in the workbook!)
* **Today:** **no stock tracking at all.** Delivered quantities exist only per customer row.
* **Improve:** append-only movement ledger, per-branch stock, reserved/available/incoming views (`database.sql`), stock transfers, adjustments with reason + approval, reorder alerts (`min_stock`), stocktake sheet.
* **Why:** it is the most valuable new capability and the hardest to get right.
* **Complexity:** L. **Risks:** the business sells bulk goods (m³, tons) where physical counting is imprecise; allow *negative stock with warning* initially (Excel never blocked sales) and tighten later; define costing (Q-8).
* **Future:** truck-scale integration (weighbridge), yard map, shrinkage analytics.

### 1.8 Shipments & drivers (not in the workbook)
* **Today:** nothing.
* **Improve:** shipment per invoice, driver, vehicle, departure time, status, **cash still with driver**; end-of-day settlement screen.
* **Why:** biggest fraud/cash-leak area in this trade; cheap to add once invoices exist.
* **Complexity:** M. **Risks:** adoption — drivers/loaders must be captured at the gate in seconds. Keep the form to 3 fields.
* **Future:** delivery proof (photo/signature), fuel-per-trip analysis (ties into equipment costs), GPS later.

### 1.9 Employees & payroll
* **Today:** weekly grid with attendance fractions and per-day advances; monthly statement with an opening *debt* (26,800); bugs D-2/D-3/D-4; rate conflict for محمد اوزو.
* **Improve:** daily attendance screen (tap present/half/absent), advance requests, debts with repayment schedule, weekly (Fri→Thu) and monthly pay slips, printable wage voucher with signature, automatic cash entry.
* **Why:** wages are paid weekly in cash — the grid is already the habit; keep that UX, remove formula errors.
* **Complexity:** S–M. **Risks:** labour-law/insurance requirements are out of scope until the owner specifies them; do not invent them.
* **Future:** overtime rules, attendance via fingerprint/phone, per-project labour costing.

### 1.10 Equipment & vehicles
* **Today:** machine list; daily expense grid whose summary formulas are wrong for 6 of 7 machines (D-1).
* **Improve:** expense lines per machine (fuel, maintenance, driver), cost per month, **cost per working day/trip**, maintenance schedule (hours/km), depreciation (straight-line) as an optional accounting job.
* **Why:** shows which loader/truck loses money.
* **Complexity:** S (expenses) · M (maintenance + depreciation). **Risks:** capital vs operating expense classification — needs the accountant.
* **Future:** link trips to vehicles for profit per vehicle.

### 1.11 Daily (اليومية) transaction centre
* **Today:** no daily book exists; the “يوميه” name suggests the owner thinks in days.
* **Improve:** one screen, 17 transaction types as templates, keyboard-first, “repeat last”, day closing summary (cash in/out, sales, purchases), unfinished drafts bar.
* **Why:** this is the screen used 100 times a day; speed = adoption.
* **Complexity:** M. **Risks:** a generic wizard becomes slow; give the top 4 types (sale, collection, purchase, payment) dedicated fast forms.
* **Future:** voice/WhatsApp order capture (optional), offline mobile companion for the yard.

### 1.12 Accounting & reports
* **Today:** none; only customer/supplier totals.
* **Improve:** double-entry engine behind the scenes — the owner sees friendly screens, the accountant gets journal, ledger, trial balance, income statement, balance sheet, cash-flow; monthly pack (PDF+Excel) and period close; compare month vs previous month.
* **Why:** differentiates the product commercially and gives the external accountant what they need.
* **Complexity:** L. **Risks:** a *template* chart of accounts is shipped (`system_seed`); it **must** be reviewed by an accountant (Q-7). Cost method, handling-fee treatment (Q-6), and opening balances change the numbers materially.
* **Future:** VAT/tax module, multi-currency, budgets, branch P&L.

### 1.13 Roles, approvals, audit
* **Today:** none — anyone can overwrite any cell.
* **Improve:** as security.md. Add an **“approvals inbox”** for the owner (see requests, approve on phone later), anomaly alerts (invoice edited after printing, price below cost, many cancellations by one user).
* **Why:** the owner's #1 stated concern.
* **Complexity:** M. **Risks:** friction — too many approvals and users will work around the system (writing on paper). Approve only *post-approval edits*, not drafts.
* **Future:** two-person approval above an amount, Windows Hello for approvals.

### 1.14 Backups & updates
* **Today:** the file itself (one corrupted `.xlsx` = total loss; copies by hand).
* **Improve:** scheduled encrypted backups, external-drive detection, weekly test-restore, restore wizard, “last backup X hours ago” badge on the dashboard.
* **Why:** customers *will* lose a PC; recovery is what they remember.
* **Complexity:** M. **Risks:** silent failures — alert loudly.
* **Future:** encrypted cloud backup through the central server (paid add-on).

### 1.15 Dashboard
* **Today:** `الرئيسيه` is empty.
* **Improve:** only 8–10 numbers owners check daily: cash on hand, receivables (+ overdue), payables, today's sales, stock of top products, deliveries today, cash with drivers, last backup. Drill-down on click.
* **Complexity:** S–M. **Risks:** slow queries on large data → materialised views/indices later.
* **Future:** trends, forecasts, “cement price vs your stock” insights.

### 1.16 UI / “3D” look
* **Recommendation:** keep depth subtle (logo, cards, primary buttons). Flat, dense, high-contrast tables; ≥ 14 px Arabic font; keyboard shortcuts; light and dark theme. Heavy 3D hurts readability on cheap monitors and slows low-end PCs.
* **Complexity:** S. **Risk:** designers over-deliver visuals, under-deliver data density — test with the real accountant.

---

## 2. Architecture & product recommendations

| Topic | Recommendation | Why | Complexity | Risk |
|---|---|---|---|---|
| Stack | Electron + React + Node/TypeScript + PostgreSQL 16 (agent.md §6) | Fast UI, shared TS, offline | M | Large installer (~250 MB); Tauri is smaller but riskier hiring-wise |
| Money | Integer/decimal only; recompute totals server-side | Floating-point cent errors in a ledger are unforgivable | S | None |
| Sync readiness | UUIDs, tenant id, row_version, outbox (already in `database.sql`) | Avoids rewrite | S | Outbox grows → prune after ack |
| Numbering | Gapless sequences per document type; set `next_value` to continue the paper series (A0006, B0011) | Continuity with existing paper | S | Multi-device later needs per-device prefix |
| Multi-branch | Branch on every stock/cash document from day 1 | Retrofitting is painful | S | Setup wizard must collect branches (A-3) |
| Printing | HTML→PDF templates; test on the customer's printer early | Invoices are the product's face | M | Arabic shaping/RTL bugs; test fonts |
| Importer | Staging + review, never auto-commit | Source data is messy | L | Owner time for review |
| Licensing | Activation key + signed license file, offline grace period | Commercial product | M | Don't lock customers out of *their own data* — read-only mode on expiry |
| Telemetry | Opt-in, anonymous, no financial data | Support & roadmap | S | Privacy/consent |
| Localisation | Arabic first; keep strings externalised for English | Resale outside Egypt | S | RTL layout regressions |

## 3. Things I deliberately did NOT do / assume

* Did not invent VAT, e-invoicing, labour-law or insurance rules (not in the sources).
* Did not load customers/suppliers/employees into `database.sql`; they go through the reviewed importer because of duplicates, text dates and conflicts.
* Did not claim the SQL was executed — it has not been (no PostgreSQL in the authoring environment).
* Did not choose costing, revenue treatment of handling fee, or the accountant role's HR rights — they are open questions (Q-6, Q-8, A-9).

## 4. Commercial advice

1. Pilot with the current owner for one full month in **parallel with Excel**; compare totals weekly.
2. Sell in tiers: **Core** (parties, bookings, invoices, payments, stock) → **Accounting** → **Payroll & Assets** → **Cloud sync/backup**. The sync tier becomes recurring revenue.
3. Provide data-migration as a paid service (the importer is reusable for other customers who also run Excel).
4. Support burden: ship the diagnostics zip, an Arabic video per workflow, and remote-assist tooling.
5. Protect your IP and customers: signed installers, license binding, per-customer build metadata.
