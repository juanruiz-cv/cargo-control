# Professional UX — Cargo Control

> **Compiles with Professional UX Doctrine (ADR 0016) — extends, never
> relaxes.**

Cross-cutting professional interaction: navigation + sidebar + header +
dense tables + forms + modals + confirmations + errors + loading +
empty states + keyboard + search + feedback. Per-module specs add
module specifics; this file sets the shared contract.

## 1. Navigation & shells

### Global keyboard navigation

| Shortcut | Module |
| -- | -- |
| `Alt+Shift+1` | Dashboard |
| `Alt+Shift+2` | Trucks |
| `Alt+Shift+3` | Cargo |
| `Alt+Shift+4` | Movements |
| `Alt+Shift+5` | Warehouse |
| `Alt+Shift+6` | Operational map |
| `Alt+Shift+7` | Audit |
| `Alt+Shift+8` | Special areas |
| `Alt+Shift+9` | Layout versions |
| `Ctrl+Shift+?` | Help / shortcuts dialog |
| `Ctrl+K` | Global command palette (search modules) |

All shortcuts are advertised via `aria-keyshortcuts` and listed in the
Help dialog; none are hidden chord-only actions.

### Sidebar

- Modules grouped: **Operación** (dashboard, trucks, cargo, movements,
  warehouse, map), **Control** (audit, special areas, layout versions,
  reports, settings).
- Active module: filled pill + icon + label; never color alone.
- Collapsible to icon rail (collapsed = local pref, optimistic-safe).
- Dense (28px rows); section headers uppercase 11px muted.
- Keyboard-reachable: elements focusable in DOM order; Esc closes
  overlay nav on small screens.

### Header

- Page title + module breadcrumb; primary action (Cta) right-aligned.
- Search (if module has one) in header center, debounced 300 ms.
- Density toggle + user menu (density/theme/account/logout) top-right.
- Header never scrolls with the body; sticky.

## 2. Loading & skeletons

| Where | Pattern |
| -- | -- |
| Cold navigation / first module render | **skeleton** (module defaults) |
| Table cold render | skeleton rows matching visible count |
| Search within debounce | render previous + soft highlight; never full-page spinner |
| Detail panels / side drawers | skeleton block per section |
| Form submit | button loading (inline spinner + disabled); **no full-screen overlay** |

Rules: skeletons replace spinners for cold paths; a resolved query
renders immediately (no forced spinner); optimistic only where the
ADR 0016 safe list allows.

## 3. Search (debounce 300 ms, normative)

- Debounce **300 ms trailing, cancelable** applied to search inputs.
- Server search in every module that has it (trucks plate, cargo code,
  movements references, audit action/actor, layout name, special
  areas).
- Debounce never on confirmations/destructive commands.
- **Live-local search** (client set) renders instantly — no debounce
  after the set is loaded.
- While debouncing: previous results stay visible (no flash).

## 4. Dense tables

Default **compact density** for operational lists with:

- Min 28px hit targets (rows ≥ 32px, controls ≥ 28px).
- Status = **color + label** (never color alone) — keeps existing
  StatusIndicator (trucks, movements, capacity, audit).
- Connected dense table controls (column toggle, sorting via toggle +
  keyboard) documented globally here; top-line audit has its own
  density preference (Fase 13).
- **Left-aligned** text/IDs; numbers/quantities **right-aligned** (they
  are compared); status colors muted for readability.
- Column visibility presets: **default** (all expected columns),
  **compact** (drop least-important secondary columns), **focused**
  (primary/action columns only) — all view-only preferences,
  optimistic-safe.

Table guidelines pass:
- Column widths: no fixed-width distraction; allow truncation with
  `title=` tooltip for secondary columns; primary never truncated.
- Row hover: subtle highlight; row actions revealed on hover AND
  reachable by keyboard (focus) — never hover-only.

## 5. Forms

- Single-column on narrow; label above input (scan-first), helper text
  below; never placeholder-only labels.
- Required marked `*` with `aria-required`; grouping with
  `<fieldset>/<legend>` for option groups.
- Inline validation on blur for well-defined constraints (format,
  range, duplicate code); full-block on submit.
- Submit: server-committed; button shows loading until the response
  lands (never optimistic except global safe list).
- Whole-form failure: inputs preserved (no data loss), banner + inline;
  retry keeps entered values (matches audit doctrine Fase 13).
- Focus management: on dialog open → first focusable; on close →
  return focus to trigger; Esc closes; locked behind scrollbar.

### Optimistic-safe confirmation & feedback

See table in ADR 0016 section — page 1.

## 6. Modals & confirmations

Confirmations required (never bypassed by an easier path): publish/
restore layout version (diff preview + Fase 14 semantics), quarantine
via special area, seizure, capacity set below occupancy (rejected by
trigger — non-negotiable), any role/permission change, delete
heavyweight data with verb or typed confirm.

| Trigger | Dialog content |
| -- | -- |
| Layout publish | version + description + diff preview + confirm; never optimistic |
| Layout restore | new-draft semantics + no-movement guarantee + confirm |
| Quarantine / seizure | reason field + confirm |
| Capacity reduction below occupancy | **rejected by trigger**, no confirm offered |
| Role / permission change | change summary + confirm |

- Confirmation buttons: **primary for confirm** (danger-red only for
  actually destructive), outline → destructive; second-click semantics
  for destructive (never instant-click).
- Modal footer: [Cancel] [Confirm action]; destructive shows
  destructive-styled primary.
- Esc / click-outside / Cancel all equivalent; Confirm is never
  reached by a single click unless it's a simple create.

## 7. Toasts & feedback

- **Success toast** with module verb and short description, auto-dismiss
  (default ~4s, dismissible), top-right.
- **Error toast** for global failures (server down, 5xx) not tied to a
  field; inline + field errors otherwise.
- **Inline error** near the field with icon + text — never color alone.
- **Info toast** for informational, non-blocking life events.
- All toasts in a single portal stack; no duplicate for the same
  mutation (dedupe by operation id).

## 8. Help & onboarding

- Help dialog (`Ctrl+Shift+?`) lists all shortcuts per module +
  normative debounce/skeleton rules by name.
- Empty states always include a primary action (see module empty
  tables).
- No onboarding tours; operators prefer in-place affordance +
  keyboard help (ADR 0016 §5 — "no hidden glyph-only actions").

## 9. Doctrine boundary recap (normative)

- **Optimistic-safe (allowed):** density toggle, sidebar collapse, column
  toggles/sort presets, map pan/zoom/layers, local UI preferences,
  debounced search. All local + reversible.
- **Server-committed (never optimistic):** any `movements`/capacity/
  roles/permissions write, quarantine/seizure/release, publish/restore,
  anything emitting an audit row. Confirmation + server commit always.

## 10. Module assertions

This is the cross-cutting contract. Each module UX doc adds a line:

> Compiles with the Professional UX Doctrine (ADR 0016) — extends, never
> relaxes.

Current module docs asserted: trucks (F7), cargo (F8), movements (F9),
special areas (F10), operational map (F11), dashboard (F12), audit
(F13), floor plan + versioning (F14). **professional-ux.md is the
shared contract for F15.**
