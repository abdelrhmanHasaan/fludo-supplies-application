# agent.md — Implementation Guide: Building-Materials Yard ERP (Offline-First, Windows + PostgreSQL)

> Audience: Codex, Claude Code, Antigravity, or any engineer implementing this product.
> Inputs analysed: `يوميه.xlsx` (the real business workbook) and the ERP specification file `details` (Arabic).
> Companion files: `database.sql`, `security.md`, `tip.md`, `todo.md`.
> **Honesty rule:** nothing in this repository is claimed implemented or tested unless a checked box in `todo.md` says so. At the time of writing, only documentation and a *not-yet-executed* SQL schema exist.

---

## 0. How to read this document

1. §1–§3: what the existing Excel system really is (evidence-based, with cell references).
2. §4: gaps between the workbook and the `details` specification — **decisions the owner must make**.
3. §5–§9: product design, architecture, database, UI, security summary.
4. §10–§12: phases, installation guide, coding standards, acceptance criteria.
5. §13: assumptions (A-*) and open questions (Q-*). **Do not silently resolve these — ask.**

---

## 1. Workbook analysis (Stage 1) — what exists

Workbook `يوميه.xlsx`: 10 sheets, 2,460 formulas, no macros, no named ranges, no charts, no images. Company on the letterhead: **شركة الرضا للتوريدات (AL REDA SUPPLIES CO.)** — building-materials supply, Kerdasa.

| # | Sheet | Purpose (from evidence) | Size / formulas |
|---|---|---|---|
| 1 | الرئيسيه | Empty (A1 only). Intended as a home/navigation page; contains nothing. | 0 |
| 2 | الاعدادات | Master data: **42 products** (B:E name/unit/code/“سعر اليوم”), **7 employees** (G:K), **4 services** (M:P), **7 machines/vehicles** (R:V). | 0 formulas |
| 3 | فاتوره | Sales-invoice print template, 10 item lines, no. `A0006`, date typed as text `18/11/2026`. | 12 |
| 4 | فاتورة اذن استلام | Goods-receipt note from supplier, 10 lines, no. `B0011`. | 12 |
| 5 | كشف حساب | Customer statement print template (name, amount 85,350, remaining booked goods grid). Values typed by hand. | 0 |
| 6 | حسابات العملاء | **26 customer blocks** (25 named + 1 blank template), rows 5–1071, 624 merged ranges. One running ledger per customer. | 1,513 |
| 7 | حسابات الموردين | **9 supplier blocks** (44 rows each), rows 5–396. | 576 |
| 8 | حسابات الموظفين | Weekly attendance/advances sheet; 5 week blocks of 15 employee slots (only week 1 filled: 3 employees). | 225 |
| 9 | حساب انس محمد | Monthly statement of ONE employee (wage, advance, deduction, bonus, opening debt 26,800). | 97 |
| 10 | حسابات المعدات | Daily equipment-expense grid for month `11_2026`, 7 machines. | 25 |

### 1.1 Settings sheet (الاعدادات)

* **Products** — columns: اسم الصنف, الوحده, الكود, سعر اليوم. Units used: `م³`, `طن`, `شكاره`, `الف طوبه` (thousand bricks), `القطعه`. Codes are *letter + two digits*; the letter groups products (A = gravel/crushed stone, B = sand/fill, C = cement brands, D = gypsum, E = special cements, F = powder, G = red brick, H/I = brick & block variants, J = lintels 80–260 cm). **The meaning of each letter is inferred from the products carrying it; the workbook does not name the groups.** 42 products; 11 have a non-zero price (e.g. cement 4,100/ton, white cement 4,500, gypsum 3,300 / 2,800, gravel 430–680/m³).
* **Employees** — 7 names, job title only for 2 (سائق اللودر, غفير), daily rate for 6 (150–430). *Conflict:* weekly sheet gives محمد اوزو 250/day while settings leaves his rate blank (A-6).
* **Services** — نقل مخلفات, لودر كبير, لودر صغير, حفاره: names only; no unit/code/price.
* **Machines** — codes `M01..M07`: لودر كبير, لودر صغير, عربه 12 م, عربه 4 م, عربه 3م مازدا, عربه 3م دهاتسو, عربه 3م جامبو; vehicle colour/description in “نوع العربه”; plate number column is empty.

### 1.2 Invoice templates

* Sales invoice (`فاتوره`): header (company, phones, address), invoice no., date, customer name/phone/address, 10 lines (م, الصنف, الوحده, الكود, الكميه, سعر الوحده, الإجمالي), total, **سداد** (paid), **صافي الفاتورة** = total − paid, amount-in-words line, notes line, signatures (receiver, accountant “Anas Battawi”, company stamp).
  * Formulas: `H = G*F` per line; `G23 = SUM(H13:H22)`; `G25 = G23 − G24`.
  * **No carried-forward balance, no handling/loading fee line, no driver, no vehicle, no branch.** Invoice no. and date are typed text.
