# Trucks Module — Test Specification (Fase 7 / Prompt 08)

Executable as SQL scripts (database layer) and E2E cases
(`docs/qa/strategy.md`, Playwright against Supabase local when the web
client exists). Builds on the Fase 6 security spec
(`docs/qa/security-tests.md`); references its cases (S-*) instead of
duplicating them. Marked **[E2E]** run against the UI; everything else runs
against the database layer.

Fixture: org `o1` with `u_admin`, `u_op` (operator), `u_viewer`; the
`truck.*` permissions and kind → permission map from
`docs/security/rbac.md` / `docs/security/authorization.md`.

## A. TruckList — lazy loading, search, filter, sort

| ID | Scenario | Expected |
| -- | -------- | -------- |
| T-01 | open `/trucks` | first page of 20 rows by `plate asc`; **no count query** on first paint |
| T-02 | > 20 trucks | `Cargar más` fetches next page; count query issued **only** when rendered page is full |
| T-03 | search `AB-` | debounced (300 ms) substring on `plate`; results sorted `plate asc` |
| T-04 | filter base status = `in_playon` | only rows with `trucks.status='in_playon'` (stored base status, not badge) |
| T-05 | sort by `transport_company` / `status` | ordering by stored column; sort reset to `plate asc` on filter change |
| T-06 | search no results | "Sin resultados para «{query}»"; no error |
| T-07 | load failure on page 2 | retry CTA; rendered cards stay visible |
| T-08 | first page p95 | ≤ 2 s on 50k truck rows (cursor on `plate`) |

## B. TruckStatusBadge — derivation precedence

Scenario table: `u_admin` views trucks with these signals (no write
happens — derived read-side; ADR 0008 §2, map in `states.md`).

| ID | Base status | Latest movement | Open ops | On-truck lots | Expected badge |
| -- | ----------- | --------------- | -------- | ------------- | -------------- |
| T-10 | available | arrival | quarantine | 0 | `RETAINED` |
| T-11 | available | arrival | none | 0 | `WAITING` |
| T-12 | available | arrival | scanner | 0 | `IN_SCANNER` |
| T-13 | available | arrival | scale | 0 | `IN_SCALE` |
| T-14 | in_playon | arrival | none | 0 | `IN_PLAYON` |
| T-15 | available | discharge (open) | none | > 0 | `PARTIALLY_UNLOADED` |
| T-16 | available | discharge (open) | none | 0 | `IN_PROCESS` |
| T-17 | available | egress | none | 0 | `EXITED` |
| T-18 | out_of_service | (none) | none | 0 | `OUT_OF_SERVICE` |
| T-19 | available | (no movement) | none | 0 | manifest exists → `EXPECTED`; else `AVAILABLE` pass-through |

- T-20: precedence order — open hold (`RETAINED`/`SEIZED`) beats open
  station op (`IN_SCANNER`/`IN_SCALE`) beats movement-derived states.
- T-21: badge computation issues **no** extra query per card (reuses loaded
  list projection); **no** badge code is persisted to `trucks.status`.

## C. Entry & exit are movements (auditability)

| ID | Scenario | Expected |
| -- | -------- | -------- |
| T-30 | truck enters via `arrival` movement | `movements` row kind=`arrival` + matching `movement_items`; `audit_log` row for actor/action |
| T-31 | truck exits via `egress` movement | kind=`egress` row + `audit_log` row; requires `truck.exit` (S-16/S-17) |
| T-32 | **no** `entry_at` / `exit_at` columns | schema assert: `trucks` has **no** entry/exit date column (ADR 0008 §3) |
| T-33 | **no** 13-code CHECK | `trucks.status` CHECK remains the 5 fleet codes; a 13-code CHECK fails DDL assert (ADR 0008 §1) |
| T-34 | UI shows derived ingreso/egreso | ingreso = first `arrival` timestamp; egreso = last `egress` timestamp |
| T-35 | `TruckEditDialog` [E2E] | **never** offers entry/exit date fields; save rejects any attempt to send them |

## D. Permissions on the module UI [E2E]

| ID | User | Action | Expected |
| -- | ---- | ------ | -------- |
| T-40 | u_op | open `/trucks` | list renders (`truck.read`) |
| T-41 | u_viewer | open `/trucks` | empty list, no error (RLS `truck.read` not granted) |
| T-42 | u_op | click `+ Nuevo` | create dialog opens (`truck.create`) |
| T-43 | u_viewer | click `+ Nuevo` | no CTA visible (route guard cosmetic; RLS is authority) |
| T-44 | u_viewer | POST create truck (raw API) | **403 / empty** (S-14 default deny) |
| T-45 | u_op | edit a truck | save succeeds (`truck.update`); 409 on duplicate `plate` |
| T-46 | u_op | click Salida (egress) | hidden/disabled — `truck.exit` not granted (S-16) |
| T-47 | u_admin | click Salida (egress) | egress dialog opens; confirmed → `egress` movement created |

## E. Details & timeline

| ID | Scenario | Expected |
| -- | -------- | -------- |
| T-50 | open `/trucks/:id` | header + read-only fields; badge matches B-table derivation |
| T-51 | TruckTimeline [E2E] | latest 50 movements newest-first; "Ver más" loads older; rows link where actor has read |
| T-52 | timeline row for a hold | related module row visible for `quarantine.read` holder; hidden for others (RLS) |
| T-53 | observations add/edit | requires `truck.update`; save via RLS (S-15 pattern) |
| T-54 | org isolation | `u_other` (o2) opening an o1 truck URL → empty/404; no cross-org data (S-13) |

## F. Schema asserts (database layer)

| ID | Assert |
| -- | ------ |
| T-60 | `trucks.status` CHECK = 5 fleet codes (`available','in_playon','in_route','out_of_service','inspection`) |
| T-61 | no `entry_at` / `exit_at` / `status_updated_by` columns on `trucks` |
| T-62 | `movements.kind` CHECK includes `arrival` and `egress` (spine §4.7) |
| T-63 | RLS matrix row for `trucks` still reads `truck.read | truck.create | truck.update` (no Fase 7 edit) |

## G. Update flow / work unit boundary

These spec cases are the QA verification for the Fase 7 work units; they
run after the web client is implemented (later per master plan). Until then,
the database-layer asserts (A: T-01/T-02 as query-shape review, C: T-30–T-34,
F: T-60–T-63) are the executable subset against a Supabase local instance.