# DECISION LOG

Architecture Decision Records (ADRs) for Cargo Control. Every significant
change to the project must be recorded here and/or as an ADR file under
`docs/adr/`. Before modifying existing decisions, review impacted dependencies.

## Index

| # | Decision                                     | Status | Date       |
| - | -------------------------------------------- | ------ | ---------- |
| 1 | Bootstrap on Supabase, no separate NestJS backend for MVP | Accepted | 2026-09-19 |
| 2 | Four-repo layout (`web`, `docs`, `infrastructure`, `contracts` later) | Accepted | 2026-09-19 |
| 3 | RLS default-deny with per-role policies | Accepted | 2026-09-19 |
| 4 | Immutable, append-only checkpoint event log | Accepted | 2026-09-19 |
| 5 | English for all technical artifacts and code | Accepted | 2026-09-19 |

## Record 1 — Bootstrap on Supabase (no NestJS)

**Context:** need to accelerate the MVP without pre-mature backend overhead.

**Decision:** Use Supabase (PostgreSQL, Auth, RLS, Storage, Edge Functions) as
backend/data. Keep domain logic clean and decoupled so critical pieces can
migrate to a dedicated backend later.

**Consequences:** fast MVP; vendor coupling must be actively contained via the
integration layer and future `contracts` repo. See `docs/adr/0001-bootstrap-with-supabase.md`.

## Record 2 — Repository layout

**Context:** plan calls for separated, independently versioned repositories.

**Decision:** Maintain `cargo-control-web`, `cargo-control-docs`,
`cargo-control-infrastructure`, and prepare `cargo-control-contracts` for stage 2.

**Consequences:** clean boundaries; requires CI coordination across repos.

## Record 3 — RLS default-deny

**Context:** multi-tenant data with sensitive goods logs.

**Decision:** RLS on every table; policies granted explicitly per role; no
`bypassrls` for the data API.

**Consequences:** strong default security; policy review checklist required
before schema changes.

## Record 4 — Immutable event log

**Context:** traceability demands that history cannot be silently rewritten.

**Decision:** `checkpoint_events` is append-only; corrections are new events.

**Consequences:** guaranteed auditability; storage growth handled by retention
and partitioning.

## Record 5 — English artifacts

**Context:** convention for code, docs and commit messages.

**Decision:** All technical artifacts (code, identifiers, UI copy, docs, commits)
are written in English. Conversation with the user stays in the user's language.

**Consequences:** consistent, contribution-friendly output.