* Receipt note (`فاتورة اذن استلام`): same layout for suppliers; “باقي علينا” = total − paid.
* Numbering evidence: `A####` for sales, `B####` for receipts.

### 1.3 Customer ledger (حسابات العملاء) — the core of the system

Each customer is a vertical block (typically 34 rows with one 20-row ledger table; larger customers chain 2–5 tables, up to ~127 rows):

```
Row +0   اسم العميل | <name> | رقم الهاتف | الفئه | ملاحظه | بداية التعامل
Row +3   اجمالي مشتريات العميل | خالص من العميل | باقي على العميل | ميعاد التحصيل | البضاعه المحجوزه
Row +5   C: =SUM(N lines)  D: =SUM(L payments)  E: =C−D  G: =MAX(0,G8−TODAY())  I: =SUM(P…)  (remaining booked goods)
Row +7   م | العميل | باقي حساب العميل | التاريخ | الصنف | الوحده | الكود | الكميه | السعر | مقدم من العميل | ملحوظه | الإجمالي | البضاعه المستله | المتبقي للعميل
Row +9…  up to 20 ledger rows per sub-table; blocks with more activity chain up to 5 sub-tables (e.g. معاذ رمضان).
```

Per-row formulas: `N = J*K` (qty × price), `P = J − O` (booked − received) with a running `P14 = (J14−O14) + SUM(P15:P34)` on the first row of a sub-table to roll the remaining booked quantity. Sub-table headers like `E14 = "حساب الاسمنت"` / `E20 = "حساب المون"` and a `D` cell naming an end customer (علاء نمنم, محمد عبدالناصر توقه) show that **one named customer can hold several labelled sub-accounts** (cement account vs mortar account; agent vs end-customer) — see A-4.

**What a row means** (derived from rows 14–23 of block 5):

| Pattern | Meaning |
|---|---|
| `J,K` filled, `O` = `J` | Direct sale: qty×price added to customer total, delivered at once. |
| `J,K` filled, `O` < `J`, `M="حجز"` | Booking: goods ordered, partially delivered; `P` = still owed to the customer. |
| `J` empty, `O` filled, `M="حجز"` (e.g. row 17: 30 t) | Delivery against an earlier booking; shows `P` negative (−30). |
| `L` filled | Cash received from the customer (“مقدم من العميل”), also used for “فلوس تحت الحساب”. |

**Totals reproduced by script from cached values (use as import acceptance targets):**

| Measure | Value (EGP) |
|---|---|
| Sum of “اجمالي مشتريات العميل” (25 customers) | **3,395,835** |
| Sum of “خالص من العميل” | **3,284,590** |
| Net (purchases − paid) | **111,245** |
| Of which 3 customers hold *credit* balances (pure prepayments, no purchases): سمير عطيه البطاوي −350,000 · عزت عبدالمجيد زيتون −300,000 · علاء محمود خليل −70,000 | −720,000 |
| ⇒ gross receivable (positive balances only) | **831,245** |
| Line items with qty & price | 107 |
| Payment cells | 25 |

### 1.4 Supplier ledger (حسابات الموردين)

Same idea, 44-row blocks: `N = H*I` (qty × price), `D10 = SUM(J)` (paid by us), `E10 = C10 − D10` (we owe), `P = H − O` (remaining at supplier). **An opening balance is entered as a fake line**: row 14 of the first supplier is `D14="مرحل"`, qty 1 × price 308,150 — a hack that the new system must model as a proper opening balance.

| Supplier | Product | Purchases | Paid | Due |
|---|---|---:|---:|---:|
| عزت الحج علي | طوب احمر | 339,500 | 105,500 | 234,000 |
| جمعه دياب | زلط | 224,945 | 105,000 | 119,945 |
| عرفة بلوك | بلوك ابيض | 49,025 | 46,000 | 3,025 |
| احمد عيسى السقاري | اسمنت | 443,510 | 250,000 | 193,510 |
| محمود خليل | رمل | 39,875 | 24,000 | 15,875 |
| معاذ رمضان | اسمنت | 621,200 | 387,570 | 233,630 |
| محمد عبدالوهاب | زلط واحات | 29,500 | 30,000 | −500 |
| حسني عتمان | اسمنت | 8,003 | 0 | 8,003 |
| احمد حبيشه | رمل | 16,486 | 0 | 16,486 |
| **Total** | | **1,772,044** | **948,070** | **823,974** |

