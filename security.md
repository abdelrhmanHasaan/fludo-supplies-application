# security.md — Security Engineering Document

Scope: offline-first Windows desktop ERP with a local PostgreSQL database per customer (v1) and a future secure sync API to a central server (v2+).
Status: **design only.** No control below is claimed implemented or tested until the matching box in `todo.md` is checked.

---

## 1. Assets and security goals

| Asset | Why it matters | Goal |
|---|---|---|
| Financial records (invoices, payments, journals, balances) | Direct money; basis of customer/supplier claims | Integrity > availability > confidentiality |
| Customer/supplier/employee personal data (names, phones, debts, wages) | Privacy, social/commercial harm | Confidentiality |
| Credentials (passwords, manager PIN, DB passwords, sync tokens) | Gateway to everything | Never recoverable, never logged |
| Audit trail | Evidence for disputes and fraud detection | Tamper-evident |
| Backups | Copy of everything | Encrypted, verified, access-restricted |
| Application binaries/installer | Supply-chain and licensing | Signed, integrity-checked |

Primary insider risk (from `details` §16): an **accountant altering or deleting approved transactions** to hide theft. Second: **PC theft / unauthorised Windows user** reading the database or backups. Third (future): **cross-tenant leakage** on the central server.

## 2. Threat model (STRIDE, by actor)

Actors: A1 owner/admin, A2 accountant, A3 other Windows user on the same PC, A4 malware on the PC, A5 LAN attacker, A6 thief with the disk/PC, A7 internet attacker (future sync), A8 malicious update/supply chain, A9 a customer attacking the vendor's server (future).

| ID | Threat | STRIDE | Actor | Mitigation (summary) |
|---|---|---|---|---|
| T1 | Accountant edits/deletes an approved invoice or payment | T, R | A2 | RBAC + status lock + DB triggers (`trg_lock_guard`) + manager approval record + audit |
| T2 | Accountant guesses/obtains the manager PIN | E | A2 | PIN only valid for a *manager's own* authenticated session or approval prompt; Argon2id; lockout; rate-limit; approval bound to one record and 5 min |
| T3 | Direct SQL access with `psql` bypasses app rules | T, E | A3, A4 | DB listens on localhost; `erp_app` role has DML only; triggers enforce locks regardless of client; secrets in DPAPI |
| T4 | Reading backups or the data folder | I | A3, A6 | AES-256 encrypted backups; NTFS ACL; optional BitLocker recommendation; no plaintext secrets |
| T5 | SQL injection through search boxes/fields | T, I | A2 | Parameterised queries only, allow-listed sort/filter columns, zod validation |
| T6 | Local API abused by another local process | S, E | A3, A4 | API on `127.0.0.1` random port + per-launch bearer token held only in the Electron main process; CORS off; Host header check |
| T7 | Electron renderer compromise (XSS → Node) | E | any content | `contextIsolation`, `nodeIntegration=false`, sandbox, strict CSP, no remote content, preload exposes a minimal typed bridge |
| T8 | Credential stuffing on login | S | A2/A3 | Argon2id, lockout with backoff, generic error text, audit of failures |
| T9 | Tampering with audit log | T, R | A2 | Append-only triggers, hash chain (`prev_hash`,`row_hash`), periodic anchor exported in backups, `erp_app` cannot truncate |
| T10 | Backup deletion/ransomware | D | A4 | Multiple generations, off-PC copy recommended, verify checksum + weekly test-restore, backup role read-only |
| T11 | Malicious or broken update | T | A8 | Code-signed installer/updates, hash verified, `pre_update` backup, rollback |
| T12 | Data corruption by crash/power loss | T, D | — | PostgreSQL WAL + `fsync=on`, single transaction per operation, `synchronous_commit=on`, UPS advice, integrity checks |
| T13 | Replay/duplication of sync messages | T | A7 | Idempotency keys, monotonic `row_version`, server dedupe |
| T14 | Cross-tenant access on central server | I | A9 | Tenant id from the authenticated credential, never from payload; row-level security; per-tenant keys |
| T15 | Sensitive data in logs/crash dumps | I | — | Redaction list, no payload logging, log rotation with ACL |
| T16 | Clock tampering to bypass period locks/expiry | T | A2 | Use DB `now()`; closed periods enforced in DB; detect backwards clock jump (audit) |
| T17 | Printing/exports leak data | I | A2 | Permission `reports.export`; export events audited; watermark optional |

## 3. Attack surfaces

1. Windows login & file system (data dir, backups, config, logs).
2. PostgreSQL service port (localhost 5433).
3. Local HTTP API.
4. Electron app (renderer, preload, IPC).
5. Installer / updater.
6. Excel importer (untrusted workbook → formulas, macros, huge files).
7. Backup/restore tooling.
8. Report/PDF engine (HTML injection through names/notes).
9. Future: sync client and the central API.

