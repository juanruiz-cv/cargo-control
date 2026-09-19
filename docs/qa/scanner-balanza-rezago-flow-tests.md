# Scanner → Balanza → Rezago Flow — Test Specification

Cross-topic assertion home for the operational flow that links the special
operational areas (`Scanner`, `Balanza`, `Rezago`) into one verifiable
journey, per Cargo Control QA strategy (DOC-3 one home per topic; this home
owns the **flow-level** assertions only — `SBF-*`).

Builds on, but does not re-assert (each kernel topic already has its own
home):

| Already-owned kernel | Its QA home | Its assert IDs |
| -------------------- | ----------- | -------------- |
| Movement engine      | `docs/qa/movement-engine-tests.md` | `ME-*` |
| Special operational areas (single-station semantics) | `docs/qa/special-areas-tests.md` | `SA-*` |
| Floor plan versioning | `docs/qa/floor-plan-versioning-tests.md` | `FV-*` |
| Audit system         | `docs/qa/audit-tests.md` | `AU-*` |

## 1. Scope

Assertions here belong to the **cross-checkpoint flow**: a lot arriving on
a truck, its decision to unload or not, its journey through `Scanner` and
`Balanza` checkpoints, and its resolution to `Rezago` (delay) or `Secuestro`
(seizure) — plus what the doctrine guarantees underneath every step
(append-only audit, complete history recovery).

Not in scope: single-station behavior (owned by `SA-*`), the movement
engine's own invariants (owned by `ME-*`), layout/editor mechanics (owned by
`FV-*`/floor-plan homes), and RLS row-level rules (owned by
`docs/security/rls.md`).

### Fixtures

Same fixture set as the kernel QA homes so results compose: org `o1` with
`u_admin`, `u_op`, `u_viewer`, `u_supervisor`; checkpoints `Scanner` and
`Balanza` of org `o1`; playón area; truck `T1`; lots `L-A`, `L-B`, `L-C`.

## 2. Flow-191 end-to-end assertions (`SBF-*`)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| SBF-01 | truck `T1` arrives at playón with `L-A` | `truck_movements` row for the ingress exists; lot is at a playón location (kind=playon), **not yet** in any checkpoint queue |
| SBF-02 | operator decides to unload `L-A` | `movements` row recorded (truck → playón), `kind=unload`; the doctrine's unload/de-unload decision is the only gate for the next step |
| SBF-03 | lot placed at `Scanner` checkpoint | appears in `station_queue` (`kind=scan`) — pending `scanner_operations` queue (SA-01 overlap expected; here we assert the **transition** arrives) |
| SBF-04 | scanner capture succeeds on pending `L-A` | `scanner_operations` row `result=success`; lot leaves pending; linked `scan_in`/`scan_out` movements exist (movement engine owns those; here we assert the linkage exists) |
| SBF-05 | scanner capture result `not_found` / `ambiguous` / `error` | operation row still written (historical fact, append-only); lot **stays** pending; no movement advances it |
| SBF-06 | lot placed at `Balanza` checkpoint | appears in `station_queue` (`kind=scale`) — pending `scale_operations` |
| SBF-07 | scale weighing succeeds on pending lot | `scale_operations` row with `result=success`, `gross_weight`, `tare_weight`, `net_weight`; lot leaves pending |
| SBF-08 | scale result invalid (zero/negative/`error`) | operation row still written; lot stays pending; no movement advances it |
| SBF-09 | lot unresolved at both checkpoints past tolerance | `rezago` (delay) state becomes eligible: ownership (org scope) and audit trail stay intact; movement to a hold location is permitted (ME-* owns the movement; here we assert the **eligibility decision** is data, not hardcoded) |
| SBF-10 | authorized operator moves lot to `Rezago` location | movement recorded; lot at rezago location (`location.kind` in the special-operational set); audit AU row references the movement (history recoverable) |
| SBF-11 | lot at `Rezago` is re-scanned after resolution | a **new** scanner operation is appended (append-only; no UPDATE/DELETE on prior rows — SA-06/SA-07 doctrine); history shows the full sequence, nothing removed |
| SBF-12 | lot moved to `Secuestro` / legal hold | movement recorded; a hold marker exists on the lot; `in_transit`/audit reflects the frozen state; no UPDATE/DELETE possible on the hold record |
| SBF-13 | viewer `u_viewer` queries flow history | sees every step (unload → scan → scale → rezago/hold) in order via audit; **no** mutation capability (RLS read-only viewer) |
| SBF-14 | operator `u_op` attempts `DELETE` on a flow-row (`scanner_operations` / `scale_operations` / `movements`) | **permission denied** (append-only; SA-06/SA-07 + audit no-delete doctrine) |
| SBF-15 | operator `u_op` attempts `UPDATE` on the same flow-rows | **permission denied** (append-only) |
| SBF-16 | concurrent flow: same lot scanned at Scanner while being weighed at Balanza | exactly one checkpoint's decision applies deterministically; the other is rejected (movement engine lock order; ME-* owns the concurrency assert — here we assert no double-advance of the lot) |
| SBF-17 | lot with open `Rezago` / hold marker attempted to be moved out | rejected (frozen source; ME-* owns the freezer guard) unless the hold is resolved first |
| SBF-18 | flow head from playón with empty manifest | rejected (no decision materializes); no movement row; audit records the rejection event |
| SBF-19 | complete flow: `T1` playón → unload → Scanner success → Balanza success → Rezago → Secuestro | one movement chain in `movements` with immutable history; every link recoverable via audit end-to-end |
| SBF-20 | flow history after a resolved lot | **complete**: each operation (unload, scan_in/out, weigh, rezago, hold) has its OWN append-only row preserving `scanned_at`/`weighed_at`/`held_at`, operator, and result — **nothing deleted, nothing overwritten** |

## 3. Procedure/handling

- Same fixtures as kernel homes; reuse stations `Scanner`, `Balanza`,
  playón, truck `T1`, lots `L-A`/`L-B`/`L-C`, roles from the RBAC matrix.
- History-order assertions (SBF-19/20) MUST be asserted against the audit
  trail, never against a mutable in-memory list.
- Security/RLS assertions in this home defer to `docs/security/rls.md` and
  the security test home; they assert observed denial, not the rule text.

## 4. Invariants this home protects

- Append-only: no UPDATE/DELETE on any flow row (SBF-14/15).
- Complete history: the audit trail reconstructs the whole flow for any lot
  (SBF-19/20).
- No double-advance: a lot can be advanced by exactly one checkpoint
  decision per step (SBF-16/17).
