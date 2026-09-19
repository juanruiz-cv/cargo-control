# BUSINESS-RULES.md — Cargo Control

Domain invariants. These rules are enforced in the **data layer**
(PostgreSQL constraints, triggers, RLS) and additionally in Edge Functions or
frontend only for UX hints — never as the sole enforcement point.

## Identity and units

- Every cargo and cargo unit has a unique, human-readable code.
- Physical units are weighed and scanned before they may change location
  (scale + scanner checkpoint).
- A unit's weight and scanned identity are recorded as immutable events.

## Lifecycle

- A cargo cannot be released unless all of its units have passed the required
  checkpoints.
- A unit under quarantine cannot be released, loaded, or moved to consumer
  stock until the quarantine case is resolved.
- A seized unit is frozen: no stock movements allowed except those linked to
  the seizure record (evidence transfer).
- Releasing a unit from quarantine or seizure requires a resolution record with
  actor and reason.

## Integrity

- The event log (`checkpoint_events`) is append-only: existing rows are never
  updated or deleted; corrections are new events referencing the original.
- Every mutation records `created_by` and a reason when the change is sensitive
  (quarantine, seizure, release).
- Weights fall within tolerance bands; out-of-tolerance readings raise an alert
  instead of silently accepting.

## Access

- Operators can only see data of their organization.
- Audit and report readers are read-only; they cannot mutate business data.
- Admin actions (role change, config, user invite) are always audit-logged.

## Data quality

- No fictional seed data that can be confused with production data.
- Required references are enforced via foreign keys; dangling references are
  prohibited.

Domain model and enums: `docs/domain/entities.md`.