# Cargo Control — Supabase migrations

Versioned SQL migrations for the Cargo Control data layer, generated from the
source-of-truth documentation in `docs/` (see "Sources" below). The database
is **PostgreSQL 15+** (Supabase) — no extensions are created; `gen_random_uuid()`
is core PostgreSQL since 13.

## File order

Apply in numeric order strictly (later files reference objects created
earlier):

| File | Content |
| ---- | ------- |
| `0001_schema.sql` | 25 business tables + constraints + indexes (already includes `checks` for enum-style columns; append-only spines use `bigint identity`) |
| `0002_rbac_seed.sql` | RBAC catalog seed: 7 roles, 20-permission catalog, roles↔permissions matrix (77 rows) |
| `0003_authorization_helpers.sql` | `has_permission`, `has_role`, `movement_kind_permitted`, `handle_new_auth_user` + `auth.users` signup trigger |
| `0004_rls.sql` | Row Level Security on every business table (default deny) + 66 policies |
| `0005_views.sql` | Derived read-side views (`security_invoker`, RLS applies): `location_occupancy`, `station_queue`, `hold_open`, `dashboard_metrics`, `dashboard_series_*`, `dashboard_occupancy_snapshot` |
| `0006_triggers.sql` | Shared `updated_at` trigger, ADR 0003 deferred quantity-balance constraint trigger, ADR 0006 capacity guards + `capacity.set` audit trigger |

Apply via `supabase db push` (local link) or in order through the Supabase
SQL editor. There is no demo/sample data — the repo doctrine forbids seeding
the real path (operational-dashboard.md §No fake data); any future demo uses
an isolated, clearly-labeled channel.

## Prerequisites & assumptions

- **`auth` schema** must exist (Supabase standard). `auth.users` drives the
  `handle_new_auth_user` trigger creating `public.users` profiles.
- **No extensions** are required (no `citext`, no `pgcrypto`).
- **Service role / engine ownership**: `SECURITY DEFINER` objects (helpers in
  0003, triggers in 0006) run as their owner; RLS on `audit_log` has no
  INSERT policy by design — writes happen through the documented
  trigger/engine path only.
- **`app.actor_id` session GUC**: set by the Edge Function after auth; used
  by the audit trigger (`locations_capacity_audit`) to attribute `capacity.set`
  rows. Identity is never trusted from the client body.
- **Movement boundary**: `movements`/`movement_items`/operations rows are
  written by the movement engine (Edge Function), not by client INSERTs.
  RLS only gates *who may* insert a kind (via `movement_kind_permitted`); the
  engine enforces the state protocol (holds freeze lots, balance, etc.).

## Sources of truth (docs/)

- Schema/DDL, indexes, rename map: `docs/architecture/database.md`
- RLS matrix: `docs/security/rls.md` — RBAC: `docs/security/rbac.md`
- Authorization helpers & kind→permission map: `docs/security/authorization.md`
- Occupancy view + capacity invariants (I1–I7): `docs/domain/capacity-occupancy.md`, ADR 0006
- Quantity balance invariant: ADR 0003 — Audit: ADR 0014 — Movement spine: `docs/architecture/movement-engine.md`
- Station queues / holds: `docs/architecture/special-areas.md` — Dashboard aggregations: `docs/architecture/operational-dashboard.md`

Contradictions found between sources, and how each was resolved, are
documented inline in the affected migration header blocks (0001 §timeline
index, 0004 §cargo.transfer/operator, §locations writes, §item_lots writes).

## Verification

Migrations were **not executed** in this repository (no Supabase CLI / Docker
/ `psql` available in the authoring environment); they were verified
statically (structure review, identifier cross-checks, counts). Run them
against a scratch project before the first real deploy.

Static audit (T19 Final audit, 2026-09-23) cross-checked:
- 0001: 25 tables; every table referenced by policies/views/triggers exists.
- 0002: 7 roles, 20 permissions, 77 role_permissions rows (admin 20 /
  supervisor 19 / operator 13 / scanner_operator 5 / scale_operator 5 /
  auditor 8 / viewer 7) — matches rbac.md §3.
- 0003: helpers defined once (`has_permission`, `has_role`,
  `movement_kind_permitted`, `handle_new_auth_user`); all permissions used
  by 0004 exist in the 0002 catalog.
- 0004: 66 `create policy` statements (was misreported as 67; fixed); all 25
  tables have RLS enabled.
- 0005: 10 derived views (`security_invoker`) over tables existing in 0001.
- 0006: 4 guard/audit/balance functions + `set_updated_at`; 19 trigger
  statements on tables existing in 0001.