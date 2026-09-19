# Professional UX — Test Specification (Fase 15)

> **Compiles with Professional UX Doctrine (ADR 0016).** QA spec ranks
> module specs; extending is allowed, relaxing is not.

Covers the professional-Doctrine claims the rest of the QA matrix makes
concrete: navigation, sidebar, header, dense tables, forms, modals,
confirmations, errors, loading, empty states, search debounce, keyboard
shortcuts, optimistic-UI boundary.

Fixture: org `o1` with `u_admin`, `u_sup` (supervisor), `u_op`
(operator), `u_viewer`; one facility "Patio" with published layout +
draft; trucks, cargo, movements, capacity, audit rows available.

## A. Navigation & shells — NK-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-01 | click each module in sidebar | correct route + module title; active pill = filled+icon+label |
| UX-02 | `Alt+Shift+1..9` shortcuts | each navigates to its module; `aria-keyshortcuts` present |
| UX-03 | sidebar collapse | icon rail; pref persists on reload (optimistic-safe) |
| UX-04 | sidebar keyboard | all items focusable; Esc closes overlay nav on small screens |
| UX-05 | `Ctrl+Shift+?` | help dialog lists all shortcuts; entry points present |
| UX-06 | `Ctrl+K` command palette | search lists modules; arrow+Enter navigates |

## B. Skeletons & loading — SK-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-10 | cold nav to trucks/cargo/movements/audit/dashboard | skeleton rows, not spinner |
| UX-11 | cold nav to floor plan editor | skeleton canvas + panels (existing) |
| UX-12 | search resolves within debounce window | **results rendered immediately — no forced spinner** |
| UX-13 | table cold render | skeleton rows ≈ visible count |
| UX-14 | detail drawer / side panel | skeleton block per section |
| UX-15 | form submit | button loading (disabled + spinner); no full-screen overlay |

## C. Search debounce — DB-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-20 | type quickly into truck search | query fires once after 300 ms trailing (debounced) |
| UX-21 | debounce 300 ms on every module search (trucks, cargo, movements, audit, layout, special areas) | same 300 ms contract |
| UX-22 | cancel debounce | no stale request; previous results stay, no flash |
| UX-23 | confirmation/destructive | **never** debounced — fires instantly |

## D. Dense tables — DT-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-30 | operational list default density | compact; rows ≥ 32px; controls ≥ 28px |
| UX-31 | status cell | color **+ label**, never color alone |
| UX-32 | numeric/quantity column | right-aligned; ID/text left-aligned |
| UX-33 | density toggle | compact/comfortable; persists as local pref (optimistic-safe) |
| UX-34 | column visibility preset | default/compact/focused; server data untouched |
| UX-35 | row actions | hover + keyboard-focus reveal; never hover-only |
| UX-36 | secondary column truncation | `title=` tooltip; primary never truncated |

## E. Forms & inline validation — FM-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-40 | required field submit | blocked; inline error near field (icon+text) |
| UX-41 | blur validation (format/range/duplicate-code) | validated on blur; clear inline error |
| UX-42 | whole-form submit failure | banner + inline; **inputs preserved**, retry keeps values |
| UX-43 | label binding | `htmlFor`/`id`; visible label, never placeholder-only |
| UX-44 | option group | `<fieldset>/<legend>`; `aria-required` |

## F. Confirmation doctrine — CF-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-50 | publish layout version | confirm dialog with version + diff preview; **optimistic never** (Fase 14 + UX-31 cross-check) |
| UX-51 | restore previous version | confirm explaining new-draft/no-movement semantics; never optimistic |
| UX-52 | capacity reduction below occupancy | **rejected by trigger** — no confirm offered, error shown |
| UX-53 | quarantine / seizure via special area | reason + confirm (existing) |
| UX-54 | role / permission change | change summary + confirm |
| UX-55 | destructive delete (heavyweight) | verb/typed confirm; second-click guarded |

## G. Toasts & feedback — TF-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-60 | successful mutation | toasts with module verb + short description; auto-dismiss ~4s |
| UX-61 | optimistic-safe local-toggle failure | reverts + visible error; no ghost state |
| UX-62 | 5xx / server-down global error | error toast; inline field errors otherwise |
| UX-63 | toast dedupe | one toast per operation id; no duplicate stacking |

## H. Doctrine boundary — OD-* (the adversarial tripwire)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-70 | **movement registration** | appears ONLY after server commit — never optimistic ghost row |
| UX-71 | **capacity.set** | server-committed; loading until response; audit on success |
| UX-72 | **role/permission change** | server-committed; confirm first; never optimistic |
| UX-73 | **layout.publish / restore** | confirm + server commit; optimistic UI FORBIDDEN |
| UX-74 | audit_log-emitting op | never optimistic (row appears only after commit) |
| UX-75 | map pan/zoom/layer toggles | optimistic-safe (visual only; no data mutation) |
| UX-76 | density/sidebar/column prefs | optimistic-safe (local reversible) |

## I. Empty states — ES-*

| ID | Scenario | Expected |
| -- | -------- | -------- |
| UX-80 | empty module list | empty state + primary action; no dead filler |
| UX-81 | no search results | "no results" + clear-filters action; not a generic empty |
| UX-82 | empty layout version history | explainer + create-first-version CTA |

## Doctrine assertions (verify on every run)

- **UX-70..74 are non-negotiable**: movement/capacity/roles/permissions/
  publish/restore/audit-emitters are **never** rendered optimistic in any
  frame, debug, or future module.
- **UX-12** binds the "never force a spinner when a query already
  resolved" rule.
- Safe list of ADR 0016 must not be widened by any PR.

31 cases, all normative.
