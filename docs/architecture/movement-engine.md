# Movement Engine — Architecture Specification (Fase 9 / Prompt 10)

The movement engine is the transactional core of the platform. It is a
contract layered on the append-only movement spine
(`movements` / `movement_items`, ADR 0004) plus the capacity guards
(ADR 0006) and the kind → permission map (ADR 0007). It guarantees that
every physical modification produces exactly one applied movement and
that invalid operations are rejected atomically — never partially.

## Command contract

Every engine command carries the logical movement and the engine resolves
it to the physical spin. The UI/API surface uses the prompt's nouns; the
engine maps them to spine columns:

| Prompt noun | Engine field | Source |
| ----------- | ------------ | ------ |
| id | `movements.id` | identity |
| type | `movements.kind` | type map below |
| timestamp | `movements.occurred_at` | domain time |
| user | `movements.operator_id` | authenticated actor |
| truck | `movements.manifest_id → truck_id` or `movement_items.to_truck_id` | manifest / movement item |
| cargo | `movements.manifest_id`, `movement_items.item_lot_id` | manifest, lot |
| quantity | `movement_items.quantity` | per-lot detail |
| source | `movement_items.from_location_id` / `from_truck_id` | origin |
| destination | `movement_items.to_location_id` / `to_truck_id` | destination |
| status | `applied` (persisted movement); `failed` (audit attempt) | not a column |
| notes | `movements.reason` / `movement_items.notes` | free text |

`operation_key` (new, nullable) carries a caller-generated stable key for
idempotency; see §Idempotency.

## Type map (prompt → kind)

| Prompt type | Kind | Placement effect |
| ----------- | ---- | ---------------- |
| TRUCK_ENTRY | `arrival` | lots seed `on_truck` |
| TRUCK_EXIT | `egress` | journey closed; acknowledges remnants |
| UNLOAD | `discharge` | truck → location |
| LOAD | `load_out` | location → truck, egress acknowledged |
| TRANSFER | `transfer` | location ⟷ location |
| SCAN | `scan_in` / `scan_out` | checkpoint event on lot |
| WEIGH | `scale` | weight record on lot |
| QUARANTINE | `quarantine` | hold; freezes lot |
| SEIZURE | `seizure` | legal hold; blocks lot |
| RETURN_TO_TRUCK | `return_to_truck` (NEW) | location → truck remnant, manifest stays open |

`return_to_truck` is modeled as placement on `movement_items.to_truck_id`
with an open manifest (no egress). It maps to permission `cargo.transfer`
and is included in the `movements.kind` CHECK (schema v5, ADR 0010).

## Transactional protocol

All critical operations run in a single transaction:

1. **BEGIN** (`READ COMMITTED`, default).
2. **Lock** the affected `item_lots` rows `FOR UPDATE`; lock the
   destination `locations` row `FOR UPDATE` (this is the same serialization
   point the ADR 0006 capacity guard trigger uses).
3. **Validate** (all within the lock):
   - source availability: requested quantity ≤ Σ leaf lots in source;
   - source state: `flows.md` guard table (e.g. transfer requires source
     not frozen; quarantine/seizure freeze/block);
   - destination state: target location active, not frozen; `return_to_truck`
     requires truck on the open manifest; `load_out` requires egress
     acknowledgement;
   - permissions: engine checks the kind → permission map (ADR 0007) for
     the actor.
4. **Insert** movement + movement_items; triggers enforce the Σ leaf
   invariant (ADR 0003) and capacity guard (ADR 0006) firing on placement.
5. **Audit**: write `audit_log` row with `operation_key`, outcome
   (`applied` or `failed`) and reason; rejected attempts carry no movement.
6. **COMMIT** — all-or-nothing.

Any failed validation aborts the transaction; no partial state exists.

## Concurrency controls

- **Row locks serialize the same lot/location.** Two concurrent transfers
  of the same lot: second waits, then observes insufficient availability →
  rejected (no double transfer).
- **Capacity guard trigger** (ADR 0006) locks the destination row and
  rejects over-capacity placement; concurrent placements serialize.
- **Σ invariant trigger** (ADR 0003) rejects any mutation leaving
  Σ leaf ≠ `total_quantity` (no negative inventory, no over-split).
- **Idempotency:** `operation_key` partial unique index per org — replay
  is rejected atomically.

## Idempotency

- `movements.operation_key` is nullable; partial unique index
  `(organization_id, operation_key) where operation_key is not null`.
- Callers derive a stable key from the business operation (e.g.
  `transfer:{uuid}`); retries with the same key in the same org are
  rejected with a duplicate-operation error referencing the original
  movement. This makes client retries safe.
- Rejected attempts are audited with the same key, so operators see both
  the applied movement and the duplicate attempt.

## Timeline

Read-only query over `movements` + `movement_items`:

- Filter: organization (mandatory), facility, kind, item_lot, truck,
  date range, user (operator).
- Order: `occurred_at desc`, `id desc` tiebreak; cursor pagination.
- Index (schema v5): `(organization_id, occurred_at desc, id)` for the
  common case.
- Rows show origin, destination, quantity, date, user, notes; movement
  detail joins specialized operations (scanner/scale/hold records) when
  present.

## Audit

- `audit_log` (existing) records engine actions: movement applied
  (`movements:{id}`), attempt failed (`operation_key:{key}` + reason),
  and any server-side resolution (hold release etc.).
- Append-only; no DELETE/UPDATE grants (RLS, ADR 0007).
- Operational record of concurrency conflicts and retry decisions.

## Edge cases

- Quantity `<= 0`: rejected by CHECK.
- Nonexistent lot / closed manifest / wrong truck: rejected in validation
  (no movement row).
- Org isolation: engine queries are org-scoped; cross-org refs fail
  (RLS, ADR 0007).
- Frozen/blocked lots: quarantine/seizure operations block movement;
  release (supervisor) re-enables prior state.
- Egress with unacknowledged remnants: rejected unless remnants are
  acknowledged in the egress movement (flows.md).