# ADR 0022 — Infrastructure & Deployment Doctrine

> Tracking home per ADR 0021 §5 (ADR home under `docs/adr/`; ADR 0021 is
> the GitHub development doctrine, DOC-1/ADR-1: ADR = decision record).
> This ADR decides the **infrastructure & deployment doctrine**: the
> environment separation (development / staging / production), the data
> durability doctrine (database backup, retention, restore), observability
> (monitoring, logging), recovery (incident response, rollback), the
> deployment documentation home, the Lovable-independence doctrine
> (business logic must be able to abandon the current host without being
> reimplemented), and the decoupled backend components (Supabase,
> PostgreSQL, Storage, Edge Functions as conceptually independent
> homes). **THE decision** for how Cargo Control is operated and shipped
> professionally in the GitHub-era surface (ADR 0021).

## Status

Accepted — Fase 23 (professional infrastructure & deployment doctrine).

## Context

Cargo Control's product documentation is complete (Fases 1-21) and the
professional GitHub development doctrine is closed (Fase 22, ADR 0021,
which established: `main` principal + `develop` integration + feature
branches, conventional commits `feat: fix: refactor: docs: test: chore:`,
branch naming `feature/ fix/ refactor/ docs/ chore/`, the repository
surface CONTRIBUTING/CHANGELOG/SECURITY/CODEOWNERS, and hard secret
exclusion — never commit `.env`, secrets, tokens, service keys, or real
data).

The product is currently developed through a frontend host (Lovable).
Before professional GitHub-hosted delivery, this ADR fixes how the
system is **operated in production**: environments, data durability,
observability, recovery, and the ability to later abandon the frontend
host provider without reimplementing the business logic.

## Decision

We adopt a professional infrastructure & deployment doctrine, with homes
(DOC-2: one home per topic; DOC-AS-1: one home holds the doctrine assert
for its topic):

1. **Environment separation (development / staging / production).**
   Three distinguished environments, each with a defined role:
   - `development` — local/working environment where features are
     built and unit-tested.
   - `staging` — pre-production mirror where integration, QA, and
     release candidates are validated before shipping.
   - `production` — the live environment users reach.
   Environment homes and promotion doctrine live in the deployment home
   (`docs/architecture/infrastructure-deployment.md`).

2. **Data durability doctrine (database backup + retention + restore).**
   - **Backup**: the PostgreSQL database is backed up on a defined,
     regular schedule. Backup artifacts are never committed to git
     (GIT-AS-5 secret/data exclusion applies to dumps and snapshots).
   - **Retention**: a defined retention policy (how long backups are
     kept; e.g. daily + weekly + monthly tiers or an N-day rolling
     window) lives in the deployment home; retention is documented, not
     guessed.
   - **Restore**: restore is a **first-class, tested procedure** — a
     documented, repeatable way to bring data back from a backup.
     Restore is asserted by the doctrine (INF-AS-*), not trusted in
     memory.
   The backup/retention/restore home lives under
   `docs/architecture/infrastructure-deployment.md` (data durability
   section) with a security-adjacent note pointing to the SECURITY home
   (ADR 0021 repo surface; DOC-2 one home per topic — the security
   doctrine itself stays in `docs/security/`, never restated here).

3. **Observability (monitoring + logging).**
   - **Monitoring**: health/status/dependency checks that assert the
     operational posture of each environment, documented as asserts
     (INF-AS-*).
   - **Logging**: structured log homes per environment; logging never
     includes secrets, tokens, service keys, or real user data
     (GIT-AS-5 / secret exclusion extends to logs). A logging doctrine
     home states what is logged and what is never logged.
   Homes: `docs/architecture/infrastructure-deployment.md` (doctrine)
   + `docs/qa/infrastructure-tests.md` (INF-AS-* asserts).

4. **Recovery (incident response + rollback).**
   - **Incident response**: a documented, repeatable procedure for
     recognizing and responding to production incidents, with a
     defined escalation and a recovery playbook.
   - **Rollback**: a documented way to revert a bad ship (restore the
     last known-good state — code rollback via git + data restore via
     the restore procedure). Rollback is doctrine + documented, asserted
     not assumed.
   Homes: `docs/architecture/infrastructure-deployment.md` (recovery
   section) + `docs/qa/infrastructure-tests.md` (INF-AS-*).

5. **Deployment documentation.** A documentation home
   (`docs/architecture/infrastructure-deployment.md`) is **THE** home for
   how an environment is deployed, promoted, operated, monitored, backed
   up, restored, and rolled back, per DOC-2 (one home per topic) and
   ADR 0020 (documentation doctrine). README (index, DOC-1) lists it;
   README line 9 is bumped to the fase number in the close (DOC-AS-1).

6. **Lovable independence / host decoupling.** The business logic is
   **decoupled from the frontend host** (Lovable). Doctrine homes:
   - `docs/architecture/lovable-independence.md` — how the product can
     abandon Lovable later without reimplementing the business logic:
     the business logic and data live in the backend/domain homes, not
     in host-specific markup; the domain/QA/business homes are portable
     (ADR 0020 doctrine docs + odd/ mirrors are provider-neutral).
   - Supabase, PostgreSQL, Storage, and Edge Functions are conceptually
     **independent components** (homes & doctrine homes per component,
     DOC-2 — one home per topic): the data layer (PostgreSQL/Supabase),
     the file/Object storage, and edge/serverless functions are each a
     named component home under `docs/architecture/` or
     `docs/domain/`, decoupled from Lovable and from each other. The
     adoption of the GitHub professional surface (ADR 0021) makes the
     host a replaceable delivery detail.

## Consequences

- Environments, data durability, observability, and recovery are
  explicit and documented — the production system is operated by
  doctrine, not by hope.
- Database backups, dumps, snapshots, and real data are never committed
  (GIT-AS-5 extends to them); retention and restore are documented and
  asserted, never assumed.
- The business logic is host-independent: abandoning Lovable later does
  not require reimplementing the doctrine or the domain logic; the
  homes, ADRs, DECISION LOG, and odd/ mirrors are all portable,
  provider-neutral artifacts.
- Supabase / PostgreSQL / Storage / Edge Functions are decoupled
  conceptual components, each with a doctrine home, so the delivery
  host and any single provider detail can change without redoing the
  product.
- This ADR defines doctrine and homes only: it does NOT connect a
  remote, create real environments, install monitors, run git push, or
  configure GitHub — remote/CI/push and real environment provisioning
  are repository-policy/delivery decisions of the maintainer (ADR 0021
  §5 boundary, inherited).

## Homes (per ADR 0020 DOC-2/DOC-3 — one home per topic; links inherit)

- ADR 0022 (this record) — `docs/adr/0022-infrastructure-deployment-doctrine.md`
- Doctrine home (deployment doctrine) —
  `docs/architecture/infrastructure-deployment.md`
- Lovable-independence home —
  `docs/architecture/lovable-independence.md`
- QA asserts home — `docs/qa/infrastructure-tests.md` (INF-AS-*)
- odd mirror (this fase) — `odd/tasks/fase23-infrastructure-doctrine.md`
- README (index) — line 9 bumped to `Fase 23` in the close
- DECISION LOG — Record 24 appended in the close (Record 23 = GitHub)
