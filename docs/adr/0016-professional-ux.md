# ADR 0016 — Professional UX Doctrine

- **Status:** accepted
- **Date:** 2026-09-19
- **Tags:** ux, cross-cutting
- **ADR 0012** established map-vs-operational visual doctrine
- **ADR 0013** dashboard views
- **ADR 0014** audit action
- **ADR 0015** layout versioning (visual ≠ logistic; restore = new draft)
- Related: `docs/architecture/floor-plan-versioning.md`,
  `docs/architecture/operational-dashboard.md`, `docs/architecture/audit.md`

## Context

Eight phases of UX docs each defined loading/empty/error/shortcut/skeleton
behavior locally. Operative users work high-information, high-speed, and
high-consequence: fleet ops, movements, warehouse capacity, audit. The
individual specs are consistent but there is **no single ordered source**
for density, feedback, error prevention, and the optimistic-UI boundary.
In an ops tool the worst failure is a **silent or optimistic UI around a
server-committed, legally meaningful record** — a truck that looks
moved where it is not, or a movement the operator believes was persisted.

Also, **no one rule forbids optimistic UI around movements/capacity**;
it is only implied by "server-committed" phrasing scattered across docs. A
consistent, normative, searchable statement is required.

## Decision

Adopt a **Professional UX Doctrine** — one cross-cutting contract that all
modules implement and all future UX/QA docs cite. Its rules rank
**clarity first, density second; never sacrifice clarity for aesthetic
compression** — speed/velocity belongs to the data, not to the pixels.

### 1. Density doctrine

- Dense data tables as the default for operational lists
  (trucks, cargo, movements, audit, warehouse locations, versions).
- **min 28px** hit targets, comfortable keyboard/touch (existing
  token do).
- Kill whitespace, not clarity: primary/secondary text hierarchy is
  preserved, status stays color + label (never color alone).
- Dense ≠ crammed: wrap policies, fixed columns, truncated secondary.

### 2. Feedback doctrine — one outcome per mutation

Every user mutation has **exactly one** visible outcome: success toast,
inline error, or optimistic revert-with-toast. Never silent submit.

### 3. Optimistic-UI boundary (normative)

The single normative rule the prior docs only implied:

> **No optimistic UI on any operation that writes
> `movements`, `movement_items`, `capacity`, `audit_log`, roles,
> permissions, or publishes/restores a layout. Those are
> server-committed and legally/operationally meaningful.**

Optimistic UI is permitted **only** where every one of these holds:

1. The mutation is safely reversible client-side (rollback trivially).
2. There is no append-only/legally meaningful side effect.
3. Success/failure cannot silently desync audit or history.
4. Failure leaves no ghost state and shows a visible error.

**Safe list (allowed optimistic):**

| Where | What | Rollback |
| -- | -- | -- |
| Global UI | density toggle (compact/dense/comfortable) | instant; local pref |
| Global UI | sidebar collapse / navigation preference | instant; local pref |
| Table | column toggle / sort order (view) | instant; local pref |
| Search | debounced query (never mutation) | n/a |
| Map view | pan/zoom/layer toggles (visual only) | instant |

**Never optimistic (server-committed):**

- All `movements` writes (movements are append-only → "optimistic" can
  never exist: the row appears only after commit)
- `capacity.set`, quarantine, seizure, release
- All role/permission changes
- `layout.publish`, `layout.restore` (confirmation + server commit
  only; these already have confirmation `before` flow from Fase 14)
- Any operation that emits an `audit_log` row on success

### 4. Timing & debounce doctrine

- Search/filter inputs: **debounce 300 ms** (existing cargo/timeline
  convention) — keep; declare it normative here.
- The floor-plan editor already debounces structural edits to
  server-committed element commits; preserve.
- **Never debounce a confirmation or a destructive command.**

### 5. Confirmation doctrine (error prevention)

Confirmation dialogs required (never bypassed by an easier path):

| Trigger | Confirm |
| -- | -- |
| Publish/unpublish layout version | yes (Fase 14, with version + diff preview) |
| Restore previous layout version | yes (Fase 14; explains new-draft semantics) |
| Quarantine / seizure / release | yes (existing) |
| Delete heavyweight data | yes, typed or verb-confirm |
| Capacity reduction below current occupancy | trigger rejects (non-negotiable) |

Destructive actions are **second-click guarded** (button requires a
confirmation dialog, never an instant single click).

### 6. Keyboard doctrine

Keyboard shortcuts only where the action is high-frequency and
keyboard-relevant:

- Global navigation (Alt/Ctrl+Shift+<module>): documented here.
- Floor plan editor: the existing shortcut table (undo/redo/duplicate/
  delete/nudge/save/fit) becomes normative, not optional.
- All shortcuts advertise `aria-keyshortcuts` + a Help/Shortcuts dialog.
- Never overload: shortcuts only for already-clickable commands; no
  hidden chord-only actions.

### 7. Loading & skeleton doctrine

- Skeletons for cold navigation and first render of a module.
- Keep existing per-module skeletons; **no new spinners where a
  skeleton already exists**.
- Debounce 300 ms covers search; a **filled earlier than spinner** rule:
  if a query resolves before the debounce window, show results
  immediately (never a forced spinner).

### 8. Error doctrine

- Errors are **inline near the field** (with icon + text, never color
  alone).
- Whole-form retry with kept input (no data loss on submit failure —
  keeps with audit doc). Documented already; keep.
- No silent swallow: every failed request surfaces a visible error.

## Normative vs. per-module

This document is **normative** — higher rank than module UX docs.
Module docs may only extend (more specific), never relax. Every UX/QA
module doc gets an assertion line "Compiles with UX Doctrine (ADR
0016)".

## Consequences

- One place answers "is X optimistic?" — the boundary above; movement
  writes are never optimistic because they can't be.
- Dense-but-clear contradicts nothing in the brand system (density is
  a table concern; tokens unchanged).
- No schema, policy, or permission change — this is display/
  interaction only (asserted; pattern of Fase 14).
- QA: new `UX-*` suite (see `docs/qa/ux-professional-tests.md`).
- Decision log 21.

## Alternatives considered

- **No-op:** skip; keep per-module — rejected: the boundary was
  inconsistent and unstated; operators guess wrong about optimistic
  movements.
- **Optimistic-everywhere:** rejected — unsafe for movements/capacity/
  audit.
