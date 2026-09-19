# ADR 0001 — Bootstrap on Supabase (no separate NestJS backend for the MVP)

- **Status:** Accepted (2026-09-19)
- **Decision makers:** Project lead
- **Applies to:** `cargo-control-web`, future `cargo-control-contracts`

## Context

The master plan targets robustness and later migration to a dedicated backend,
while the MVP must be delivered fast. A separate NestJS service adds
orchestration and infra cost before product/market validation.

## Decision

Use Supabase as the backend/data for the MVP: PostgreSQL as source of truth,
Auth, RLS, Storage, and Edge Functions for logic that must not live in the
client. Keep domain logic and contracts separated so that critical pieces are
portable. Do NOT introduce NestJS now; reassess at stage 2 with the
`cargo-control-contracts` repo.

## Consequences

- Faster MVP, lower infra overhead.
- Must contain Supabase coupling inside `integrations/` and accept that some
  logic is in Deno Edge Functions.
- Portability risk actively managed via shared validation schemas (zod) and the
  future contracts repo.

## Alternatives considered

- NestJS backend from day one — rejected for MVP speed and infra overhead.