# Floor Plan Editor Versioning — Test Specification (Fase 14 / Prompt 15)

Executable as SQL scripts / RLS integration tests against Supabase local
(E2E cases against the web client when it exists). Builds on the Fase 4
layout spec (L-*), the Fase 5 capacity spec (C-*) and the Fase 13 audit
spec (AU-*); names here are VE-* (version editor).

Fixture: org `o1` with `u_admin`, `u_sup` (supervisor), `u_op`,
`u_viewer`; facility with layout name "Patio" (multiple versions) and
sectors/checkpoints; trucks and lots for movement assertions.

## A. Version model & metadata

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-01 | create first version | row version=1, status draft, created_by = actor, created_at set, changes=[] or null |
| VE-02 | create new version from current | version+1, draft, copies elements (element set equal) |
| VE-03 | create new version with description | `description` stored verbatim |
| VE-04 | `changes` summary written on save | jsonb: from_version, per-element diffs (field/before/after), counts; viewable in history |
| VE-05 | version identity | `unique (facility_id, name, version)` — duplicate version rejected |
| VE-06 | previous version untouched by later edits | editing v3 leaves v1/v2 rows (layouts + layout_elements) byte-identical |

## B. Operations

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-10 | publish draft with confirmation | status → published after confirm; audit `layout.publish` written |
| VE-11 | publish second draft | previous published → archived in same tx; exactly one published per facility+name |
| VE-12 | view previous version | read-only rows returned; editing controls absent |
| VE-13 | compare two versions | server-side diff rows: added/removed/changed fields, no client-side comparison |
| VE-14 | restore version N | NEW draft version+1 with elements copied from N; N's rows unchanged; audit `layout.restore` |
| VE-15 | restore then edit | new draft is editable; history rows still immutable |
| VE-16 | cancel publish confirmation | nothing published, no audit row, previous draft unchanged |

## C. Restore never touches movements (CRITICAL)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-20 | full restore cycle (restore → publish) | **zero** rows in `movements`/`movement_items` |
| VE-21 | visual edit (drag element) | **zero** movement rows; audit `layout.edit` only |
| VE-22 | compare/view versions | no writes anywhere |
| VE-23 | movement history present before restore | untouched: same rows, same order, same timestamps |

## D. Capacity separation (guard + audit preserved)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-30 | capacity change via locations flow | still audited `capacity.set` with before/after |
| VE-31 | capacity reduction below occupancy | still rejected by trigger |
| VE-32 | visual edit attempts to touch capacity | impossible: capacity fields are not part of layout editing surfaces |

## E. Visual history & publish confirmation

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-40 | history list | all versions ordered by version: number, status, createdAt, createdBy, description, change counts |
| VE-41 | publish confirmation content | dialog shows version, description, change counts, diff preview; confirm/cancel behave |
| VE-42 | restore confirmation content | dialog explains new-draft semantics + no-movement guarantee |

## F. Permissions & isolation

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-50 | viewer with `warehouse.read` | sees versions, can view/compare; no create/publish/restore buttons |
| VE-51 | operator without `warehouse.configure` | edit actions denied server-side (RLS), buttons hidden |
| VE-52 | supervisor/admin | full create/publish/restore/edit |
| VE-53 | org B cannot read org A versions | layouts row policies isolate; cross-org query returns no rows |

## G. Edge cases

| ID | Scenario | Expected |
| -- | -------- | -------- |
| VE-60 | restore from archived version | works (copy semantics), new draft created |
| VE-61 | version with no elements | restore yields empty draft; publish allowed; no phantom elements |
| VE-62 | element deleted in history render | marker hidden (is_visible=false or gone); historical layout still renders archived state |
| VE-63 | scale change between versions | compare includes scale in diff; map uses per-version scale |