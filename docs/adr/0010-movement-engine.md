# ADR 0010 — Movement Engine: transactional movement core

- **Status:** Accepted
- **Date:** 2026-09-19
- **Fase:** 9 — Motor de movimientos (Prompt 10)

## Context

Fase 9 makes the movement engine the transactional core of the platform:
every physical modification must produce a movement; locations are never
edited directly; transfers validate availability, destination capacity,
source/destination state and permissions; critical operations run
transactionally; the system must prevent negative inventory, double
transfer, over-capacity placement and duplicate operations; a movement
timeline and audit trail are required.

The platform already has an append-only movement spine (Fase 4,
ADR 0004): `movements` + `movement_items` with kinds
`arrival | discharge | split | transfer | scan_in | scan_out | scale |
store | load_out | quarantine | seizure | release | egress | correction`,
plus per-lot placement (`item_lots` with the Σ leaf invariant, ADR 0003),
capacity guards (Fase 5, ADR 0006) and a kind → permission map
(Fase 6, ADR 0007). The work here is to formalize the engine contract on
top of that spine and close the two gaps the prompt exposes.

## Decisions

1. **Engine = contract over the existing spine.** The movement spine and
   its triggers already enforce append-only behavior and the Σ invariant;
   this ADR specifies the transactional protocol, per-kind validation and
   idempotency that make it a real engine, without schema redesign.

2. **Type map (prompt → kind).** All prompt types resolve to existing
   kinds except one:
   | Prompt type | Kind |
   | ----------- | ---- |
   | TRUCK_ENTRY | `arrival` |
   | TRUCK_EXIT | `egress` |
   | UNLOAD | `discharge` |
   | LOAD | `load_out` |
   | TRANSFER | `transfer` |
   | SCAN | `scan_in` / `scan_out` |
   | WEIGH | `scale` |
   | QUARANTINE | `quarantine` |
   | SEIZURE | `seizure` |
   | RETURN_TO_TRUCK | **`return_to_truck` (NEW)** |

   `return_to_truck` is added because returning a remnant to the truck
   without an egress is a distinct semantic (placement on `to_truck_id`
   while the manifest stays open); reusing `transfer` for it would lose
   the truck-bound meaning and reuse `load_out` would wrongly suggest an
   egress. It is a schema delta of exactly one CHECK constant.

3. **Movement status = applied, not stored.** The spine is append-only
   and a persisted movement IS an applied fact; a mutable `status` column
   would break that principle. Rejected attempts never persist as
   movements: they are recorded in `audit_log` (outcome `failed` +
   reason + `operation_key`), so the engine's history shows both applied
   movements and rejected attempts without mutating the spine.

4. **Idempotency — `operation_key`.** New nullable
   `movements.operation_key` plus a partial unique index
   `(organization_id, operation_key) where operation_key is not null`.
   Callers generate a stable key per business operation; replaying the
   same key in the same org is rejected (duplicate operation) with a
   stable error referencing the original movement. This closes the
   "duplicate operation" requirement at the source and makes retries safe.

5. **Transactional protocol.** Every critical operation runs in one
   transaction: lock affected `item_lots` rows `FOR UPDATE` and the
   destination `locations` row (serializing with the ADR 0006 capacity
   guard), then validate, insert the movement + movement_items, update
   lot placements through the existing triggers, write audit, commit.
   Any failed validation aborts the whole transaction — no partial state.

6. **Validation before placement.** Negative inventory is impossible by
   construction: `quantity > 0` CHECK plus the source-availability check
   (available = Σ leaf lots in source ≥ requested) inside the lock, and
   the Σ invariant trigger. Double transfer is prevented by the row lock:
   the second concurrent transfer of the same lot observes an empty
   source after the first commits.

7. **Timeline and audit reads.** The timeline is a read-only query over
   `movements` + `movement_items` ordered by `occurred_at desc`
   (pagination + index); audit rows carry per-attempt outcome. No new
   permission codes: reads use `cargo.read`, writes reuse the kind →
   permission map; `return_to_truck` maps to `cargo.transfer`.

## Consequences

- Schema v5: one new CHECK constant (`return_to_truck`), one nullable
  column (`operation_key`) with a partial unique index, plus a timeline
  index on `occurred_at`; no RLS/RBAC change (asserted).
- Concurrency safety comes from row locks already proven by the ADR 0006
  capacity guard (same `FOR UPDATE` pattern), extended to the movement
  engine protocol.
- Rejected attempts are audited, giving an operational record of retries
  and conflicts without mutating the append-only spine.
- QA spec adds explicit concurrency and edge-case scenarios
  (`docs/qa/movement-engine-tests.md`, ME-*).
- Engine contract lives in `docs/architecture/movement-engine.md`;
  timeline UI in `docs/ux/movements-timeline.md`.

## References

- ADR 0003 (item lots, Σ invariant), ADR 0004 (movement spine),
  ADR 0006 (capacity guards), ADR 0007 (permissions/RLS),
  ADR 0009 (cargo module).