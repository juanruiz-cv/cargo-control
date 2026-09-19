# Fase 15 — Professional UX (Prompt 16) — CLOSED 2026-09-19

## Objective
Cross-cutting professional UX audit: speed, density, reading, search,
keyboard, feedback, error prevention. Review navigation/sidebar/header/
tables/forms/modals/confirmations/errors/loading/empty states. Implement
keyboard shortcuts where useful, debounce, safe optimistic UI, skeletons,
toasts, confirmation dialogs. Clarity first — never sacrifice clarity for
aesthetics.

## Deliverables (real commits, verified via git log)

- [x] ADR 0016 `bccbbc5` — Professional UX Doctrine decision record
- [x] Doctrina normativa `3cd4ef0` — professional UX doctrine contract
- [x] Spec UX `6730010` — professional UX specification
- [x] QA `619e18d` — professional UX test specification (UX-*)
- [x] DECISION LOG + README `ead492b`

## Doctrine summary

- **Optimistic-safe list** (permitted): density toggle, sidebar
  collapse, column/sort view prefs, debounced search, map pan/zoom/
  layer toggles — local + reversible.
- **Never optimistic** (server-committed): any `movements`/capacity/
  role/permission write, quarantine/seizure/release,
  `layout.publish`/`restore` (confirmation + server commit), any
  operation emitting an `audit_log` row on success.
- **Timing**: search/filter debounce 300 ms trailing cancelable;
  never debounce a confirmation or destructive command.
- **Feedback**: exactly one visible outcome per mutation (success
  toast / inline error / revert-with-toast); skeleton for cold loads
  and first render; dense tables as default for operational lists
  (min 28px targets; status color + label, never color alone).
- **Error doctrine**: inline near the field; whole-form failure keeps
  input (no data loss); no silent swallow.

## Verification evidence

- `git log` + `git cat-file -e HEAD:path` on the five committed docs.
- Doctrine is **architectural/informational** — asserted in rls + rbac:
  no schema (v10 unchanged), no policy, no permission change. Layout
  publish/restore keep their Fase 14 confirmation semantics.
- QA `UX-*` suite asserts the doctrine boundary: restore→publish must
  present the publish confirmation exactly once and never an optimistic
  path on movements/capacity/publish/restore.

## Next

User-defined: next phase or move to real code implementation.
