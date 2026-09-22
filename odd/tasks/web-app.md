# ODD Feature Document — web-app

## Objective

Build the real Cargo Control web application (not a visual prototype) inside
this repository, using the existing documentation under `docs/` as the
primary source of truth: React + TypeScript + Vite + Tailwind CSS +
shadcn/ui + Lucide, with Supabase (PostgreSQL + Auth + RLS + Storage + Edge
Functions) as the data/auth layer.

## Problem being decided

The doctrine declared this repository **docs-only** (README, ADR 0021/0022:
business logic lives in Lovable host + Supabase, 4 separate repos). The
maintainer's latest decision (today) explicitly ordered building the app
REAL here, against this documentation. Contradiction resolved with priority
to the most recent decision and documented in ADR 0023. Business logic
stays decoupled from the host (Lovable independence preserved); the code
source now also lives in this repo until the maintainer moves it.

## Why

The maintainer wants a working, verifiable application whose data comes
from Supabase, with Auth, RBAC, RLS, dynamic operational map, functional
floor-plan editor, real movements, scanner/scale/quarantine/seizure,
audit and reports — with no mock replacing critical logic in production.

## Scope

- Frontend app under `web/`: Vite + React + TS + Tailwind + shadcn/ui + Lucide + Inter.
- Database as versioned SQL migrations under `supabase/migrations/` (schema + RLS + triggers + views), source of truth for the data layer.
- Services layer speaking Supabase via `supabase-js` with env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- For development only: an isolated DEMO adapter behind the same services interface, active only when env vars are absent, clearly marked DEMO, removable without touching UI/business logic. No secrets, no service-role keys in the browser, no real data in the repo (GIT-AS-5).
- Seed/demo data ONLY for development, clearly identified as DEMO.
- Docs updated for changes to database/security/architecture/domain/UX/business rules; ADR for important architectural decisions.

## Constraints

- Do NOT invent business rules that contradict the docs.
- Do NOT change documented architecture arbitrarily.
- Do NOT simplify business rules to save time.
- Do NOT replace real functionality with mocks in production paths.
- UI hides nothing that RLS does not enforce; security lives in RLS + server-side, never in button visibility.
- Stack is fixed by documentation (no technology change without justification + documentation).
- Data model follows `docs/architecture/database.md` (25 tables, `item_lots` as split — NOT `CargoSplit`; `layouts.version` as version — NOT `LayoutVersion`; `users` — NOT `UserProfile`).
- Movement engine is transactional (all-or-nothing), 15 kinds, idempotent via `operation_key`.
- Visual ≠ logistic: layout edits/publish/restore never write `movements`.
- Brand tokens, breakpoints, and UX rules per docs/brand + docs/ux + ADR 0016/0018 (tokens `--cc-*`, Inter, density, confirmations, optimistic-list rules).

## Authorized scope

Explicitly authorized by maintainer: full real implementation of the web
app in this repo, backend decoupled and connected later (SQL + code now,
Supabase project later). Delivery: work-unit commits on `feature/web-app`
per ADR 0021. PR/push/merge remain maintainer decisions.

## Delivery strategy

- `delivery_strategy`: ask-on-risk (default per ODD). Forecast far exceeds
  400 authored changed lines → when the running count crosses ~400, ask the
  maintainer once for the chain strategy (stacked-to-main |
  feature-branch-chain) via lossless prompt, then cache it.
- `chain_strategy`: **feature-branch-chain** (maintainer chose 2026-09-21).
  feature/web-app = tracker branch; PRs slice por fase targetan el branch
  previo; solo el tracker mergea a main. Pasado a sdd-prompt no aplica —
  ODD: registrar límites de slice en este doc al crear cada PR.
- **Slices creados 2026-09-22** (push + PRs a juanruiz-cv/cargo-control):
  PR #1 slice-1-foundation (main←1427ae0..54e0267, 11,952 L) · PR #2
  slice-2-data-auth (→slice-1, 6,807 L) · PR #3 slice-3-floorplan
  (→slice-2, 5,396 L) · PR #4 slice-4-trucks (→slice-3, 1,685 L) · PR #5
  slice-5-cargo (→slice-4, 2,911 L) · PR #6 slice-6-movement (→slice-5,
  2,379 L) · PR #7 tracker feature/web-app→main (DRAFT, 30,740 L,
  no-merge hasta integrar children). Todos con `size:exception` implícito
  por scaffold vendor/generado no divisible; budgets en body de cada PR.
