# ADR 0007 — Identity & Access v2: Supabase Auth + permission-driven RLS

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web`, data schema, security layer

## Context

Fase 6 requires authentication (login, logout, session persistence, password
recovery, session expiration, protected routes) backed by **Supabase Auth**,
and an RBAC with seven roles (ADMIN, SUPERVISOR, OPERATOR, SCANNER_OPERATOR,
SCALE_OPERATOR, AUDITOR, VIEWER) against an explicit permission catalog
(truck/cargo/warehouse/scanner/scale/quarantine/seizure/audit).
Permission decisions must never rely on the React client alone — RLS and
server-side logic must enforce them.

The Fase 3 schema already has `users/roles/permissions/user_roles/
role_permissions` (D5) but with five roles (`guard` included) and RLS
policies conceived as a per-role matrix. The new catalog adds roles
(`viewer`; `guard` splits into scanner/scale operators), a canonical
permission list, and requires a mechanism that lets grants change as **data**
without editing policies.

## Decision

1. **Supabase Auth owns identity.** `auth.users` is the identity store;
   `public.users` (profile) is created by a `on_auth_user_created` trigger,
   linked 1:1 via `auth_user_id`. Client session (Supabase JS / SSR cookies)
   is a UX concern only — the JWT is the transport, RLS is the judge.

2. **Permission-driven RLS.** Two helpers, used by every policy:

   - `public.has_permission(_code text) returns bool` — true when the caller
     (`auth.uid()`) belongs to an org whose effective roles grant `_code`.
   - `public.has_role(_role text) returns bool` — direct role check, only for
     tenant-level tables (organizations, RBAC tables).

   Policies no longer hardcode role columns; grants are seeded rows in
   `role_permissions`. Changing who can do something is a data change,
   not a policy edit.

3. **Role set (schema codes lowercase, UI labels uppercase):**
   `admin | supervisor | operator | scanner_operator | scale_operator |
   auditor | viewer`. Migration from Fase 3: `guard` → `scanner_operator`
   + `scale_operator`; `viewer` is new. Old role code `guard` is retired.

4. **Permission catalog (20 codes):** `truck.read/create/update/exit`,
   `cargo.read/create/update/transfer`, `warehouse.read/configure/transfer`,
   `scanner.read/create`, `scale.read/create`, `quarantine.read/create`,
   `seizure.read/create`, `audit.read`. Seeds live in `permissions` and the
   role matrix in `role_permissions` (see `docs/security/rbac.md`).

5. **RLS per table** uses the helpers (full matrix in `docs/security/rls.md`):
   - Business tables: `SELECT ... USING has_permission(<read code>)`;
     writes per catalog (no DELETE for business records — soft-lifecycle).
   - Movement spine: INSERT only, **kind → permission map**
     (`discharge/split/store/correction` → `cargo.update`;
     `transfer/load_out` → `cargo.transfer`; `scan_in/out` →
     `scanner.create`; `scale` → `scale.create`; `quarantine` →
     `quarantine.create`; `seizure` → `seizure.create`; `egress` →
     `truck.exit`; `release` → the originating hold's create permission);
     no UPDATE/DELETE policies.
   - `audit_log`: SELECT for `audit.read`; INSERT trigger-only (service role
     via security-definer function), never client-writable.
   - Views: `security_invoker = true` so base-table policies apply.

6. **Server-side enforcement (defense in depth):** Edge Functions decode the
   Supabase JWT (verify + `auth.uid()`), set the `app.actor_id` GUC (Fase 5
   audit), and re-check the same permission codes (a `require_permission`
   wrapper) before business logic — RLS is the last line, the function is the
   first. Client route guards are UX only and never an authority.

## Consequences

- Grant changes are data migrations (seed/revoke rows); policy count stays
  stable and small.
- The old five-role RLS matrix is replaced; guard behavior is preserved and
  narrowed per role (scanner/scale operators keep their domain, lose the rest).
- Client-side checks can no longer be the trust boundary — a caller without
  the permission gets an empty set or a 403 regardless of UI state.
- `has_permission` is org-scoped by construction (the caller's own org), so
  multi-org isolation is structural.
- Cost: every RLS check runs a small join chain
  (users → user_roles → roles → role_permissions → permissions); acceptable
  at MVP scale, cached per statement/transaction if needed later.

## Files

- Auth flows: `docs/security/authentication.md`
- Roles/permissions: `docs/security/rbac.md`
- Enforcement: `docs/security/authorization.md`
- Policy matrix: `docs/security/rls.md`
- Tests: `docs/qa/security-tests.md`
- Schema: `docs/architecture/database.md` §4.4 (seeds)