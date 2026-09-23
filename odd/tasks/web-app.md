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
| T12 | Dashboard: real aggregates (queries with aggregation, not full history to browser) | delegated | done (b17b1a7) |
| T13 | Audit module: AuditLog list/details/filters/timeline, read-only for normal users | delegated | done (e86b535) |
| T14 | Reports: truck/entries/exits/cargo/movements/occupancy/scanner/scale/quarantine/seizure/audit, filters + CSV export | delegated | done (2fa99b3) |
| T15 | Responsive: desktop-first, tablet (icon rail, data preserved, write path identical), breakpoints via tokens | direct inline (subagent transport unavailable — free tier) | done (dd261a1; tablet 768–1023 forced 56px icon rail via effectiveCollapsed, burger md:hidden, overlay md:hidden, desktop collapse pref untouched, no localStorage writes during tablet range; risk medium, build+tsc+lint OK, md: utilities verified in production CSS) |
| T16 | SEO: public pages only (/, /login, /about, /help, /contact), robots.txt, sitemap, OG, noindex internal routes | direct inline (subagent transport unavailable — free tier) | done (a71e18b; router-root Seo.tsx index-only PUBLIC_SEO routes, fail-closed noindex static+cleanup, index.html noindex default, PublicLayout+About/Help/Contact pages, robots.txt allowlist, sitemap.xml; SITE_URL placeholder cargo-control.example.com in config/seo.ts; "/" excluded from sitemap — client-redirects; risk medium, build+tsc+lint OK) |
| T17 | Tests: auth, authorization, RLS, RBAC, trucks, cargo, split, movements, capacity, layout, scanner, scale, quarantine, seizure, audit, reports; negative cases | direct inline (subagent transport unavailable — free tier) | in_progress — Tanda 1 (0029cac): vitest 4 + testing-library + jsdom; 102 tests lib/hooks/map + fix 2 bugs prod (zoomAtPoint, guardI5Estado). Tanda 2 (e7083f2): 121 tests — motor demo (RBAC viewer, ME-07 idempotencia, discharge/split/transfer/egress, egress con retenidos AC-E2-2, arrival previo, audit trail), agregados dashboard/reportes (golden: stored 800u/4030kg, holds 50+200, scan 30, sector-01=500u). Tanda 3 (8093149): auth (login/roles/permisos, credenciales malas, sign-out, operator pin), holds (open view, resolve quarantine, engine release resuelve op + lot released + caso cerrado). Tanda 4 (1696916): stations (cola scan seed, scan_in → checked, SBF-05 no avanza, escala), layout diffs puros + versiones demo (create/publicar/restaurar), LoginPage RTL (demo button, errores inline, redirect), kpiCards (gating por permiso, formato es-AR). Tanda 5 (3d651f4): DashboardPage RTL (KPIs demo real, charts, ocupación, refresh, gating sin permisos), ManifestList RTL (seed, búsqueda, Nuevo con cargo.create). 167 tests / 19 archivos. Falta: RLS (requiere supabase local — NO instalado) |
| T18 | Performance: lazy loading, code splitting, pagination, debounce, memoization, aggregations, map partial updates | delegated | pending |
| T19 | Final audit: documentation vs implementation report (senior arch/front/back/QA/UX/security), then fix findings | delegated | pending |
| T20 | Map truck finder: right-side panel with debounced plate/company search listing every truck with its derived location, click centers the map on its chip; chip follows derived state to owning sector (playón/balanza/scanner/rezago/secuestro) | delegated | done (1d05c4c + refinements: 879588f chips inside sector, a49734a column-fill top-left, 8a2e7ff chip follows derived state) |

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
- 2026-09-22 (sesión mapa operativo): T20 done — truck finder panel
  (1d05c4c: búsqueda debounced 300ms por patente/transportista sobre
  catálogo completo, badge estado derivado + hint ubicación, click =
  marcar en mapa + botón Detalle → /trucks/:id, superficie truck.read).
  Refinamientos de chips: 879588f (chips DENTRO de la caja del sector,
  antes quedaban debajo del borde), a49734a (column-fill desde esquina
  superior izquierda), 8a2e7ff (chip sigue el estado derivado al sector
  dueño: playón/balanza/scanner/rezago/secuestro vía SECTOR_POR_ESTADO,
  fallback playón si el layout no tiene ese tipo). Spec actualizado
  (docs/ux/operational-map.md §Playón chips + §Truck finder panel).
  Verificación por commit: tsc+lint+build verdes, risk medium, spot OK.
