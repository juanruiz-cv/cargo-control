# Acceptance Criteria — Cargo Control

Given/When/Then criteria for critical stories. These are the contract for the
web implementation and the QA tests (`docs/qa/strategy.md`).

## AC-E2-2 — Partial discharge

- **Given** a cargo `CAR-001` with item `MER-A` (1000 units, status `on_truck`),
- **When** the operator discharges 300 units,
- **Then** a lot of 300 units is created at the control checkpoint, **and**
  a remnant lot of 700 units remains `on_truck`, **and** both events are in the
  movement trail.

## AC-E3-1 — Split of an item into lots

- **Given** item `MER-A` with 1000 units at a location,
- **When** the operator splits it into 300, 250, 150, 100, 100, 100,
- **Then** six lots exist, each with destination location and quantity,
- **And** the sum of lot quantities equals the item total (1000),
- **And** the split is recorded as an immutable event with actor and timestamp.

## AC-E3-4 — Chained split

- **Given** a lot `LOT-5` with 100 units in Sector 8,
- **When** the operator splits it into 40 and 60,
- **Then** two child lots exist (40 → destination A, 60 → destination B),
- **And** the parent lot reference is preserved (child `parent_lot_id = LOT-5`),
- **And** the source total remains balanced (40 + 60 = 100).

## AC-E5-2 — Scale tolerance

- **Given** a lot expected at 100 kg with tolerance ±5 kg,
- **When** a reading of 112 kg is taken,
- **Then** the reading is recorded as `within_tolerance = false`,
- **And** an alert is raised (Warning), **and** the lot is not silently accepted.

## AC-E6-2 — Rezago resolution

- **Given** a lot under rezago (warning),
- **When** the supervisor resolves and releases it,
- **Then** the lot status returns to a normal lifecycle state,
- **And** the resolution event records actor, timestamp and reason.

## AC-E7-2 — Seizure freeze

- **Given** a seizure record on a lot (blocked),
- **When** any operator attempts a stock movement on that lot,
- **Then** the movement is refused, **and** an audit event records the attempt.

## AC-E8-3 — Correction integrity

- **Given** an erroneous event in the trail,
- **When** a correction is made,
- **Then** the original row is unchanged, **and** a `correction` event references
  `previous_event_id = original`, **and** readers see both.

## AC-E9-2 — Sensitive action audit

- **Given** an operator session,
- **When** a sensitive action is executed (quarantine, seizure, release, role
  change),
- **Then** an audit entry records actor, action, entity, before/after and reason.

## Cross-cutting

- All mutating stories produce an append-only `checkpoint_event`.
- Sum-of-lots invariant holds after every split/transfer (DB-trigger enforced).