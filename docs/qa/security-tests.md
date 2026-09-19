# Security — Test Specification (Fase 6 / Prompt 07)

Executable as SQL scripts (Database layer: RLS/constraints) and E2E cases
(`docs/qa/strategy.md`). Marked **[E2E]** cases run later with Playwright
against Supabase local; everything else runs against the database layer with
two seeded test users and orgs.

Fixture: org `o1` profile `u_admin` (admin), `u_op` (operator),
`u_scan` (scanner_operator), `u_scale` (scale_operator), `u_viewer` (viewer);
org `o2` profile `u_other` (operator). All expectations assume the `roles`/
`permissions`/`role_permissions` seeds from `docs/security/rbac.md`.

## A. Auth (Supabase Auth)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| S-01 | login with valid credentials | 200; access + refresh tokens issued; profile created by trigger `on_auth_user_created` |
| S-02 | login with wrong password | 400 invalid_credentials; no session |
| S-03 | logout | refresh token revoked; local tokens cleared |
| S-04 | refresh access token | new pair issued; old refresh token invalid (rotation) |
| S-05 | expired access token (JWT exp) | Edge Function rejects; 401; client redirected to `/login?returnTo=...` |
| S-06 | password recovery email | link delivered (GoTrue); visiting it reaches reset route; `updateUser(password)` succeeds |
| S-07 | reused recovery token | fails (one-time token) |
| S-08 | session persistence | reload SPA keeps session (localStorage); SSR cookie path works |
| S-09 | signup trigger | `public.users` row created with `auth_user_id`, org NOT self-assigned (provisioning hook) |
| S-10 | disabled profile | profile `status='disabled'` → helpers return false; all reads/writes denied (S-14) |

## B. Permission-driven RLS isolation

| ID | User | Action | Expected |
| -- | ---- | ------ | -------- |
| S-11 | u_admin | SELECT locations in o1 | all rows visible |
| S-12 | u_op | SELECT cargo lines in o1 | visible (`cargo.read`) |
| S-13 | u_other (o2) | SELECT o1 rows | **empty** (org isolation — no org_id in query can widen) |
| S-14 | u_viewer | INSERT cargo_manifest | **permission denied** (default deny; no insert code) |
| S-15 | u_op | INSERT truck row (`truck.create`) | OK |
| S-16 | u_op | `truck.exit` movement (egress kind) | **permission denied** (`truck.exit` not granted to operator; kind map) |
| S-17 | u_admin | egress movement | OK (`truck.exit`) |
| S-18 | u_scan | INSERT scanner_operation | OK (`scanner.create`) |
| S-19 | u_scan | INSERT scale_operation | **permission denied** (scale not granted) |
| S-20 | u_scale | INSERT scale_operation | OK (`scale.create`) |
| S-21 | u_op | INSERT movement kind `transfer` | OK only with `cargo.transfer`; kind `scale` → denied |
| S-22 | u_viewer | SELECT audit_log | **empty** (no `audit.read`); u_admin sees rows |
| S-23 | u_admin | INSERT audit_log directly | **permission denied** (trigger-only, no client policy) |
| S-24 | u_admin | UPDATE movements row | **permission denied** (append-only, no UPDATE policy) |
| S-25 | u_op | UPDATE locations capacity (configure) | **denied** (`warehouse.configure` is admin/supervisor) |
| S-26 | u_supervisor | UPDATE locations capacity | OK (configure) — capacity guard from Fase 5 still applies (10 000 → below occupancy ERROR) |
| S-27 | u_viewer | SELECT location_occupancy view | only base-table policy allows (`security_invoker`) — same rows as warehouse.read |
| S-28 | anonymous (no JWT) | any SELECT | empty (helpers return false; default deny) |

## C. Grant lifecycle

| ID | Scenario | Expected |
| -- | -------- | -------- |
| S-29 | grant `seizure.read` to scanner_operator via `role_permissions` row | station UI flag appears; RLS SELECT on seizure_operations now returns rows **without any policy change** |
| S-30 | revoke `cargo.transfer` from operator | transfer movements denied immediately; UI hides action (cosmetic) |
| S-31 | add new role `dispatcher` + its grants | works with zero policy edits (data-driven RBAC) |
| S-32 | `has_role('admin')` gate on `organizations` UPDATE | non-admin supervisor → denied |

## D. Server-side (Edge Functions) [E2E]

| ID | Scenario | Expected |
| -- | -------- | -------- |
| S-33 | call `save_layout` without JWT | 401 (function rejects) |
| S-34 | call `save_layout` with valid JWT lacking `warehouse.configure` | 403 (function authorizes, RLS would too) |
| S-35 | call movement endpoint with `kind=egress` as operator | 403 (kind map + truck.exit) |
| S-36 | forged `app.actor_id` in request body | ignored; GUC set from verified JWT; audit row records real actor |
| S-37 | disabled profile calls endpoint | 403 (helper-level status check) |

## Definition of done (this doc)

- RLS isolation (S-11..S-28) runs before/with any schema change
  (strategy.md rule: "RLS isolation tests are required before any schema change").
- Every permission code in the catalog has ≥ 1 positive and ≥ 1 negative case.
- Auth lifecycle (S-01..S-10) covered at the GoTrue API level; E2E markers
  wired into the Playwright suite when it lands.
- A failing case blocks the identity/access change.