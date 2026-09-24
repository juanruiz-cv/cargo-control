# ODD Feature Document — DB layer execution (local Supabase)

## Objective

Apply the versioned `supabase/migrations/` (0001–0006, schema + RBAC + auth helpers + RLS + views + triggers) to a real local Supabase stack and verify the result against `docs/architecture/database.md`.

## Why

The repository contains the full app but the database layer was never executed: verified only statically (T19). The user chose "Instalar todo local": Docker Desktop + Supabase CLI + local stack + `supabase db push`, then verify.

## Scope

- Local tooling: Supabase CLI (npm global), Docker Desktop (winget), WSL2 backend.
- `supabase init` (config.toml) without touching `migrations/`.
- `supabase start` local stack; apply 0001–0006.
- Fix the concrete schema bug surfaced by the first apply attempt.
- Verify: migration list applied, tables/views/policies vs docs.

## Task checklist

- [x] T1 — Install Supabase CLI 2.117.0 (npm) — evidence: `supabase --version`
- [x] T2 — Install Docker Desktop 4.91.0 (winget) — evidence: engine up, CLI 29.8.0
- [x] T3 — `supabase init` — created `supabase/config.toml`, migrations untouched
- [x] T4 — Fix 0001 FK type bug: `item_lots.created_via_movement_id uuid` → `bigint`
      (movements.id = bigint identity; docs database.md §534 mirrored the same typo)
- [x] T5 — Start local stack and apply migrations 0001–0006
- [x] T6 — Verify: `supabase migration list` + sanity queries vs docs (66 RLS policies, views v1–v8, triggers)

## Verification evidence (final, local stack 127.0.0.1:54321)

- `supabase start` OK — stack: API 54321, DB 54322, Studio 54323. Keys locales (publishable + secret) solo via `supabase start` o `web/.env.local`; nunca commitear (GIT-AS-5).
- `supabase migration list --local` → 0001–0006 applied; `supabase_migrations.schema_migrations` = 6 versions.
- 25 base tables in `public`; 66 RLS policies (matches T19 final count); 9/9 views from 0005; 18/18 triggers from 0006 (remaining 7 are storage/auth platform).
- Roles anon/authenticated/service_role present; helpers has_permission, has_role, movement_kind_permitted, handle_new_auth_user present.

## Route declaration

- T1–T3 inline (tooling), triggers: none.
- T4 inline: 2 mechanical one-token edits (writer trigger not crossed: trivial, understood).
- T5–T6 inline: CLI + read-only psql checks (per-action tools).