Observations: (a) **معاذ رمضان is both a customer and a supplier** → the new system uses one `parties` table with `is_customer` / `is_supplier`. (b) His customer “paid” (387,570) equals his supplier “paid” (387,570) — possibly netting or a copy error → **Q-3**.

### 1.5 Employees

* Weekly sheet (week = Friday→Thursday, columns الجمعه…الخميس, each day has *attendance fraction* (0, 0.5, 1) and an adjacent “مصاريف” cell = cash advance that day). `V = rate × Σattendance`, `W = Σadvances`, `Y = V − (W + X deductions)`.
* Monthly statement (حساب انس محمد): columns المصروف (advance), اليومية (wage), خصومات, مكافئات, `J = wage + bonus − deduction − advance`. Top block: **opening debt 26,800**, “مسدد من حسابه” = month's net 1,100, remaining debt **25,700**. So an employee can *owe the company* and repays from wages.
* Observed: November 13→18 attendance 6 days × 350 = 2,100; advances 1,000.

### 1.6 Equipment

Header row lists 7 machines; for each day two expense slots (machine, expense, amount) are entered and `L = H + K`. The per-machine total row (F6:L6) uses SUMIF.

### 1.7 Defects, risks and inconsistencies found (must not be silently "fixed")

| # | Where | Finding | Impact | Treatment in new system |
|---|---|---|---|---|
| D-1 | حسابات المعدات!G6:L6 | Formulas **shift one column per machine**: `G6` sums columns G/I/J/L (expense *name* and wrong amount columns), only `F6` is correct. `M6` (“اجمالي مصاريف المعادات”) has no formula. | Machine totals wrong for 6 of 7 machines. | Single normalised `equipment_expenses` table; totals by query. |
| D-2 | حساب انس محمد!J66 | `=SUM(J35:J52)` but December rows run 35–65 → 13 days excluded. Similar `T43 = SUM(T12:T29)` vs rows 12–42. | Under-stated balances. | Period totals by query over dates. |
| D-3 | حساب انس محمد!N9 | Header typed `12_2027` (likely 11_2026 or typo); title cells read `انس محم` (truncated). | Cosmetic / wrong period label. | Dates are real dates; period derived. |
| D-4 | حسابات الموظفين | Week blocks 2–5 all labelled “اسبوع 2”; only block 1 has dates. | Confusing. | Payroll periods derived from dates. |
| D-5 | Customer/Supplier sheets | Dates are a mix of text (`'14/11/2026'`, 55 cells) and real dates (15). Supplier row D15 holds the real date **2026-12-11** between a “مرحل” row and a 13/11/2026 row → probable day/month swap (11/12 typed as 12/11). | Sorting/aging wrong. | Importer flags every text date; user confirms (Q-5). |
| D-6 | Customer sheet | Product names free-typed and inconsistent (`سن2`/`سن 2`/`سن اثنين`, `زلط`/`زلظ واحات`/`زلط واحات`, `اسمن`, `اسمنت ` with trailing space); `الكود` column empty. | Cannot report by product. | Importer maps names → product catalogue with a review screen. |
| D-7 | Customer sheet | **Booked value is counted as “purchases” immediately** (`N = J*K` on the booking row; e.g. 140 t × 3,850 = 539,000 while 25 t delivered). | Debt shown before delivery; differs from `details` §6 which separates booking value / payment / delivery. | Q-1. Model supports both views. |
| D-8 | Customer sheet | `C10` sums only hard-coded row ranges per sub-table; adding a row beyond the range silently drops it. | Silent under-count risk. | All totals computed from records. |
| D-9 | Customer sheet | Negative `P` values (deliveries without a booking line) and `P14` rolling sum mix signs. | Remaining-booking figure fragile. | Remaining = booked − delivered per order line. |
| D-10 | Whole workbook | `G8` collection-date cell is empty for all parties; `TODAY()` makes values volatile. | Feature unused. | Optional `settlement_due_date` + aging report. |
| D-11 | Invoice templates | No tax, no carried balance, no per-invoice link to the customer ledger; numbers typed manually. | Duplicate/missed numbers possible. | Gapless sequences (`app.next_doc_number`). |
| D-12 | Settings | `0` used as price for 31 of 42 products. | Ambiguous (“no price” vs free). | Q-2 / A-2. |
| D-13 | Workbook | Print area, merged cells (890) and layout formatting make it unsuitable for DB import without a parser. | Import complexity. | Block-aware importer (§9, Phase 2). |

---

## 2. Business model extracted (Stage 2)

Evidence-based entities and rules (each traceable to §1):

