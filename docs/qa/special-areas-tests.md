# Special Operational Areas — Test Specification (Fase 10 / Prompt 11)

Executable as SQL scripts / RLS integration tests against Supabase local
(E2E cases against the web client when it exists). Builds on the Fase 6
security spec (S-*), the Fase 5 capacity spec (C-*) and the Fase 9
movement engine spec (ME-*); names here are SA-*. All history
assertions enforce the **no-delete** doctrine.

Fixture: org `o1` with `u_admin`, `u_op`, `u_viewer`, `u_supervisor`
(supervisor role per RBAC matrix); checkpoints `Scanner` (scan), `Balanza`
(scale), `Control`; locations `Sector 3`, `Sector 7`; truck `T1`; item
with lots as needed.

## A. SCANNER

| ID | Scenario | Expected |
| -- | -------- | -------- |
| SA-01 | lot placed at `Scanner` checkpoint without capture | appears in pending queue (`station_queue` kind = scan) |
| SA-02 | capture success on pending lot | `scanner_operations` row: `result=success`, `scanned_code`, `scanned_at`, `operator_id`; lot leaves pending; linked `scan_in`/`scan_out` movement exists |
| SA-03 | capture with `result=not_found` / `ambiguous` / `error` | operation row still written (historical fact); lot stays pending; no movement advances it |
| SA-04 | pending queue after capture | lot no longer pending for that placement |
| SA-05 | history shows all operations newest first | includes every capture ever (success + non-success); pagination cursor; never emptied |
| SA-06 | DELETE on `scanner_operations` | **permission denied** (append-only) |
| SA-07 | UPDATE on `scanner_operations` | **permission denied** |

## B. BALANZA

| ID | Scenario | Expected |
| -- | -------- | -------- |
| SA-10 | lot placed at `Balanza` checkpoint | appears in `station_queue` kind = scale |
| SA-11 | weigh record: gross 120, tare 20, net 100 | `scale_operations`: `gross_kg=120`, `tare_kg=20`, `net_kg=100`, `weighed_at`, `operator_id`; `scale` movement linked |
| SA-12 | net = gross − tare when net not entered | computed; unit kg; item uom shown alongside |
| SA-13 | within tolerance | `expected_kg` + `tolerance_kg` set, `within_tolerance=true` for |gross−expected| ≤ tolerance |
| SA-14 | outside tolerance | `within_tolerance=false` recorded (still a historical row) |
| SA-15 | non-positive net attempt | rejected (CHECK/engine) |
| SA-16 | truck context | derived from lot placement / manifest truck, shown on record, not a column |
| SA-17 | DELETE/UPDATE on `scale_operations` | **permission denied** (append-only) |

## C. REZAGO (hold)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| SA-20 | open case (supervisor) | `quarantine_operations`: `reason`, `opened_by`, `opened_at`, `status=open`; `quarantine` movement linked; lot **frozen** |
| SA-21 | frozen lot: transfer/split/load_out attempt | **rejected** by engine (ME-20 pattern; no movement) |
| SA-22 | quantity shown | derived Σ leaf lots at held placement |
| SA-23 | observaciones (`resolution_note`) | free text on case; shown on resolve |
| SA-24 | resolve (supervisor) | `release` movement; `status=resolved` (then `released`); `resolved_by/resolved_at` set; lot movement re-enabled |
| SA-25 | case history | open + resolved cases all present, newest first; **no DELETE allowed** |
| SA-26 | DELETE on `quarantine_operations` | **permission denied** |
| SA-27 | open case without `quarantine.create` (u_op) | **denied** |
| SA-28 | resolve without supervisor up-front | server-side flow rejects (kind → permission/guard) |

## D. SECUESTRO (legal hold)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| SA-30 | open case (supervisor) | `seizure_operations`: `legal_ref`, `opened_by`, `opened_at`, `status=open`; `seizure` movement linked; lot **blocked** |
| SA-31 | blocked lot: ANY movement attempt | **rejected** (frozen/blocked guard; ME-21 pattern) |
| SA-32 | documentation upload | `attachments` row with `entity_type = seizure_operation`, `entity_id` = case id; file in Storage; list shown in panel |
| SA-33 | state shown | `status open|resolved` on panel/history |
| SA-34 | resolve (supervisor) | `release` movement; `status=resolved`, `resolved_by/at`; block lifted |
| SA-35 | case history incl. attachments | all cases + their attachments; no delete |
| SA-36 | DELETE on `seizure_operations` | **permission denied** |
| SA-37 | open case without `seizure.create` | **denied** |
| SA-38 | attachment cross-org | denied/empty via RLS (S-13 pattern) |

## E. Permissions / org isolation / edges

| ID | Scenario | Expected |
| -- | -------- | -------- |
| SA-40 | u_viewer reads queues/history | visible (read perms) |
| SA-41 | u_viewer writes (capture/weigh/open case) | **403 / empty** |
| SA-42 | u_other (o2) reads o1 area data | empty/404 (RLS) |
| SA-43 | area write without movement | rejected (all ops need `movements` link, append-only) |
| SA-44 | hold freezes capacity counting? | occupancy includes holds at location (Fase 6 C-41 semantics unchanged) — open hold at location still counts toward capacity |
| SA-45 | station queue duplicates after two captures | only latest completed placement state drives pending; no duplicate queue rows (view unique by lot+placement) |

## F. Schema asserts (database layer)

| ID | Assert |
| -- | ------ |
| SA-50 | `scanner_operations.result` CHECK: success/not_found/ambiguous/error |
| SA-51 | `quarantine_operations.status` CHECK: open/resolved/released |
| SA-52 | `seizure_operations.status` CHECK: open/resolved |
| SA-53 | `attachments.entity_type` includes `seizure_operation` (and `quarantine_operation`) |
| SA-54 | `station_queue` view exists (schema v6), read-only |
| SA-55 | `hold_open` view exists (schema v6), read-only |
| SA-56 | RLS matrix row policies unchanged (no Fase 10 edit) |

## G. Execution notes

- History/no-delete cases run as negative permission tests (expect
  denial), mirroring the S-24 pattern on the movement spine.
- Race cases (two captures on same pending lot) behave like ME-01:
  row locks serialize; one captures, the other is a new historical row
  (append-only, no conflict).
- These specs run against Supabase local when the repo web client
  exists; until then they are the executable subset against SQL.