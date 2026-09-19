# Professional UX Doctrine — normative contract

Rank: **normative** (ADR 0016). All module UX docs and QA docs compile
against this. Modules may only extend (more specific) — never relax.

Operative reality: high information, high speed, high consequence. The
worst failure is a **silent or optimistic UI around a server-committed,
legally meaningful record**. Clarity first; density second — never
sacrifice clarity for aesthetic compression.

## 1. Optimistic-UI boundary (single normative source)

> **No optimistic UI on any operation that writes `movements`
> (`movement_items`), `capacity`, `audit_log`, roles/permissions, or
> publishes/restores a layout.**

Rationale: those are append-only / legally or operationally meaningful.
An "optimistic" movement cannot exist — movements are server-committed
rows; the row appears only after commit)Skip.

**Permitted optimistic (complete safe list):**

| Where | Operation | Rollback |
| -- | -- | -- |
| Global UI | density toggle (compact/dense/comfortable) | instant, local pref |
| Global UI | sidebar collapse, navigation preference | instant, local pref |
| Table view | column toggle, sort order (view only) | instant, local pref |
| Search | debounced query — **never a mutation** | n/a |
| Map view | pan/zoom/layer toggles (visual only) | instant |

**Never optimistic (server-committed + feedback required):**

- Any `movements` / `movement_items` write (append-only).
- `capacity.set`, quarantine, seizure, release.
- Role / permission changes.
- `layout.publish`, `layout.restore` — already confirmation-guarded
  (ADR 0015); the confirm shows version + diff preview.
- Any operation that emits an `audit_log` row on success.

## 2. Density doctrine — dense but never unclear

- Operational tables (trucks, cargo, movements, audit, warehouse
  locations, layout versions) default to **compact density**.
- Comfortable density available as a user preference (persisted via
  the optimistic-safe local pref path above).
- **min 28px** hit targets, comfortable for keyboard and touch — stays.
- Status is **always color + label** (never color alone).
- Kill whitespace, not clarity: hierarchy between primary/secondary
  text preserved; truncation of secondary text allowed, primary never.

## 3. Feedback doctrine — one visible outcome per mutation

Every user mutation has **exactly one** visible outcome:

- **Success** — toast (module verb, e.g. "Movimiento registrado").
- **Failure** — inline error near the field / form-level banner with
  reason; input preserved on retry (no data loss).
- **Pending** — skeleton/disabled control, never a silent submit.

No silent submit. No optimistic ghost row for a server-committed write.

## 4. Timing doctrine

| Signal | Rule |
| -- | -- |
| Search / filter | **debounce 300 ms**, trailing, cancelable |
| Debounce window resolved early | render result immediately — never a forced spinner |
| Confirmation / destructive commands | **never** debounced |
| Skeleton loading | cold navigation + first render of a module |

## 5. Confirmation doctrine (error prevention)

Confirmation dialogs required — never bypassed by an easier path:

| Trigger | Confirm contains |
| -- | -- |
| Publish / unpublish layout version | version + description + diff preview (Fase 14) |
| Restore previous layout version | explains new-draft semantics, no movement writes (Fase 14) |
| Quarantine / seizure / release | existing per-module confirm |
| Capacity reduction below occupancy | **rejected by trigger** (non-negotiable) |
| Delete of heavyweight data | verb/typed confirm or distinct-second-click |

Destructive actions are **second-click guarded**: the button requires a
confirmation dialog — an instant single click never destroys.

## 6. Keyboard doctrine

Shortcuts only where high-frequency + keyboard-relevant:

- Floor plan editor: the existing shortcut table (undo/redo/duplicate/
  delete/nudge/save/fit) is **normative** (kept from Fase 14).
- Global module navigation (Alt/Ctrl+Shift+<module>): documented in
  the professional UX doc.
- All shortcuts advertise `aria-keyshortcuts` + a Help/Shortcuts dialog.
- Never overload: shortcuts only for already-clickable commands; no
  hidden chord-only actions.

## 7. Loading & skeleton doctrine

- **Skeletons** for cold navigation and first module render (existing
  per-module skeletons stay; **no new spinners where a skeleton already
  exists**).
- Debounce 300 ms covers search; fill earlier than spinner — if a query
  resolves before the debounce window, show results immediately.

## 8. Error doctrine

- Errors are **inline near the field**, icon + text (never color alone).
- Whole-form failures keep input; retry is available without retyping.
- No silent swallow: every failed request surfaces a visible error.

## Normativity & module assertion

Each UX and QA module doc carries this assertion line:

> *Compiles with Professional UX Doctrine (ADR 0016); only extends,
> never relaxes.*

Any doctracking conflict is resolved in favour of this file; a module
doc that contradicts it is a defect.