1. **Parties**: customers and suppliers (a person may be both).
2. **Products** with unit + code + “today's price” (a default; actual line prices differ: e.g. cement at 3,850 vs catalogue 4,100).
3. **Bookings** (“حجز”): quantity reserved, partially delivered over time, tied to prepayments.
4. **Sales / deliveries**: qty × agreed price; line price is free-typed per row.
5. **Payments**: from customers (`مقدم من العميل`), to suppliers (`مدفوع منا`, “نقدي” note).
6. **Supplier purchases** and remaining quantity at supplier.
7. **Employees**: daily rate, attendance fraction, advances, deductions, bonuses, opening debts; weekly (Fri–Thu) and monthly views.
8. **Equipment/vehicles** with daily expenses.
9. **Documents**: sales invoice, receipt note, customer statement (printed, with signatures and stamp).
10. **No accounting** (chart of accounts, journal, treasury, bank, general expenses, branches, shipments, drivers) exists in the workbook.

## 3. Business rules that MUST be preserved

* R1 Line total = quantity × unit price (price editable per line, catalogue price only a default).
* R2 Customer balance = Σ(line totals) − Σ(payments); supplier balance likewise.
* R3 Remaining booked quantity = booked − delivered, per product, per customer.
* R4 Employee net due = days × rate (+ bonuses) − (advances + deductions); an employee may carry an opening debt repaid from wages.
* R5 Invoice net = total − paid; separate numbering for sales (`A####`) and receipts (`B####`).
* R6 Equipment cost per machine = Σ expense lines per period.
* R7 Customers can hold credit (prepayment) balances — they must stay visible (3 exist, −720,000).

---

## 4. Workbook ↔ specification gap analysis (decisions required)

The `details` specification describes a **far larger system** than the workbook: multi-branch inventory, treasury & banks, double-entry accounting, shipments/drivers, expenses, fixed-asset depreciation, period closing, monthly reports, approval PIN. The workbook covers about 35 % of it (parties, products, bookings/sales, payments, employees, equipment). The rest is **new scope**, not “preserved functionality”. The schema supports both; implement in the phases in §10 and mark every new-scope screen as *specification-derived*.

Conflicts between the two sources:

| # | Topic | Workbook | `details` | Default taken in this design | Question |
|---|---|---|---|---|---|
| C-1 | When is a sale a debt? | At booking (full booked value) | At delivery; booking value is separate | Follow `details`; provide “commitments incl. bookings” report that reproduces the workbook figure | Q-1 |
| C-2 | Accountant powers | Anyone with the file | Accountant cannot edit approved items | Follow `details` | — |
| C-3 | Opening balances | Fake line “مرحل” | Opening balance journal entry | Opening-balance entry per party | Q-4 |
| C-4 | Handling/loading fee (المشال) | Not present | Invoice line group, also “carried balance” | Header field `handling_fee`; carried balance snapshot | Q-6 |

---

## 5. Product definition

Windows desktop application, Arabic RTL, fully offline. One installation = one company = one local PostgreSQL database. Single code base must later serve a central server without rewrite.

### 5.1 Navigation (sidebar, from `details` §2)
الرئيسية · اليومية · العملاء · الموردين · المخزون · المنتجات والأسعار · الموظفين · الفواتير · الشحنات والسائقين · الخزينة والبنوك · المصروفات · الأصول والمعدات · التقارير · الإعدادات والصلاحيات.

### 5.2 Core principle — “record once”
Every transaction is created in **اليومية (Daily)** by a *transaction wizard* (the 17 types in `details` §5). The backend, in **one database transaction**, writes: the business document, stock movements, payment allocations, and the balanced journal entry. Screens never write accounts directly.

### 5.3 Pricing rule
Selecting a product pre-fills `default_sale_price` / `default_purchase_price`; the user may override on the line. The override affects that line only; `catalog_price_snapshot` is stored next to the used price. Past documents never change when the catalogue price changes.

### 5.4 Reservation rule
Reserved stock is **derived** (open order lines − fulfilled quantity), never stored as a movement. `available = on_hand − reserved`. Incoming-from-supplier quantity is derived from open purchase order lines and is **not** stock until a receipt is approved.

### 5.5 Invoice with carried balance (critical, `details` §10)
* A shipment invoice shows: `previous_balance_snapshot` (display), today's lines, handling fee, **total due** = previous + today, amount paid today, remaining.
* The previous balance is a **snapshot for collection purposes only; it is never posted again** (no duplicate debt). The ledger already holds it from the original documents.
* A customer with a credit balance shows it as a negative previous balance and it reduces the amount due.
* Payment recorded against the invoice creates a `payments` row + `payment_allocations` (can allocate to older invoices too).

### 5.6 Approval & immutability (`details` §16, summarised; full detail in `security.md`)
`draft → approved → cancelled`. After `approved`, edits/cancellation need a **manager-granted, time-boxed, record-specific approval** (`edit_approvals`). The database enforces it with triggers even if the application has a bug.

