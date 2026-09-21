# ADR 0023 — Web application source in this repository (host decoupling preserved)

## Status

Accepted — Fase 25 (web application build), 2026-09-21. Decided by the
maintainer (repository steward) as the most recent decision on repository
topology.

## Context — problem being decided

The pre-existing doctrine documented this repository as **docs-only**:
README states "This repository currently contains architecture and domain
documentation only. No business features are implemented yet by design",
and README + ADR 0021/0022 describe a 4-repo topology
(`cargo-control-web` Lovable application, `cargo-control-docs`,
`cargo-control-infrastructure`, `cargo-control-contracts`) with the
business logic living on an external host (Lovable) + Supabase
(ADR 0022 §6, Lovable independence / host decoupling).

The maintainer then ordered, explicitly and in writing: build the **real**
Cargo Control web application in **this repository**, using the
documentation under `docs/` as the primary source of truth, with the
documented stack (React + TypeScript + Vite + Tailwind CSS + shadcn/ui +
Lucide + Supabase/PostgreSQL/Auth/RLS/Storage/Edge Functions), no
prototypes and no mocks in production paths.

This is a direct contradiction between the documented topology (app code
does not live here) and the maintainer's most recent decision (app code
lives here). The documentation's own rule (README, the build order in the
web-app brief, section "Rule 1") says: when documents contradict, detect,
explain, identify the most recent or highest-priority decision, apply a
coherent solution, and document the decision.

## Decision

1. **This repository becomes the application source repository.** The web
   application source lives under `web/` in this repo, on branch
   `feature/web-app` (ADR 0021 branch topology), with conventional
   work-unit commits. This is a deliberate, documented amendment to the
   4-repo topology: the maintainer's latest decision overrides the
   docs-only reading for where the code lives. The docs-only doctrine is
   superseded **for repository topology only**; the documentation layer
   itself remains the normative spec the implementation compiles against.

2. **Host decoupling is preserved (ADR 0022 §6 not revoked).** The
   business logic and data live in the database layer and domain services,
   never in React markup. The data layer source of truth is the versioned
   SQL under `supabase/migrations/` (schema + RLS + triggers + views)
   derived from `docs/architecture/database.md`, `docs/security/rls.md`,
   `docs/security/authorization.md`, `docs/domain/*`. The frontend host
   remains replaceable: the app can move hosts without reimplementing the
   domain logic.

3. **Supabase is connected by configuration, not by code coupling.**
   The services layer uses `supabase-js` with environment variables
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). No secrets, no
   service-role keys, no real data are committed (GIT-AS-5). For
   development only, an isolated, clearly-marked DEMO adapter implementing
   the same services interface is active only when env vars are absent; it
   is removed or bypassed automatically when the real project is
   configured, without UI/business-logic changes.

4. **Trailing docs work is preserved, not destroyed.** Pre-existing
   uncommitted documentation work in the working tree was stashed
   (`stash`, "wip docs fases 16-20 pendiente 2026-09-21") before creating
   `feature/web-app` so the branch starts clean; it remains recoverable
   and will be reconciled by the maintainer.

## Why — motivation

The maintainer requires a real, verifiable application built from the
existing documentation, and chose "code + SQL now, connect Supabase
later". Housing the source here keeps one repository of truth during the
build, while the SQL migrations keep the data layer portable and the
host-independence doctrine alive. It also satisfies the documented
requirement that contradictions be resolved coherently and recorded, not
silently ignored.

## Risks and reservations

- The 4-repo topology is not abandoned as a future target; this ADR only
  relocates the current source of the web app. When the maintainer
  extracts `cargo-control-web` later, the code under `web/` + the
  migrations are the portable artifacts to move.
- No Docker, Supabase CLI, or pnpm exists in this environment (verified
  2026-09-21): the real Supabase project connection is out of this
  environment's reach until the maintainer provides a project/URL/key or
  installs the local tooling. The DEV-only DEMO adapter covers local
  development; it never substitutes for RLS in production.
- The previous docs-only claim in README is now stale ("no business
  features implemented") — README will be updated when the first
  functional slice lands (DOC-AS-1 requires README status line + DECISION
  LOG in the same close commit).

## Consequences

- `web/` becomes a real, buildable application with the documented stack.
- `supabase/migrations/` becomes the versioned source of truth for schema
  + RLS + triggers, fully portable to any Supabase project.
- The documentation layer remains normative; every implementation
  divergence is a defect to fix or a documented ADR decision.
- GIT-AS-5 secret exclusion holds: only `.env.example` is committed.

## Homes (per ADR 0020 DOC-2/DOC-3 — one home per topic)

- ADR 0023 (this record) — `docs/adr/0023-web-app-source-repo-doctrine.md`
- odd mirror (this fase) — `odd/tasks/web-app.md`
- README (index) — line 9 bumped when the first functional slice closes
- DECISION LOG — Record appended in the phase close