## 4. Security architecture

```
Electron renderer (no Node)  ──IPC(preload, typed)──▶ Electron main ──Bearer token──▶ Local API (127.0.0.1)
                                                                                          │ role erp_app (DML)
                                                                                          ▼
                                                                                  PostgreSQL (localhost only)
Installer ─ role erp_owner (DDL, migrations only, discarded after run)      Backup job ─ role erp_backup (read-only)
```

Principles: least privilege (three DB roles), defence in depth (checks in UI, API, **and** database), fail closed, secure by default, no secrets in source or logs, everything privileged is audited.

## 5. Authentication

* Users stored in `app.users`; passwords hashed with **Argon2id** (memory ≥ 64 MiB, t ≥ 3, p = 1, unique salt, optional pepper from DPAPI). Never reversible encryption.
* Password policy: ≥ 12 characters, block top-10k breached/common passwords offline list; forced change on first login (`must_change_password`).
* Lockout: 5 failures → exponential delay, 10 → lock 15 min (`failed_attempts`, `locked_until`); generic message “اسم المستخدم أو كلمة المرور غير صحيحة”.
* Session: short-lived access token (15 min) + idle timeout 15 min with lock screen; token kept in main-process memory only; logout wipes it; no tokens in `localStorage`.
* Re-authentication (password) required for: approving edits, user/role changes, restore, export of full customer lists, changing PIN.
* First administrator created by the installer over a local-only channel; no default accounts or default passwords anywhere.

### 5.1 Manager approval PIN (specification `details` §16)

The specification asks for a **4-digit password** chosen by the owner. A 4-digit secret has only 10,000 possibilities, so it is acceptable **only** with these compensating controls (mandatory):