- 2026-09-22 (sesión responsive): T15 done (dd261a1). Tablet 768–1023
  ahora muestra icon rail persistente de 56px (responsive-mobile.md §2)
  en vez de caer al drawer móvil: AppShell fuerza effectiveCollapsed en
  tablet (sin escribir la pref de collapse), Sidebar pasa a static desde
  md (antes lg), burger y overlay pasan a md:hidden. Desktop conserva la
  toggle collapse optimista local. Verificado: tsc+lint+build OK,
  risk medium, utilities md: presentes en CSS de producción.
- 2026-09-23 (sesión SEO): T16 done (a71e18b). Superficie pública
  indexable = /login, /about, /help, /contact (la "/" fue excluida del
  sitemap — redirige client-side a /dashboard o /login; decisión
  registrada en config/seo.ts). Seo.tsx en la raíz del router:
  PUBLIC_SEO → index,follow + title/desc/canonical/og:url; resto →
  noindex,nofollow + cleanup restaura el default; index.html lleva
  noindex estático fail-closed. Páginas nuevas About/Help/Contact bajo
  PublicLayout (header marca + nav pública + CTA login + footer);
  /help lista atajos desde NAV_GROUPS (sin duplicar). robots.txt
  allowlist de las 4 + sitemap.xml. SITE_URL placeholder
  https://cargo-control.example.com centralizado (mantainer choice) —
  al elegir el dominio real: actualizar config/seo.ts + sitemap.xml +
  robots.txt. og:image omitido hasta tener PNG/JPG de marca (los
  scraper no aceptan SVG). Verificado: tsc+lint+build OK, risk medium.
- 2026-09-23 (sesión tests): T17 tanda 1 (0029cac). Infra vitest 4 +
  testing-library + jsdom montada (vitest.config.ts, src/test/setup.ts,
  npm test). 102 tests / 11 archivos: viewport (zoomAtPoint ancla-cursor,
  clamp, fit, wheel), formatDocUnit m/cm + imperial, CSV es-AR (BOM, ';',
  RFC 4180 quote solo si hace falta, mismo formato que la tabla),
  movement-guards I1..I7 (15 kinds, supervisor gate, split remanente,
  lote completo, capacidad kg/units proyección, viejo-contribución mismo
  destino, congelados, allows_hold, checkpoint scan/scale, idempotencia
  replay), computarOcupaciones (semántica location_occupancy exacta),
  estadoOperativo (precedencia mantenimiento→hold→ocupado→parcial→libre),
  ZoomControls/EstadoOperativoBadge (RTL), hooks (debounce trailing
  cancelable, localStorage JSON+catch, mediaQuery subscripción, useViewport
  zoom/fit/reset). TSC+lint+build green, risk medium. 2 bugs reales
  destapados y arreglados: (1) zoomAtPoint hacía dx=docToScreen(vp, docX)
  con el MISMO vp → tautología px→x=0 siempre, el zoom reseteaba el pan;
  fix x = px - docX*zoomNuevo. (2) guardI5Estado destino =
  it.destinoLocationId ?? items.length===1 ? ... sin paréntesis → `??`
  liga más fuerte que `?:` → siempre usaba el fallback c.locationId (casi
  siempre null) y NUNCA validaba destinoLocationId (I5_DESTINO_INACTIVO /
  I5_DESTINO_SIN_HOLD inertes); fix igualar I3 con paréntesis. Nota:
  roles usan 'operator' (no 'operador'); LocationType no tiene 'storage'
  (zone|bin|playon|checkpoint).
- 2026-09-23 (sesión tests): T17 tanda 2 (e7083f2). Integración motor demo
  (services/demo/adapters.test.ts): RBAC viewer → MovementEngineError;
  movimientoPermitido por rol; ME-07 operation_key → duplicado:true + 1
  sola fila; discharge muta lote → discharged/playon/truck null + manifest
  discharged; split → parent -cantidad + child con parent_lot_id +
  created_via_movement_id; split cantidad==total o lote retenido →
  error; transfer mueve lote (requiere discharge previo — lot-1-1 seed es
  on_truck); egress con retenidos (manifest-1 rezago, manifest-2 secuestro)
  → rechazado AC-E2-2; egress limpio → payload acknowledged_on_truck_lots
  + manifest NO closed + doble egress → error; egress sin arrival previo →
  error; audit trail movimiento.discharge con before/after. Agregados
  (aggregates.test.ts): métricas golden (stored 800u / 4030kg, rezago 50,
  secuestro 200, scanner 30, scale 0, yard>=2, sectores ocupados),
  dayBucketKey UTC, snapshot sector-01=500u, serie arrivals >= 2 filas,
  merchandise_processed total>0, demoLotes, total auditoría>0. Notas
  API: AuditService.listarAudit devuelve {filas,total} (no rows);
  computarSerieDemo(state, tipo, filtros) devuelve SerieFila[] (no
  objeto); DEMO_FACILITY_ID='fac-demo'; ManifestInsert requiere
  facility_id. TSC+lint+build green, risk medium.