---

## 6. Architecture

### 6.1 Recommended stack (proposal — confirm before Phase 1)

| Layer | Choice | Why |
|---|---|---|
| Shell | **Electron** (or Tauri) packaged for Windows | Offline desktop, mature RTL/printing, auto-update |
| UI | **React + TypeScript**, Tailwind, `dir="rtl"`, Arabic font (e.g. Cairo/Tajawal bundled locally) | Fast, component reuse, accessible |
| Local backend | **Node.js 20 + TypeScript (Fastify)**, module-per-domain, listens on `127.0.0.1` random port, per-launch bearer token | Separates UI from business logic; becomes the sync client later |
| DB | **PostgreSQL 16** installed by the installer as a Windows service bound to `localhost` only | Required by the brief; ACID |
| DB access | Kysely or Drizzle (typed SQL, parameterised) + plain SQL migrations (`node-pg-migrate` / dbmate) | No ORM magic; SQL injection safe by construction |
| Reports | HTML → PDF with Electron `printToPDF`; Excel via `exceljs` | RTL-correct PDFs |
| Installer | **Inno Setup** (or WiX) bundling PostgreSQL silent installer | One-click for non-technical customers |
| Tests | Vitest (unit), Playwright (UI e2e), pgTAP or SQL tests for DB rules | Coverage of money logic |

Alternatives (document the decision in `docs/adr/0001-stack.md`): Tauri + Rust backend (smaller, harder for hiring); .NET MAUI/WPF (native, weaker RTL web-style UI). **Do not use SQLite**: brief requires PostgreSQL and future parity with the central DB.

### 6.2 Process layout

```
[Electron renderer: React UI]  --HTTP/JSON on 127.0.0.1 + token-->  [Local API (Node)]
                                                                       |--> PostgreSQL (localhost:5433, service "ErpDb")
                                                                       |--> Backup worker  (pg_dump, encrypt, verify)
                                                                       |--> Sync worker    (disabled in v1; reads sync_outbox)
```

* The renderer never connects to PostgreSQL. The DB listens on `127.0.0.1` only; Windows Firewall rule blocks inbound.
* Use a non-default port (5433) and **three DB roles**: `erp_owner` (migrations, installer only), `erp_app` (DML only, no DDL, no superuser), `erp_backup` (read-only + `pg_dump`).
* Business logic lives in `src/domain/*` (pure TypeScript, no I/O) and `src/services/*` (transactions). UI never computes money.

### 6.3 Repository layout

```
/ (project root)
  agent.md  security.md  tip.md  todo.md  database.sql
  docs/adr/                       architecture decision records
  db/migrations/0001_initial.sql  (generated from database.sql)  0002_...
  apps/desktop/                   Electron shell + packaging
  apps/ui/                        React RTL app
  services/api/src/
      domain/        sales, purchasing, inventory, payroll, accounting (pure logic + tests)
      services/      transaction scripts: postSalesInvoice(), recordPayment(), ...
      repositories/  SQL (parameterised)
      http/          routes, auth middleware, validation (zod)
      jobs/          backup, outbox-sync (disabled)
  tools/importer/    Excel → staging → review → load
  installer/         Inno Setup script, PostgreSQL bundling, post-install scripts
  tests/             e2e, DB tests, fixtures (synthetic only)
```

### 6.4 Transaction scripts (examples the backend must implement atomically)

| Operation | DB writes (single transaction) |
|---|---|
| Approve sales invoice | number from sequence → set `app.user_id` → INSERT journal (Dr Receivable[party] total; Cr Sales; Cr Handling revenue; Dr COGS / Cr Inventory) → INSERT stock_movements (−qty) → post journal → UPDATE invoice `status='approved', journal_entry_id, approved_*` |
| Collect from customer | payment + allocations; Dr Cash, Cr Receivable[party] |
| Receive goods | purchase invoice; Dr Inventory, Cr Payable[party]; stock +qty |
| Edit approved invoice | verify approval → `SET LOCAL app.edit_approval_id` → reverse old journal & movements (reversing entries) → apply new → audit row with before/after |
| Close period | assert trial balance balanced → snapshot report JSON → `accounting_periods.status='closed'` |

Costing method (weighted average vs FIFO) is **undecided** (Q-8). Default proposal: weighted average per product per branch.

---

## 7. Database design (summary — full DDL in `database.sql`)

50 tables, 11 views, 15 functions. Highlights:

