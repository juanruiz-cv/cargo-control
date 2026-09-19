# BUSINESS-RULES.md — Cargo Control

Domain invariants. These rules are enforced in the **data layer**
(PostgreSQL constraints, triggers, RLS) and additionally in Edge Functions or
frontend only for UX hints — never as the sole enforcement point.

Operating model (Fase 2): merchandisements are **items with quantities split
into tracked lots** (ADR 0003). State lives at lot level.

## Identity and quantities

- Every cargo, item, and lot has a unique, human-readable code.
- An item's `total_quantity` must be > 0.
- **Splitting invariant:** for every item, Σ leaf lot quantities =
  `total_quantity`. Splits/transfers are atomic and the invariant is enforced
  by a database trigger.
- Chained splits are allowed (a lot can be split again any number of times),
  preserving `parent_lot_id`.

## Arrival, discharge, and remnant

- Arrival registers truck, driver (registry), carrier company, and the manifest.
- Discharge can be **total or partial**; a partial discharge leaves the
  remainder as an `on_truck` lot (remanente).
- A truck may egress with an acknowledged `on_truck` balance; it can also leave
  merchandise staged independently.

## Lifecycle and holds

- Lots at scanner/scale checkpoints record events; out-of-tolerance weights
  raise an alert instead of being silently accepted.
- A lot under **rezago** (`in_quarantine`) is frozen: no normal stock
  movements; resolution requires supervisor + reason.
- A lot under **secuestro** (`seized`) is blocked: only evidence transfer
  linked to the seizure is allowed; attempted movements are refused and
  audit-logged.
- Release from either hold requires a resolution record with actor and reason.

## Integrity

- The event log (`checkpoint_events`) is append-only: existing rows are never
  updated or deleted; corrections are new events referencing the original.
- Every merchandise mutation produces a checkpoint event (actor, timestamp,
  location, quantity, reason when sensitive).
- Sensitive actions (quarantine, seizure, release, role change) are always
  audit-logged.

## Access

- Operators can only see data of their organization.
- Audit and report readers are read-only; they cannot mutate business data.
- Admin actions (role change, config, user invite) are always audit-logged.

## Data quality

- No fictional seed data that can be confused with production data.
- Required references are enforced via foreign keys; dangling references are
  prohibited.

Domain model: `docs/domain/entities.md` · Flows: `docs/domain/flows.md` ·
States: `docs/domain/states.md` · Full operational rules:
`docs/domain/business-rules.md`.