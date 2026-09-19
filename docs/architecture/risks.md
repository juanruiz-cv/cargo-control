# Technical Risks — Cargo Control

Identified during Fase 0, with mitigations. Review before each architectural
change.

| # | Risk | Impact | Mitigation |
| - | ---- | ------ | ---------- |
| 1 | Vendor coupling with Supabase | Migration cost; lock-in | Clean `integrations/` layer, contracts repo in stage 2, domain isolated from transport |
| 2 | RLS misconfiguration → cross-tenant leak | Data exposure | Default-deny policies, review checklist before schema changes, tests asserting isolation |
| 3 | Scanner/scale hardware instability | Operational friction | Adapter interfaces, tolerant input, manual entry fallback, retry/idempotency |
| 4 | Append-only log growth | Performance/storage | Indexing on `(item_lot_id, occurred_at)`, partitioning plan, retention policy |
| 5 | Immutability vs corrections | Data quality conflicts | Correction events referencing `previous_event_id`, never in-place UPDATE |
| 6 | Migration to a dedicated backend later | Rework | Same rules engine (edge functions first), shared validation schemas |
| 7 | Lovable generation drift / duplicated code | Tech debt | Versioned docs, ADR discipline, CI checks, no duplicate components/queries rule |
| 8 | Time/locale ambiguity in traceability | Wrong audit answers | All timestamps `timestamptz`, UI renders in operator TZ, store UTC |

## Watch items

- Edge Functions cold starts and quota under burst scanner traffic.
- Supabase Storage egress costs for high photo volume.
- Role explosion: keep role set small; escalate via capabilities only if needed.