# Cargo Control

Enterprise platform for the control and traceability of shipments and goods.

Track every load from arrival to departure: trucks, cargo units, warehouse
movements, scale and scanner checkpoints, quarantines, seizures, and complete
audit trails.

> **Status: Fase 10 — Áreas operativas especiales (Scanner, Balanza, Rezago, Secuestro): spec + QA.** This repository currently contains
> architecture and domain documentation only. No business features are
> implemented yet by design. No fictional data is seeded that could be confused
> with production data.

## Stack

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Frontend     | React + TypeScript + Vite + Tailwind CSS + shadcn/ui    |
| Icons        | Lucide                                                  |
| Data         | Supabase (PostgreSQL + Auth + RLS + Storage)            |
| Edge logic   | Supabase Edge Functions (Deno) when needed              |
| CI / CD      | GitHub Actions                                          |
| Infra        | Docker where required, observability later              |

## Principles

- Modularity and separation of responsibilities
- Strict typing
- Security by design
- Auditability and traceability
- Scalability, accessibility, performance
- Reuse: no duplicated components, hooks, or queries
- No single global logic layer
- The backend/data layer is the **source of truth**

## Repository layout (target)

| Repo                    | Purpose               |
| ----------------------- | --------------------- |
| `cargo-control-web`     | Lovable application   |
| `cargo-control-docs`    | Documentation         |
| `cargo-control-infrastructure` | Infra / CI / CD |
| `cargo-control-contracts` | Shared contracts (stage 2) |

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — architecture proposal and 9 Fase 0 deliverables
- [BUSINESS-RULES.md](./BUSINESS-RULES.md) — domain invariants
- [SECURITY.md](./SECURITY.md) — security strategy and permission model
- [DECISION LOG.md](./DECISION LOG.md) — decision records (ADR index)
- [docs/product](./docs/product) — product and modules
- [docs/architecture](./docs/architecture) — full architecture details (DB, deps, risks)
- [docs/domain](./docs/domain) — domain model and entities
- [docs/ux](./docs/ux) — design system, routes and components (incl. trucks, Fase 7; cargo, Fase 8; movements timeline, Fase 9; special areas, Fase 10)
- [docs/security](./docs/security) — threat model and RLS matrix
- [docs/qa](./docs/qa) — QA and testing strategy (incl. trucks, Fase 7; cargo, Fase 8; movement engine, Fase 9; special areas, Fase 10)
- [docs/brand](./docs/brand) — brand system and design tokens (Fase 1)
- [docs/adr](./docs/adr) — Architecture Decision Records

## Getting started (once the web app phase begins)

1. Clone `cargo-control-web` (Lovable) into this workspace as a sibling.
2. Create the Supabase project and apply the schema in `docs/architecture/database.md`.
3. Wire environment variables via `.env` (see `.env.example`).