1. Stored as Argon2id hash in `users.manager_pin_hash` (per-user salt). Never shown, never logged, never in audit payloads.
2. Verified **only** for a user holding `approvals.grant`, in a request that also carries a valid session of that manager **or** a fresh manager password re-entry. An accountant typing the PIN into their own session is *rejected* (the spec itself prefers approval through the manager's account; this satisfies it).
3. Rate limit: 3 wrong PINs → 5 min lock; 10 in 24 h → manager account locked and alert recorded.
4. The grant is a row in `edit_approvals`: bound to **one table + one record id**, reason mandatory, expires in 5 minutes, single record. The DB rejects edits without a matching live grant (`app.assert_edit_approval`).
5. Every grant, denial, use and failure is audited with approver, requester, reason, time.
6. Recommended upgrade (tip.md): replace the PIN with a longer manager password or Windows Hello/TOTP while keeping the same approval flow.

## 6. Authorisation (RBAC)

* Tables: `roles`, `permissions` (`module.action`), `role_permissions`, `user_roles`. Default roles: `admin`, `accountant`.
* Enforced in the API for every endpoint via a central policy function (deny by default), **and** hidden in UI (UI hiding is cosmetic only).
* Sensitive permissions: `records.edit_approved`, `approvals.grant`, `periods.close`, `backup.manage`, `audit.view`, `users.manage`, `settings.manage`, `reports.export`.
* Separation of duties: the user who requested an edit may also approve only if they are an admin; the audit shows both ids. Accountant never has `approvals.grant`.
* Row-level scoping by branch is optional (v2) via `branch_id` and policy.

## 7. Database security

| Control | Detail |
|---|---|
| Network | `listen_addresses='localhost'`; non-default port; Windows Firewall blocks inbound; never exposed to the internet or LAN |
| Auth | `scram-sha-256` only; `pg_hba.conf` accepts `127.0.0.1/32` for named roles; no `trust`, no `postgres` superuser use by the app |
| Roles | `erp_owner` (DDL, migrations at install/update only), `erp_app` (DML on schema `app`, `USAGE` on sequences, no DDL, no `COPY ... PROGRAM`, no superuser), `erp_backup` (read-only) |
| Privileges | `REVOKE ALL ON SCHEMA public FROM PUBLIC`; explicit `GRANT` only; no ownership by `erp_app` |
| Integrity | FK, CHECK and generated columns in `database.sql`; balanced-journal check on posting; posted journal and stock ledger immutable; closed-period guard; approved-document lock triggers; append-only hash-chained `audit_log` |
| Defence against app bugs | Locks are triggers, so a buggy or malicious client still cannot silently edit approved data |
| Context | App sets `SET LOCAL app.user_id` and `app.edit_approval_id` per transaction; DB audit trigger records them |
| Encryption at rest | PostgreSQL has none natively → recommend BitLocker on the data drive (installer warns if off); backups are always encrypted at application level |
| Encryption in transit | Local socket/loopback; if TLS is enabled for the loopback it is a bonus, not a requirement |
| Logging | `log_connections`, `log_disconnections`, `log_min_duration_statement`; no statement text with parameters |
| Hardening | `fsync=on`, `full_page_writes=on`, `synchronous_commit=on`, `ssl` optional, `log_line_prefix` with user/db |

Known limit (documented honestly): anyone with **Windows administrator** rights on the PC can stop the service, read the data directory or replace binaries. The application cannot defend against a local admin; mitigations are BitLocker, backups to a second location, hash-chain anchors, and operational policy (the accountant must not be a local admin).

## 8. Application security

* **Input validation**: zod schemas per endpoint, max lengths, numeric ranges (money `0 ≤ x < 10^12`, quantities > 0), reject unknown keys, normalise Arabic digits and whitespace.
* **Output encoding**: React escapes by default; PDF/HTML templates escape all dynamic text; no `dangerouslySetInnerHTML`.
* **SQL injection**: parameter binding only; sort/filter identifiers from allow-lists; no dynamic SQL except the vetted trigger helpers in `database.sql` (identifiers via `%I`).
* **Electron**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, CSP `default-src 'self'`, block navigation and `window.open`, disable remote module, no `eval`, pinned Electron version updated on security releases.
* **Local API**: bind `127.0.0.1`, random port, per-launch token, verify `Host` and `Origin`, no CORS, request size limit, per-route rate limit.
* **File handling**: importer opens workbooks read-only in a worker process, size/row limits, ignores macros/external links, formulas never evaluated by the app; attachments stored under ACL'd folder with randomised names and content-type check.
* **Secrets**: DPAPI (`CryptProtectData`, machine scope) for DB passwords and backup key; key escrow instruction to the owner printed once at install (paper copy); no secrets in env files, installer logs, crash reports, or repo (secret-scan in CI).
* **Dependencies**: lockfile, `npm audit`/OSV scan in CI, SBOM per release, no postinstall scripts from unknown packages.
* **Error handling**: Arabic user messages, correlation id; stack traces only in local log.
* **Audit logging**: login/logout/failure, permission denied, create/approve/cancel of financial documents, every approval event, edits (before/after JSON), user/role changes, backup/restore, exports, settings, period close, importer runs. Hash chain verified on demand and at startup (alert on break).
* **Money integrity**: no floats; `NUMERIC(16,2)`; server recomputes every total from lines — client totals are ignored.

## 9. Backup & recovery security

* `pg_dump -Fc` → compress → **AES-256-GCM** (key from DPAPI-protected secret, with owner-printed recovery key) → SHA-256 manifest → verified by an automatic **test restore** weekly (`backup_log.status = 'verified'`).
* Stored in a user-chosen folder (recommend external drive/cloud-synced encrypted folder); ACL restricts to SYSTEM + service account + admin.
* Restore requires admin re-authentication + typed confirmation; a `pre_restore` backup is taken first; audit entry written.
* Retention 14 daily / 8 weekly / 12 monthly; alert when the last good backup is older than 48 h; alert on low disk.

## 10. Future API and synchronisation security (design now, build later)

* **Transport**: HTTPS only, TLS 1.2+ (1.3 preferred), certificate pinning option, HSTS.
* **Authentication**: per-installation credential (mTLS client certificate or signed JWT with short TTL) issued during activation; refresh via rotating tokens; revocation list on the server; license binding.
* **Tenant isolation**: `tenant_id` derived from the credential (never trusted from the body); PostgreSQL **row-level security** on every central table (`USING (tenant_id = current_setting('app.tenant_id')::uuid)`); per-tenant rate limits; optional per-tenant encryption keys.
* **Message integrity**: payload signed (HMAC/Ed25519) with a per-installation key; idempotency key (`tenant:table:id:version:op`, already generated by `trg_outbox`) required on every item; server stores processed keys (`sync_inbox` mirror).
* **Protocol**: batch push (`POST /sync/push`, ≤ N items, ordered by outbox id), pull by cursor (`GET /sync/pull?cursor=`); at-least-once delivery with idempotent apply; exponential backoff with jitter (1 s → 15 min cap), dead-letter after N attempts (`sync_outbox.status='dead'`) with alert.
* **Conflicts**: `row_version` optimistic concurrency; financial documents are append-only so conflicts are limited to master data (last-writer-wins + `sync_conflicts` record + manual resolution for prices/names). Ledger rows never overwritten.
* **No direct DB-to-DB copy**, no exposed PostgreSQL, no shared DB credentials. Central DB is reachable only by the API tier.
* **Privacy**: minimise what leaves the PC (configurable), encrypt sensitive columns in transit payloads, data-processing agreement with customers.
* **Abuse**: payload size caps, schema validation per entity, replay window, anomaly alerts (sudden volume, version going backwards).

## 11. Security testing procedures

1. **Static analysis**: ESLint security rules, Semgrep, TypeScript strict, SQL linting (no string-built SQL).
2. **Dependency/supply chain**: `npm audit`, OSV-Scanner, license check, SBOM, installer signature verification.
3. **Secret scan**: gitleaks on repo and on built installer/log samples.
4. **DB tests (pgTAP/SQL)**: for each lock trigger, attempt update/delete of approved invoice/payment as `erp_app` (must fail), with expired/other-record approval (must fail), with valid approval (must pass and be audited); unbalanced journal post (must fail); update posted journal (must fail); write into closed period (must fail); delete `audit_log`/`stock_movements` rows (must fail); hash-chain verification and tamper detection.
5. **API tests**: authorization matrix (every endpoint × role), IDOR checks, mass-assignment, validation fuzzing (boundary numbers, Arabic digits, RTL marks, very long strings).
6. **Authentication tests**: lockout, timing equivalence for unknown vs known user, PIN brute-force limits, token expiry, session fixation.
7. **Electron tests**: attempt Node access from renderer, navigation to external URL, CSP violations, IPC fuzzing.
8. **Injection tests**: `' OR 1=1 --`, `; DROP`, XSS payloads in names/notes/addresses → rendered inert in UI and PDF.
9. **Importer tests**: malformed/huge xlsx, zip bombs, external links, formula injection (`=cmd|...`) in cells → treated as text, never executed; CSV export neutralises leading `=,+,-,@`.
10. **Backup/restore drills**: corrupt a backup (must be detected), restore on a clean VM, wrong key (must fail), power-cut during backup.
11. **Chaos/integrity**: kill process mid-transaction → no partial documents; compare `Σ journal`, `Σ stock_movements`, party balances against recomputation.
12. **Update tests**: tampered installer rejected; failed migration rolls back and restores.
13. **Pen-test** (external, before commercial release) using §12 checklist.

## 12. Penetration-testing checklist

**Windows/host**
- [ ] Data dir, config, secrets, backups not readable by standard users.
- [ ] Services run as least-privileged accounts; unquoted service paths absent; installer folder not user-writable (DLL hijack).
- [ ] No sensitive data in `%TEMP%`, crash dumps, shell history, event logs.

**PostgreSQL**
- [ ] Port not reachable from another machine (`nmap` from LAN).
- [ ] No `trust`/`md5` entries; default `postgres` password unusable; `erp_app` cannot `CREATE`, `COPY PROGRAM`, `ALTER ROLE`.
- [ ] Direct `UPDATE` of approved invoice as `erp_app` is blocked; audit row appears when approved path is used.
- [ ] Hash chain breaks when a row is altered by a superuser (detected at startup).

**Local API**
- [ ] Requests without/with wrong token rejected; token not reusable from another process.
- [ ] Every endpoint enforces RBAC; accountant cannot call approval/edit/settings/user endpoints.
- [ ] IDOR on ids (UUID guessing, but still check ownership/branch rules).
- [ ] Rate limiting and lockout work; error messages leak nothing.

**Electron/UI**
- [ ] No Node APIs from renderer; DevTools disabled in production; CSP enforced.
- [ ] Stored XSS via customer name/notes in grid, print preview, PDF.
- [ ] Clipboard/export of CSV safe against formula injection.

**Business-logic abuse**
- [ ] Negative/zero qty or price, price overridden to 0, huge numbers, rounding exploitation.
- [ ] Back-dating into closed periods; editing `invoice_date` after approval; deleting numbering gaps.
- [ ] Double submit / concurrent approval of the same invoice (idempotency & row locks).
- [ ] Payment allocated above invoice remaining; allocation to cancelled invoice.
- [ ] Reservation larger than stock or negative stock policy bypass.

**Backups/update**
- [ ] Backup readable only with key; tamper detected; restore needs admin + confirmation.
- [ ] Modified installer/update refused (signature).

**Future sync**
- [ ] Tenant A token cannot read/write tenant B (RLS tests); replayed batch is a no-op; version regression rejected; oversized/invalid payload rejected; TLS downgrade fails.

## 13. Expected security results (release gate)

* 0 critical / 0 high findings open; medium findings have owner and date.
* An accountant, by any UI/API/SQL route available to them, cannot change or delete an approved record without a manager approval; every attempt is logged.
* No secret recoverable from repo, installer, logs, or config.
* PostgreSQL not reachable off-machine; verified by port scan.
* Backup of a production-like dataset restores byte-for-byte equal business totals on a clean VM.
* Hash-chain verification detects any manual audit tampering.
* Documented residual risks accepted by the owner: local Windows administrator, physical theft without disk encryption, weak 4-digit PIN if the owner refuses the compensating controls.
