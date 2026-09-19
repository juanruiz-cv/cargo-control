# Responsive & Mobile-Ready Doctrine — Cargo Control

> **Normative doctrine** (ADR 0018). Supersedes nothing; this is the
> single reference for viewport/breakpoint and for the future scanner
> contract. Desktop remains the reference shell; tablets are first-class
> operational targets; a separate mobile app is **explicitly future**
> and will reuse this stack verbatim.

## Compiles with

- ADR 0016 (professional UX) — breakpoints are presentation, not
  feature forks.
- ADR 0014 (audit), ADR 0015 (layout versioning) — the append-only +
  confirmation semantics are viewport-independent.
- ADR 0002 / operational doctrine — visual ≠ logistic is preserved on
  every viewport.
- `docs/security/rls.md` + `docs/security/rbac.md` — **no policy change
  (asserted)**.

## 1. Goals (global, mobile incl.)

1. **Responsive / future mobile** — world view + per-context:
   *Operadores de terminal/tablet leen los mismos datos y ejecutan la
   mismo lógica de registro; el móvil futuro reusa API/Auth/RLS/RBAC/
   doctrine/data-model — nunca bifurca.*
2. Consultar camiones (trucks) — same read path.
3. Consultar mercadería (cargo) — same read path.
4. Consultar sectores (special areas) — same read path.
5. Registrar movimientos — same write path.
6. Leer códigos QR/barras (future) — new scanner capability, same
   write path downstream.

## 2. Breakpoint doctrine

Single source: `docs/brand/design-tokens.md` (design-spacing scale).

| Breakpoint | Token (px) | Cohort | Primary behavior |
| -- | -- | -- | -- |
| `< cc-bp-md` | < 768 | small phone (future) | stacked nav + full-layout override; editor read/compare only |
| `>= cc-bp-md` | 768–1023 | large phone / tablet portrait | compact sidebar; dense tables keep all columns; forms full-on-tablet |
| `>= cc-bp-lg` | 1024–1599 | tablet landscape / laptop | full sidebar; dense tables default (ADR 0016) |
| `>= cc-bp-xl` | >= 1600 | desktop / wide | (future depth: two knowledge columns — not in scope) |

Doctrine: **density is a device property, not a fork.** A tablet renders
the same tables/columns/forms; the layout (sidebar/nav/width) adapts —
data and actions never do. No separate "mobile mode" with fewer
features.

## 3. Tablet-first targets (operational)

| Module | Tablet guarantee |
| -- | -- |
| Trucks | read list + detail; register load/arrival/stage — same RLS/roles |
| Cargo | read lot detail + history; create/edit cargo (configure) |
| Sectors (special areas) | read list + capacity/occupancy; quarantine/seizure (configure) |
| Movements | **register movement** — full write path, never optimistic (ADR 0016), confirmations identical |
| Movements timeline | read, filter, compare (server-side), restore via new-draft doctrine |
| Audit | read-only filter + view |
| Floor plan | read/compare versions; publish/restore via confirmation (Fase 14) |

### Movement registration on tablet (non-negotiable repeat)

Same server-committed contract: submit → server commit → server echo →
toast. **Never optimistic on tablet either.** Movement on a tablet is the
same check as desktop: movements are append-only; a tablet can submit,
but the confirmation + server-commit path is byte-identical.

## 4. Layout & shell behavior

- Sidebar: collapsible to icon rail at `md` and below; full at `lg+`.
- Header: primary action (Cta) right-aligned; nav + title + density
  toggle remain; search collapses to expandable input at `md` below
  (debounce 300 ms — never removed).
- Density: tablets default to compact for operational tables (ADR
  0016); density is a local pref, optimistic-safe.
- Focus/touch: min 28px hit target everywhere; touch primary for
  tablet, keyboard still fully supported (ADR 0016 keyboard doctrine).

## 5. Scanner doctrine (future)

**Contract now, engine later (ADR 0018 §3).**

- UI affordance: scan button in module search fields (trucks,
  cargo, movements, sectors) launching a **scan overlay** (future
  camera). Placeholder render now.
- Decode → fill the search box with the decoded value → **manual
  search/debounce path takes over** (300 ms). A scan NEVER writes a
  movement; it only fills a query.
- Scan results are routed through the same RLS-filtered queries — a
  scan can never cross org isolation (RLS applies to the query, not
  the camera).
- Permissions: scanning a code is a **read** action — allowed to
  readers; writing from a scanned value still requires the module's
  configure/write permission. **No new permission code.**
- Audit: a scan that produces a lookup is **not** an auditable event
  (it's a read). Only a scan-driven WRITE (e.g. registering a truck
  from a QR that then creates a movement) emits audit rows as the
  normal write does today.

## 6. Native app future — reuse contract (NOT built now)

When a native app is built it reuses, verbatim:

- **API** — same REST endpoints, same payloads.
- **Auth** — same session/JWT (Supabase auth). No second identity.
- **Permissions** — same RLS + RBAC policies; the app is a client, not
  an admin surface.
- **Data model** — same tables/columns/rows; same schema version.
- **Business rules** — same doctrine: append-only movements,
  visual≠logistic, capacity guard, audit-on-success, confirmations.

The web app today is the reference implementation of that contract; the
mobile app later is a **thin re-client of the same origin**, never a
fork of doctrine.

## 7. Loading & feedback on tablet (doctrine preserved)

- Skeletons on cold navigation/render (unchanged, ADR 0016).
- Debounce 300 ms search (unchanged).
- Optimistic boundary unchanged (ADR 0016): movement/capacity/
  role/publish/restore NEVER optimistic, on any viewport.
- Toasts + inline errors: same modal contract.
- **Never** debounce a confirmation or a destructive command (also
  on tablet).

## 8. Module assertions

Each module doc asserts: "Compiles with the Responsive & Mobile-Ready
Doctrine (ADR 0018) — works on tablet, optimizations consistent on
desktop; no feature fork."

Current module docs asserted for Fase 16: trucks, cargo, movements,
special areas, operational dashboard, audit, floor plan versioning.

## Deltas

- `docs/brand/design-tokens.md` — breakpoint tokens `--cc-bp-*` (md/lg/
  xl) added (Fase 16).
- `canonical-ux.md` + `professional-ux.md` — doctrine reference line
  added (normative cross-links).
- No schema, policy, permission, or business-rule change (asserted in
  rls + rbac + domain). **No new permission codes.**
