# ADR 0018 — Responsive & Mobile-Ready Doctrine

- **Status:** accepted
- **Date:** 2026-09-19
- **Tags:** responsive, mobile, cross-cutting
- **ADR 0002** (visual ≠ logistic doctrine), **ADR 0016** (professional UX),
  **ADR 0017** — no; this is independent
- **Related:** ADR 0016 §3 optimistic-safe boundary, `docs/architecture/
  ux-doctrine.md` (private), `docs/architecture/movement-engine.md`,
  `docs/architecture/audit.md`, `docs/security/rls.md`, `docs/security/
  rbac.md`
- **Supersedes:** nothing

## Context

Cargo Control is a desktop-first, high-information operational app. The
Prompt introduces a hard requirement: **tablets** must support the full
read path (trucks, cargo, sectors) PLUS the critical write path
(register movements), plus a future QR/barcode scan. A separate mobile
app is **explicitly NOT in scope** — the decision is how to make the
existing stack mobile-ready by **reusing** the API, auth, permissions,
data model Board and business rules. The risk is a fork: a second UI
that re-validates nothing, bypasses RLS/RBAC, or invents a second
movement write path that breaks the append-only/audit guarantees (this
is the exact failure ADR 0002 / ADR 0016 forbid).

## Decision

**One codebase, one API, one data model; breakpoint-driven progressive
layout.** No separate mobile app, no second API surface, no mobile-only
schema. The browser/web app IS the tablet surface; a native wrapper
(web-capable container) is the mobile future and it consumes the SAME
origins.

### 1. Rendering doctrine

- **Desktop-first, tablet via breakpoints, mobile via the same
  progressive path.** Tablets get the full desktop capability set with
  adjusted density/navigation; small phones get a reflowed
  navigation+lists, never a crippled fork.
- **No feature is mobile-only and no feature is desktop-only.**
  Anything the tablet must do (trucks/cargo/sectors read, movement
  registration) is the SAME module, same routes, same service layer.
- Dense tables remain the default (ADR 0016); on narrow widths they
  collapse to focused column presets / stacked cards **that still
  expose the same data** — never a reduced-data mobile view.

### 2. Write-path guarantee (non-negotiable)

Movement registration on a tablet is **exactly the same server-committed
append-only path** as on desktop. **No optimistic UI, no local queue,
no offline-first mutation, no "saved to device" that wasn't committed.**
(Append-only: a movement exists only after server commit — ADR 0016 §3
is doctrine, applies on every viewport.)

> **Mobile/tablet never introduces a second write path.** If a future
> offline capability ever appears it is a NEW ADR with its own
> reconciliation contract — never a silent local-buffer change.

### 3. QR / barcode doctrine (future, prepared)

- The UI gains a **scan affordance (contract + tests) now**, but the
  actual camera/scan engine is **future work** (separate ADR when it
  ships).
- Today's contract: the app exposes a `scanner` affordance stub that
  (a) reads a supported barcode/QR formats contractually, (b) routes
  the decoded value through the SAME search/debounce pipeline as
  manual entry (Fase 15), (c) is usable in trucks, cargo and
  sectors/floor-plan element lookup, (d) never auto-executes a
  mutation from a scan (scans resolve to selections/lookups only —
  user confirms before any write).
- Scan results feed the same RLS-filtered queries — a scan can never
  cross org isolation.

### 4. Reuse doctrine (API/auth/permissions/data model/doctrine)

- **Auth:** same session/cookie/JWT as desktop; no anonymous token.
- **Permissions:** same RLS policies + RBAC codes — zero new codes.
- **Data model & doctrine:** same schema, same append-only movements,
  same visual≠logistic, same audit. No mobile fields added.

### 5. Tablet breakpoint doctrine

- Add breakpoint tokens (`--cc-bp-sm/md/lg/xl`) to the design tokens
  (this is the concrete Fase 16 delta) with tablet as the **lg + md
  window** that activates the compact navigation and focused tables.
  Storage of the chosen density/sidebar pref remains optimistic-safe
  local pref (ADR 0016 safe list).

## Consequences

- Reading trucks/cargo/sectors and registering a movement are
  guaranteed identical across desktop/tablet — no fork, no second
  write path, no policy bypass.
- QA gains **RS-* (responsive)** and **MQ-* (mobile-ready)** cases;
  movement registration on tablet asserts the exact server-committed
  contract (UX-70 re-validated on narrow viewport).
- The only code-level delta now: breakpoint + responsive tokens in
  design-tokens.md. **No schema, policy, permission, or business-rule
  change** (asserted in `rls.md`/`rbac.md`/`business-rules.md`).
- Mobile app stays future; this doctrine makes it a pure container
  decision later, not an architecture fork.
- Decision log 25; README status Fase 16.