- **INTEGRADO 2026-09-22**: revisados 6 slices (build+lint+tsc OK en commit
  exacto, diffs limpios), tracker PR #7 marcado ready vía GraphQL y merged a
  main (merge commit 8763440). PRs #1-6 cerrados con comentario de
  integración. `main` = 8763440 == feature/web-app. Branch feature/web-app
  continúa para T11+.
- `per-task heuristic`: ~400 authored changed lines per task; never a hard
  cap, never omit tests/docs to fit.

## Applicable checks (per task)

- `npm run build` (tsc + vite build) must pass in `web/`.
- `npm run lint` must pass (eslint config defined in scaffolding).
- Tests: Vitest suite; RLS/movement tests run against SQL in docs (asserted,
  documented); run actual tests where runnable without Supabase.
- `git ls-files` secret scan (GIT-AS-5): no `.env`, no keys tracked.

## Task checklist

| ID | Task | Path/route | Status |
| -- | -- | -- | -- |
| T1 | Document hosting contradiction & decision (ADR 0023 + odd mirror) | docs, inline | done (1427ae0) |
| T2 | Scaffold `web/`: Vite + React + TS + Tailwind + shadcn/ui + Lucide + Inter; modular folders (components/pages/hooks/services/types/lib/config/integrations); env template; health page | delegated composite | done (ade14b9, build+lint+spot OK, risk medium, verified) |
| T3 | Design system: CSS vars `--cc-*` (colors, typography, spacing, radii, z-index, breakpoints) + base UI components | delegated | partial — tokens + 18 primitivas en T2; faltan SearchInput/FilterBar/Combobox/DataTable/StatusBadge (se completan en fases de módulos) |
| T3 | Design system: CSS vars `--cc-*` from docs/brand (colors, typography, spacing, radii, z-index, breakpoints), base UI components (Button, Input, Select, Combobox, SearchInput, FilterBar, DataTable, Pagination, Badge, StatusBadge, Card, Dialog, Drawer, Tabs, Tooltip, Toast, Alert, ConfirmDialog, PageHeader, Breadcrumbs, EmptyState, LoadingState, ErrorState, Skeleton) | delegated | partial — tokens + 18 primitivas en T2; faltan SearchInput/FilterBar/Combobox/DataTable/StatusBadge (se completan en fases de módulos) |
| T4 | DB migrations: schema (25 tables, FKs, indexes, unique, triggers, enums) + RLS (default deny, 7 roles, 20 permissions) + views (occupancy, queues, dashboard) + auth trigger | delegated | done (54e0267; 25 tablas, 66 políticas, 9 views security_invoker, 15+3 triggers; static-verified — sin motor SQL local; risk medium, spot OK) |
| T5 | Domain TS types + services layer (supabase-js) + DEMO adapter (same interface, dev-only) | delegated | done (d070b4b; enums TS=CHECKs exactos spot-checked, services por módulo, factory selectora supabase/demo con warn; risk medium; build+lint pass) |
| T6 | Auth UI: login, logout, session persistence, password recovery, profile, protected routes, RBAC client helpers | delegated | done (7f29d08; LoginPage real+botón demo, AuthProvider+useAuth, RequireAuth/RequirePermission con returnTo, sidebar filtrado, /403, forgot+reset perfil read-only; mapa permisos verificado = authentication.md §Guard table; risk medium; build+lint+tsc pass) |
| T7 | Floor plan: Layout editor (canvas, grid, snap, zoom/pan, drag/resize/rotate, toolbar, properties, layers, minimap, undo/redo, version/publish) + operational map (dynamic from DB, states, filters, legend) | delegated | done (56e35c9 + d71c066; FloorPlanCanvas+editorStore+toolbar/layers/properties/minimap, LayoutEditorPage autosave 2.5s solo borrador + useBlocker dirty-guard + publicar/restaurar ConfirmDialog; mapa operativo dinámico desde location_occupancy; compare server-side diff field-level + visual history + diff preview en publish; risk medium; build+lint+tsc pass; desvío doc: engine SQL comparar_layout_versions pendiente — client-side join temporal) |
| T8 | Trucks module: CRUD, states per docs, TruckList/Details/Form/Badge/Timeline, TRUCK_ENTRY/EXIT movements | delegated | done (68d03aa; TruckListView con filtros+paginación 20, TruckDetailsPage con timeline 50+ver más y EgressDialog reglas AC-E2-2, TruckFormDialog validación patente +409, badge 17 códigos precedencia doc B-table T-14/T-16; risk medium; build+lint+tsc pass) |
| T9 | Cargo module: manifests, items, split (item_lots), transfer flows, capacities | delegated | done (4caa7a7; ManifestList/Detail/Form, ItemForm, SplitDialog validación 0<cant<lote, TransferDialog con capacidad, DischargeDialog, MovementsTimeline/Detail/Filters; fix bug real idCounter=100_000 en demo (colisión manifest-1 con seed); 19/19 demo flow PASS incl. RBAC operator split OK / viewer rechazado / seized transfer rechazado; risk medium; build+lint+tsc pass) |
| T10 | Movement engine: 15 kinds, transactional service, operation_key idempotency, guards (I1-I7), audit wiring | delegated | done (7dbd8cd; lib/movement-guards.ts puro I1-I7, RegistrarMovimientoDialog, movementService ejecutarMovimiento con op_key replay, corrección con previous_movement_id; bug real fixeado: I6_LOTES_RETENIDOS no-op en egress → contexto carga todos los lotes del manifest; 23/23 runtime + 7/7 demo PASS; risk medium; build+lint+tsc pass) |
| T11 | Scanner / Balanza / Rezago / Secuestro modules (queues, operations, holds, seizure workflow, attachments) | delegated | done (86806be) |
| T12 | Dashboard: real aggregates (queries with aggregation, not full history to browser) | delegated | pending |
| T13 | Audit module: AuditLog list/details/filters/timeline, read-only for normal users | delegated | pending |
| T14 | Reports: truck/entries/exits/cargo/movements/occupancy/scanner/scale/quarantine/seizure/audit, filters + CSV export | delegated | pending |
| T15 | Responsive: desktop-first, tablet (icon rail, data preserved, write path identical), breakpoints via tokens | delegated | pending |
| T16 | SEO: public pages only (/, /login, /about, /help, /contact), robots.txt, sitemap, OG, noindex internal routes | delegated | pending |
| T17 | Tests: auth, authorization, RLS, RBAC, trucks, cargo, split, movements, capacity, layout, scanner, scale, quarantine, seizure, audit, reports; negative cases | delegated | pending |
| T18 | Performance: lazy loading, code splitting, pagination, debounce, memoization, aggregations, map partial updates | delegated | pending |
| T19 | Final audit: documentation vs implementation report (senior arch/front/back/QA/UX/security), then fix findings | delegated | pending |

