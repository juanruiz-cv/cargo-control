# Movement Engine — Concurrency & Edge-Case Test Specification (Fase 9 / Prompt 10)

Executable as SQL scripts / RLS integration tests against Supabase local
(E2E cases against the web client when it exists). Builds on the Fase 6
security spec (S-*) and the Fase 5 capacity spec (C-* conflict — here
renamed ME-*). All critical cases are **transactional**: a failed case
leaves zero partial state.

Fixture: org `o1` with roles/members `u_admin`, `u_op`, `u_viewer`;
locations `Sector 3`, `Sector 7`, `Scanner`, `Camión` (truck `T1`)
permissions `cargo.*`, `truck.exit`, etc. from `docs/security/rbac.md`.

## A. Concurrency — same lot / same location (row-lock races)

Run two sessions concurrently (Postgres): each case must end in exactly
one applied movement and one rejected attempt (audited), never two.

| ID | Scenario | Expected |
| -- | -------- | -------- |
| ME-01 | transfer 15u of lot L-X to Sector 3 AND transfer 15u of same lot L-X to Sector 7, simultaneously | exactly one `transfer` applies; the other is rejected (source availability after lock); Σ leaf unchanged; reject audited (`outcome failed`, reason) |
| ME-02 | split lot 100 → 60/40 AND split same lot 100 → 50/50, simultaneously | exactly one split applies (available 100 once); the second sees insufficient source (parent consumed); Σ invariant holds for all leaf lots |
| ME-03 | load_out 30u AND return_to_truck 30u of same truck-unloaded location lot, simultaneously | exactly one applies; the loser is rejected (no double spend of the same source qty) |
| ME-04 | transfer 25u into Sector 3 whose remaining capacity is 25u AND concurrent another 10u transfer into Sector 3 | first applies; second is **over capacity** (ADR 0006 guard, serialized by `locations` row `FOR UPDATE`) |
| ME-05 | quarantine a lot AND transfer the same lot, concurrently | movement loses: quarantine freezes first (state guard); transfer rejected; quarantine remains applied |
| ME-06 | egress truck AND return_to_truck onto same truck, concurrently | egress wins if it closes the manifest first; return_to_truck rejected (manifest closed). If return_to_truck applied first, egress then acknowledges the remnant. Both orders deterministic under lock order; assert exactly one terminal state |
| ME-07 | duplicate replay: same `operation_key` re-sent immediately after success | **rejected** by partial unique index; audits as duplicate; original movement unaffected (`id` unchanged) |

## B. Negative inventory / quantity invariants

| ID | Scenario | Expected |
| -- | -------- | -------- |
| ME-10 | transfer qty > available on source lot | rejected (availability check); no movement row |
| ME-11 | transfer qty = available | applied; source lot now empty (`current_location_id`/`current_truck_id` null; Σ leaf intact) |
| ME-12 | transfer qty 0 or negative | rejected by CHECK `quantity > 0` |
| ME-13 | split qty leaving Σ child ≠ parent | rejected by Σ invariant trigger (ADR 0003) |
| ME-14 | direct UPDATE of `item_lots.current_location_id` without a movement | **permission denied** (no UPDATE grant; placement only through movements) |
| ME-15 | direct UPDATE/DELETE of `movements` / `movement_items` | **permission denied** (append-only; corrections are new rows) |

## C. State guards — source / destination

| ID | Scenario | Expected |
| -- | -------- | -------- |
| ME-20 | transfer from a lot in `in_quarantine` (open case) | rejected (frozen source) |
| ME-21 | transfer from a lot with open `seizure` record | rejected (blocked source) |
| ME-22 | transfer into a frozen / inactive destination location | rejected (destination state) |
| ME-23 | return_to_truck with `to_truck_id` not on the open manifest | rejected (truck not on manifest) |
| ME-24 | return_to_truck while truck already closed (egress applied) | rejected (manifest closed) |
| ME-25 | load_out without egress acknowledgement | rejected per flows.md (egress acknowledgment required) |
| ME-26 | discharge from `on_truck` lot not on the arrival truck | rejected (truck mismatch) |
| ME-27 | release of a lot without open quarantine/seizure case | rejected (no case to resolve) |

## D. Permissions / org isolation

| ID | User | Action | Expected |
| -- | ---- | ------ | -------- |
| ME-30 | u_op | any engine write (transfer/split/…) | applied (map: split → `cargo.update`, transfer → `cargo.transfer`) |
| ME-31 | u_viewer | engine write | **403 / empty** (S-14 default deny) |
| ME-32 | u_viewer | timeline read | visible (read path allowed) |
| ME-33 | u_op | return_to_truck | **denied** (needs `cargo.transfer`, supervisor-level per RBAC matrix) |
| ME-34 | u_admin | return_to_truck | applied (has `cargo.transfer`) |
| ME-35 | u_op | quarantine / seizure | **denied** (needs supervisor/manager) |
| ME-36 | u_op | egress | denied without `truck.exit` |
| ME-37 | u_other (o2) | timeline reads o1 org data | empty/404 (RLS org isolation) |

## E. Timeline & audit

| ID | Scenario | Expected |
| -- | -------- | -------- |
| ME-40 | timeline query (org-scoped, `occurred_at desc`, pagination) | newest first, tiebreak `id desc`; cursor pagination; `movements_org_time_idx` used |
| ME-41 | movement detail with specialized op | joins scanner/scale/hold when present; shows origin, destination, quantity, date, user, notes |
| ME-42 | audit on applied movement | `audit_log` row: `outcome applied`, `movements:{id}` |
| ME-43 | audit on rejected attempt | `audit_log` row: `outcome failed`, reason, `operation_key:{key}` — no movement row |
| ME-44 | audit append-only | no UPDATE/DELETE on `audit_log` (S-24 pattern) |

## F. Schema asserts (database layer)

| ID | Assert |
| -- | ------ |
| ME-50 | `movements.kind` CHECK includes `return_to_truck` (15 constants total) |
| ME-51 | `movements.operation_key` nullable; partial unique index `(organization_id, operation_key) where operation_key is not null` exists |
| ME-52 | `movements_org_time_idx (organization_id, occurred_at desc)` exists (timeline) |
| ME-53 | RLS matrix unchanged for `movements`/`movement_items`/`item_lots` (no Fase 9 edit) |
| ME-54 | no `status` column on `movements` (applied = persisted; failures audited) |

## G. Execution notes

- Race cases run as two connections with `BEGIN … COMMIT` around the
  engine call; assert exactly one commit succeeds and one audit `failed`
  row exists.
- Rejected attempts must never appear in `movements`; they appear only
  in `audit_log`.
- These specs run against Supabase local (later, when the repo web client
  exists); until then they are the executable subset against SQL.