* **Identity & sync**: UUID PKs; `tenant_id` on every row (default from `app.installation`); `row_version` (trigger-incremented), `created_at/updated_at`, `created_by/updated_by`, soft delete (`is_deleted`). `sync_outbox` is filled by triggers (idempotency key `tenant:table:id:version:op`), plus `sync_inbox`, `sync_state`, `sync_conflicts`.
* **Parties**: `parties` (+ `party_ledger_sections` for labelled sub-accounts).
* **Catalogue**: `units`, `products` (goods/services, `data_origin`).
* **Commercial**: `orders/order_lines` (bookings), `sales_invoices/lines`, `purchase_invoices/lines`, `payments/payment_allocations`, `shipments`.
* **Inventory**: append-only `stock_movements` (signed qty), `stock_transfers`, `stock_adjustments`; views `v_stock_on_hand`, `v_order_line_progress`, `v_product_availability`.
* **Accounting**: `accounts`, `journal_entries/lines` (balanced check on posting, immutability, closed-period guard), `accounting_periods`, views `v_party_balances`, `v_party_statement`, `v_trial_balance`.
* **Treasury**: `cash_accounts` (cashbox/bank ↔ GL account), `cash_counts`.
* **HR**: `employees`, `attendance`, `employee_transactions`, `payroll_periods/lines`; function `employee_net_due()`.
* **Assets & expenses**: `equipment`, `equipment_expenses`, `expense_categories`, `expenses`.
* **Security**: `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `edit_approvals`, hash-chained `audit_log`.
* **Ops**: `document_sequences`, `backup_log`, `schema_migrations`, `installation`.

Data-origin marker: `manual | excel_import | system_seed | sample`. `database.sql` Part D loads only **real** workbook reference data (units, products, services, equipment, letterhead). Customers, suppliers, transactions and employees are **not** in the SQL; they enter through the reviewed importer.

Key design decisions (ADR candidates): money `NUMERIC(16,2)`, no floats; soft delete only for master data; reservations derived; invoice `previous_balance_snapshot` is display-only; posted journals immutable (reverse instead); one `parties` table; `catalog_price_snapshot` alongside the real price.

**Schema status:** syntactically reviewed by hand and by a script (parentheses, forward references) — **not executed on PostgreSQL**. First task of Phase 1 is to run it on PostgreSQL 16, fix errors, add pgTAP tests.

---

## 8. UI / UX requirements

* RTL everywhere, Arabic numerals toggle (Western digits by default for money), Egyptian-pound formatting with thousands separators, dates `dd/MM/yyyy` (+ Hijri off).
* Keyboard-first Daily screen: new transaction in ≤ 3 keystrokes (`F2` new, product autocomplete by name/code, `Tab` through qty/price, `Ctrl+Enter` save+print).
* Every grid: search, filter, sort, column chooser, export Excel/PDF, saved filters.
* Customer page = header + account summary + timeline of documents (open any document; “print statement”).
* Price override: field shows catalogue price in grey beneath the editable price; changed prices are visibly highlighted.
* Errors in Arabic, field-level, with fix hints; never expose SQL.
* Dashboard widgets per `details` §3 with day/week/month/custom filter.
* Printing: A5/A4 invoice template matching the workbook look (letterhead, signatures, stamp), carried-balance block, QR optional. Test on the customer's real printer.
* Accessibility: min 14 px, contrast AA, full keyboard navigation, no colour-only status.
* “3D” visual identity (from `details`) = subtle depth on cards/logo/buttons only. **Tables stay flat and dense.** Documented in `tip.md`.

## 9. Excel importer (tools/importer)

Block-aware parser, **never** a blind cell copy:

1. Read the workbook read-only (openpyxl/exceljs) both formulas and cached values.
2. Detect customer blocks by header `C = "اسم العميل"`; sub-tables by `C = "م"`; supplier blocks by `"اسم المورد"`.
3. Load into **staging tables** with source sheet/row references.
4. Validation report: text dates, unknown products, negative remaining, rows with qty but no price, parties appearing twice (customer+supplier), balance recomputation vs the workbook's cached totals.
5. Human review UI (map product names, resolve dates, confirm duplicates).
6. Load as *opening balances + historical documents* (user chooses: full history or balances only — Q-4).
7. Acceptance: recomputed totals must equal §1.3/§1.4 numbers exactly (3,395,835 / 3,284,590 / 1,772,044 / 948,070) or differences are listed with reasons.

---

## 10. Development phases (wait for approval before Phase 1 — Stage 7)

| Phase | Scope | Exit criteria |
|---|---|---|
| 0 | Owner answers Q-1…Q-12; stack ADR approved; DB schema executed & reviewed | Schema loads on a fresh PostgreSQL 16; open questions closed |
| 1 | Skeleton: installer prototype, DB roles, migrations, login, RBAC, audit, settings, backups | Fresh Windows VM → running app, admin created, backup+restore verified |
| 2 | Master data + importer: products/prices, parties, employees, equipment; Excel import with review | Totals match §1.3/§1.4; staging report signed off |
| 3 | Commercial core: bookings, sales/purchase invoices, payments, stock movements, derived reservation, invoice printing with carried balance | Workbook scenarios reproduced; money-logic unit tests green |
| 4 | Accounting engine: posting rules, journal, ledger, trial balance, party statements, treasury, expenses | Trial balance always zero-diff; reversal tests |
| 5 | Payroll & equipment & shipments/drivers | Weekly sheet reproduced; driver cash outstanding view |
| 6 | Reports, dashboard, period close, PDF/Excel export | Monthly pack matches hand calculation on a pilot month |
| 7 | Hardening: security tests (`security.md`), performance, offline, update/rollback | Release checklist in `todo.md` ≥ 100 % |
| 8 | Sync-readiness verification (outbox, idempotent replay tests) — **no server built** | Replay of outbox into a scratch DB reproduces data |

## 11. Windows client installation & deployment guide

### 11.1 Goals
A non-technical customer double-clicks `Setup.exe`, answers 3 questions, and gets a running system with a first administrator and a scheduled backup.

### 11.2 Installer behaviour (Inno Setup + post-install helper)

1. **Pre-checks**: Windows 10/11 64-bit, ≥ 4 GB RAM, ≥ 10 GB free disk, admin rights; abort with Arabic message otherwise. Detect an existing instance → offer *Update* instead of *Install*.
2. **PostgreSQL**: install the bundled PostgreSQL 16 silently into `C:\Program Files\<Product>\pgsql` as service `ErpDb`, data dir `C:\ProgramData\<Product>\pgdata`, **listen_addresses = 'localhost'**, port 5433, `scram-sha-256` only (`pg_hba.conf`: `host all all 127.0.0.1/32 scram-sha-256`, no `trust`).
3. **Secrets**: generate random 32-byte passwords for `erp_owner`, `erp_app`, `erp_backup`; store them in the **Windows DPAPI-protected** config (`C:\ProgramData\<Product>\secrets.bin`, ACL: SYSTEM + service account only). Never write them to logs or `.env` files.
4. **Database creation**: `CREATE DATABASE erp OWNER erp_owner ENCODING 'UTF8'`; run migrations (`database.sql` → versioned migrations); optionally run Part D reference data (installer checkbox “load the Al-Reda reference data” **off** by default for other customers).
5. **First administrator**: wizard asks company name, admin full name, username, password (≥ 12 chars, strength meter) and the **manager approval PIN** (4 digits, stored as Argon2id with per-user salt and lockout — see `security.md`). Creates `installation` row (tenant id), `admin` role.
6. **Backups**: default daily 22:00 + before every update; folder chosen by user (suggest external drive); AES-256 encrypted `pg_dump -Fc` + SHA-256 + automatic test-restore into a temp DB weekly; retention 14 daily / 8 weekly / 12 monthly.
7. **Shortcuts**, Windows Firewall rule (deny inbound to 5433), Start-menu entry, uninstaller that **never deletes `pgdata` or backups** without a typed confirmation.
8. **Launch**: app starts local API, waits for DB readiness, shows login.

### 11.3 Safe updates

1. App detects a new version (manual file in v1; signed update feed later).
2. Create `pre_update` backup (verified by checksum) — abort update if it fails.
3. Stop API → apply new binaries → run **forward-only, transactional migrations** (`schema_migrations`) → start API → smoke test (health + read count).
4. On failure: automatic rollback of binaries, restore of the pre-update backup is offered with one click; logs saved to `C:\ProgramData\<Product>\logs`.
5. Never edit applied migrations; add new ones. Migrations must be backwards-compatible with the previous app version for one release (expand → migrate → contract).

### 11.4 Restore procedure (documented for support)
Stop API → `pg_restore` the chosen verified backup into a *new* database → run integrity checks (trial balance, stock vs movements, party balances) → swap names → start API → audit entry `restore`.

### 11.5 Support tooling
Diagnostics button: collects app log, migration version, PostgreSQL log tail, disk space, last backup status — **without** personal data — into a zip.

---

## 12. Coding standards & acceptance criteria

### 12.1 Standards
* TypeScript strict; ESLint + Prettier; no `any` in domain code; money as integer minor units or `decimal.js` — **never JS floats**; DB `NUMERIC` ↔ string.
* All SQL parameterised; no string concatenation; repositories only. Dynamic identifiers only via allow-lists.
* Input validation with zod on every endpoint; reject unknown fields.
* Each business operation = one DB transaction in `services/`; set `app.user_id` and (if editing) `app.edit_approval_id` via `SET LOCAL`.
* Conventional commits; ADR for every architectural decision; migrations reviewed like code.
* Tests: domain unit tests ≥ 90 % branch coverage for money logic; DB tests for triggers; e2e for the scenarios in §18 of `details`. **Fixtures are synthetic and labelled `sample`**, never the customer's real data in the repo.
* Logging: structured JSON; never log passwords, PINs, tokens, full payloads of financial documents.

### 12.2 Acceptance criteria (summary; full list in `todo.md`)
1. Workbook totals reproduced exactly by the importer (§9.7).
2. Booking → partial delivery → invoice with carried balance → driver cash → customer statement scenario from `details` §18 passes end-to-end.
3. Trial balance difference is always 0.00; every approved document has a balanced journal entry.
4. Accountant account cannot edit/delete an approved document by UI **or** by direct SQL as `erp_app` without a valid approval.
5. App runs with the network cable unplugged; install → backup → restore verified on a clean VM.
6. No secret in logs, installer, repo or config in plain text.
7. All five requested documents agree with each other and with `database.sql` (Stage 6 review recorded in `todo.md`).

---

## 13. Assumptions and open questions

### 13.1 Assumptions (A-*) — each can be overturned by the owner
| # | Assumption | Basis |
|---|---|---|
| A-1 | Product code letters are category groups (derived, not named). | Codes in settings |
| A-2 | Price `0` in settings means “no default price set”; stored as 0 until confirmed. | 31 of 42 products are 0 |
| A-3 | One company per installation; branches (مقرات) are created in the setup wizard — the workbook contains none. | Workbook has no branch concept |
| A-4 | Sub-customers (علاء نمنم, محمد عبدالناصر توقه) are end-customers of the agent عز الدين / labelled sections; modelled by `parent_party_id` + `party_ledger_sections`. | D-column names in customer sheet |
| A-5 | Week = Friday→Thursday. | Weekly sheet headers |
| A-6 | Employee daily rates come from the weekly sheet when settings is blank; both are imported for review. | محمد اوزو 250 vs blank |
| A-7 | Currency EGP, no VAT in v1 (none in templates). | Templates |
| A-8 | Attendance fraction allowed range 0–2 (workbook uses 0, 0.5, 1). | Workbook |
| A-9 | Accountant permissions: operational create/approve, **no** employee/payroll edit, no price-catalogue edit. | `details` §16 is silent on these |
| A-10 | Handling/loading fee (المشال والتحميل) is revenue; chart of accounts is a **template** needing an accountant's approval. | `details` §10 |

### 13.2 Open questions (Q-*) — please answer before Phase 2
* **Q-1** Should a booking create a customer debt at booking time (workbook behaviour) or only at delivery (`details`)?
* **Q-2** What does price 0 mean for the 31 zero-price products?
* **Q-3** معاذ رمضان: are the equal “paid” amounts (387,570) a netting between his purchases from you and sales to you, or a duplicate?
* **Q-4** Import full transaction history, or opening balances only per customer/supplier/employee?
* **Q-5** Who confirms the 55 text dates and the suspicious supplier date 11/12 vs 12/11?
* **Q-6** Is handling/loading (المشال والتحميل) company revenue or pass-through cost paid to labourers?
* **Q-7** Will an accountant approve the template chart of accounts and opening balances? Who is the external accountant?
* **Q-8** Inventory costing: weighted average (proposed) or FIFO?
* **Q-9** Real branch list (names, number of cashboxes, banks) and opening stock per branch?
* **Q-10** Exact invoice paper size/format and whether VAT/tax-ID must appear.
* **Q-11** Are the three credit-balance customers (−720,000) deposits against future bookings (should become orders) or unapplied cash?
* **Q-12** Do drivers collect money on delivery today (workbook shows no driver data)? Which drivers/vehicles exist?

---

## 14. Stage 6 consistency review (documentation ↔ business logic ↔ SQL)

| Check | Result |
|---|---|
| Every workbook entity has a table/column | Yes — see mapping below |
| Every `details` section has a home | Yes; new-scope tables flagged |
| SQL references (FK order) | Verified by script — no forward references |
| SQL executes | **Not verified** (no PostgreSQL in authoring environment) |
| Numbers in this document | Recomputed from cached workbook values by script |

Mapping: customers sheet → `parties`, `orders`, `order_lines`, `sales_invoices(+lines)`, `payments`, `payment_allocations`; suppliers sheet → `parties`, `purchase_invoices`, `payments`; settings → `units`, `products`, `employees`, `equipment`; weekly/monthly employee sheets → `attendance`, `employee_transactions`, `payroll_*`; equipment sheet → `equipment_expenses`; templates → document layouts + `document_sequences`.

**Stage 7:** the roadmap above awaits owner approval and the answers to Q-1…Q-12 before major implementation begins.