## Progress

- 2026-09-21: Env verified (Node 22, npm 11; NO Docker/pnpm/Supabase CLI).
  Docs mapped by two read-only explorers (data/domain/security + UX/brand/QA).
  Backend decision: code + SQL now, Supabase connected later (maintainer
  choice). Stash `wip docs fases 16-20 pendiente` (hash recorded, recoverable)
  preserved pre-existing uncommitted docs work. Branch `feature/web-app`
  created from `main` (9f1ab0f). This document created before first write.
- 2026-09-21 (sesión web-app): T1 done (ADR 0023 commit 1427ae0) + T2 done
  (scaffold commit ade14b9: Vite 8/React 19/TS 6/Tailwind 4/shadcn base-nova,
  build+lint pass, risk medium, parent spot check OK). T3 base incluida en
  T2 (tokens --cc-* fieles a docs/brand, 18 primitivas ui + shared/layout).
  Aviso: lint usa oxlint (create-vite 9 ya no trae ESLint) — convención del
  scaffold. Rutas especiales según routes-and-components.md (canónico).
- T4 done (commit 54e0267): supabase/migrations 0001-0006 — 25 tablas, 7
  roles/20 permisos/77 role_permission, 66 políticas RLS, 9 views
  security_invoker + day_bucket, 15 updated_at + 3 ADR 0006 guards + ADR 0003
  Σ deferrable; static-verified (sin motor SQL local); risk medium, spot OK.
- T5 done (commit d070b4b): web/src/types (enums=CHECKs exactos) +
  web/src/services (9 servicios módulo, impl supabase + adapter DEMO
  dev-only + factory selectora). splitItem/resolve requieren engine
  server-side (no REST) — documentado en servicios.
- T6 done (commit 7f29d08): Auth UI (LoginPage real + botón demo,
  AuthProvider/useAuth, RequireAuth/RequirePermission, sidebar filtrado,
  /403, forgot+reset, perfil read-only); mapa permisos verificado contra
  authentication.md §Guard table.

## Next step

T7 — Floor plan: layout editor + operational map
(docs/architecture/floor-plan-editor.md, floor-plan-versioning.md,
operational-map.md + domain/entities.md + brand/ux). Delegar a writer con
docs como spec.

## Route declarations

- T1: inline (single docs decision record written by orchestrator).
- T2+: delegated direct workers (general agent) per mandatory writer trigger.