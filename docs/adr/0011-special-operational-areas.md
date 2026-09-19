# ADR 0011 — Special Operational Areas: scanner, scale, rezago, secuestro

- **Status:** Accepted
- **Date:** 2026-09-19
- **Fase:** 10 — Scanner, Balanza, Rezago y Secuestro (Prompt 11)

## Context

Fase 10 requires four special operational areas — SCANNER, BALANZA,
REZAGO, SECUESTRO — each behaving as a special location but with its own
rules; each with a history of performed operations; operations must never
be deleted. The prompt lists per-area fields (scanner result/date/user/
merchandise; scale truck/gross/tare/net/unit/date/user; rezago
merchandise/quantity/reason/date/user/observations; secuestro
merchandise/quantity/reason/date/user/status/documentation/
observations).

The platform already models all of this through the movement spine and
specialized operation tables (Fase 4, ADR 0005 checkpoint locations;
Fase 5, ADR 0006 capacity/scale; Fase 6, ADR 0007 permissions; Fase 9,
ADR 0010 engine):
- `scanner_operations` — code capture, `result`, `scanned_at`,
  `operator_id`;
- `scale_operations` — `gross_kg`, `tare_kg`, `net_kg`, tolerance,
  `weighed_at`, `operator_id`;
- `quarantine_operations` — rezago hold (open/resolved/released);
- `seizure_operations` — legal hold (open/resolved);
- `attachments` — already supports `entity_type = seizure_operation`
  (documentation);
- checkpoint locations (`type='checkpoint'`, `checkpoint_kind =
  'scan'|'scale'`) for scanner and scale stations.

## Decisions

1. **Two areas are locations, two are holds.** SCANNER and BALANZA map
   to special locations of type checkpoint (`scan`, `scale`) — physical
   stations where a lot passes. REZAGO and SECUESTRO are **holds on the
   lot, not locations**: they don't occupy floor space; an open case
   freezes (rezago) or blocks (secuestro) the lot and any movement of it
   (Fase 4 domains, Fase 9 engine). Keeping them as holds preserves the
   physical model and the movement rules.

2. **Full field mapping onto existing tables — zero new columns.**
   Every requested field resolves to an existing column or a derived
   read: see the map in `docs/architecture/special-areas.md`. In
   particular, secuestro documentation is served by the existing
   `attachments` polymorphic reference to `seizure_operation` — no
   schema change.

3. **Pending operations are a derived queue, never a column.** Scanner
   (and scale) pending = lots currently placed at a `scan` (or `scale`)
   checkpoint without a completed operation for the current placement;
   performed operations = rows in the op tables. The queue is a read-side
   view (schema v6), consistent with the platform's derived-state
   doctrine (ADR 0008 trucks, ADR 0009 cargo).

4. **History is complete and append-only.** `scanner_operations` and
   `scale_operations` are append-only (no UPDATE/DELETE grants).
   Hold cases are NEVER deleted: opening creates a `quarantine`/`seizure`
   movement + case row; resolution creates a `release` movement and
   updates only the case status server-side. The full history is the
   movement spine plus the operation rows — nothing is ever dropped.

5. **Permissions reuse the catalog.** No new codes: `scanner.*`,
   `scale.*`, `quarantine.*`, `seizure.*` from the Fase 6 catalog; holds
   resolution stays a server-side supervisor flow (Fase 9). RLS and RBAC
   matrices are unchanged (asserted).

## Consequences

- Schema v6 = derived read-side views + append-only asserts on the four
  operation tables; **no new columns, no migration**.
- The four areas ship with their own UX spec
  (`docs/ux/special-areas.md`) and QA (`docs/qa/special-areas-tests.md`,
  SA-* cases) including history/no-delete assertions.
- A lot in rezago/secuestro cannot move (freeze/block), cannot be split,
  transferred or egressed — enforced by movement engine validation
  (Fase 9) without new policy; documented per area.

## References

- ADR 0004 (movement spine), ADR 0005 (checkpoint locations),
  ADR 0006 (scale/capacity), ADR 0007 (permissions/RLS),
  ADR 0010 (movement engine).