- 2026-09-23 (sesión tests): T17 tanda 4 (1696916). Stations + layout
  (stationsLayout.test.ts, 14 tests): obtenerColaPendiente seed (lot-1-3
  discharged en loc-scanner → queue_kind 'scan'), scan_in success → op +
  lot status 'checked'; SBF-05 no-succeso (not_found) → fila append-only,
  lot queda 'discharged' (no avanza); escala (escala.crearOperacionEscala
  — el campo del servicio es 'escala', no 'scale') with within_tolerance;
  layout: claveEstableLayoutElement (place:location vs visual:name,
  case-insensitive, null sin name), computarDiffLayout puro (added/
  removed/changed con identidad estable entre versiones, diff vacío,
  1 cambio por campo, CAMPOS_DIFF_LAYOUT = 10 campos), crearVersion copia
  base publicada (version = max todas +1 — seed tiene v1 published + v2
  draft → v3), publicarVersion archiva la previa publicada (queda 1
  published), restaurarVersion → draft copia con description
  'Restaurado desde versión N'. Página LoginPage.test.tsx (7 tests RTL,
  mock useAuth + MemoryRouter): demo surface + botón DEMO, errores inline
  submit vacío, email inválido → aria-invalid, signIn(email,password),
  DEMO button usa DEMO_EMAIL/DEMO_PASSWORD, error credenciales →
  Alert destructivo, sesión existente → Navigate a dashboard (heading
  real es 'Cargo Control', no role=heading). kpiCards.test.ts (6 tests
  puros): 10 cards orden fijo; formato es-AR (4.030 kg, 'de 10');
  kpisVisibles: base warehouse.read + permiso módulo (truck/cargo/
  scanner/scale/quarantine/seizure) — card sin permiso se oculta, nunca
  se cero. 155 tests / 17 archivos. Tipos: LayoutFiltros usa
  facilidadId; ComputarDiffLayoutContext usa facilityId; AuthContextValue
  vive en auth-context (no useAuth). TSC+lint+build green, risk medium.
- 2026-09-23 (sesión tests): T17 tanda 5 (3d651f4). DashboardPage.test.tsx
  (7 tests RTL con demo backend real + useAuth mockeado): KPIs con valores
  golden es-AR (800, Mercadería almacenada, Camiones en playa),
  badge Demo + 4 charts role="img" (Ingresos de camiones por día),
  ocupación role="table" (no img), refresh → revision++,
  select ventana 7 días, sin permisos → 'Sin permisos de dashboard',
  gating por módulo (sin truck.read → sin Camiones en playa).
  ManifestList.test.tsx (5 tests RTL): lista manifests seed
  (MANIF-2026-0918-A / MANIF-2026-0919-B, ambos in_playon → 'En playa'),
  búsqueda client-side debounce 300ms (query sin match → 'Resultados: 0'),
  botón Nuevo solo con cargo.create, cards son <Link> con nombre accesible
  = código del manifest (to=/cargo/:id). 167 tests / 19 archivos.
  Notas API: PermissionCode NO tiene 'reports.read' (módulo audit es lo
  máximo); OcupacionBars es role="table"; ManifestStatusBadge rollup usa
  mismo label que MANIFEST_STATUS_LABELS. TSC+lint+build green, risk
  medium.

## Next step

T17 — tanda 6: cubrir las páginas de operaciones que quedan con RTL
(ScannerPage, ScalePage, MovementsPage, QuarantinePage/SeizurePage) con
el demo backend real, luego RLS/isolation pendiente hasta instalar
supabase CLI + Docker (ver docs/qa/strategy.md «Database / Isolation»).
Después T18 Performance → T19 Final audit.

## Route declarations

- T1: inline (single docs decision record written by orchestrator).
- T2+: delegated direct workers (general agent) per mandatory writer trigger.