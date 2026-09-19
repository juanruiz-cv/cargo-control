# Documentation Doctrine — Cargo Control

> **Compiles with the Documentation Doctrine (ADR 0020), the
> Single-home-per-topic contract (ADR 0020 §DOC-2), the Update-status
> contract (ADR 0020 §DOC-3/DOC-AS-3) and the Audit-system doctrine
> (ADR 0014). No RLS/RBAC/schema/policy change — asserted `DOC-AS-2`/`4`
> (documents a doctrine; never rewrites one, never hides a security
> surface).**

## 1. The index is the README, and it is doctrine

This README is the **single index** of the repository's homes. It lists
**each home once**; a home is the deciding source for its topic. If two
documents "both explain capacity", the index has a doctrine bug — the
assert `DOC-AS-1` (one deciding source per topic) fails. The reader
learns the system from the index; the index is tested (DOC-AS-3/
`docs-adr-tests` asserts).

## 2. What the system is (one sentence, the index's headline)

**Cargo Control (Track / CC) is a private, permission- and
capacity-aware cargo-control system for a multi-warehouse trucking
operation.** It makes an authoritative server-committed record of: who
holds each item of cargo, where it is (truck, sector, scanner, scale,
quarantine/seizure, special area), what capacity remains every time a
movement happens, and — behind an immutable audit doctrine — who did
each movement and what (append-only audit, ADR 0014).

## 3. Doctrinal DNA (what the README status each phase updates)

The status line in Section "Status" names, per phase: what the phase
added (doctrine → home in `docs/architecture`; decision → ADR number;
spec → `docs/ux`, `docs/product`; QA → `docs/qa`, `docs/security`),
per the phase-completion contract (ADR 0020 §DOC-3).

## 4. Repository layout — the homes

Each of the following is a **home** the index names; the deciding source
for its topic lives in exactly one home (assert `DOC-4`: list must
compile against tracked files — `git ls-files docs/... | sort`):

| Top-level home | Decides what it holds | Concrete homes |
| -- | -- | -- |
| `README.md` | the index + status + phase | the file itself |
| `docs/architecture/` | **doctrine home**: architecture doctrine per module + doctrine doctrine + risks doctrine | `audit.md`, `database.md`, `dependencies.md`, `floor-plan-editor.md`, `floor-plan-versioning.md`, `movement-engine.md`, `operational-dashboard.md`, `operational-map.md`, `responsive-mobile.md`, `risks.md`, `special-areas.md`, `ux-doctrine.md`, `private-ux-doctrine.md`, `professional-ux.md`, `responsive-mobile.md`, `performance.md`, `documentation.md` (this file) |
| `docs/adr/` | **decision home**: the doctrine doctrine's ADRs (ADR 0001–0020) | `0001-…` through `0020-…` |
| `docs/domain/` | **business-rule home**: business rules, capacity doctrine, floor-plan doctrine, movement doctrine, audit/cargo/trucks doctrine | `business-rules.md`, `capacity-occupancy.md`, `entities.md`, `flows.md`, `states.md` |
| `docs/product/` | **product home**: what the system is for (users, journeys, MVP) | `README.md` (product home), plus `personas.md`, `user-journeys.md`, `epics-and-user-stories.md`, `mvp-vs-future.md`, `acceptance-criteria.md`, `strategy.md` |
| `docs/brand/` | **brand home**: the brand doctrine (tokens, colors, typography) | `brand-manual.md`, `colors.md`, `design-tokens.md`, `typography.md`, `iconography.md`, `components.md`, `design-tokens.md` |
| `docs/ux/` | **UX home**: interaction doctrine per surface | `audit.md`, `floor-plan-editor.md`, `operational-dashboard.md`, `operational-map.md`, `responsive-mobile.md`, `routes-and-components.md`, `trucks-module.md`, `professional-ux.md`, `responsive-mobile.md`, plus per-module UX doctrine |
| `docs/qa/` | **QA home**: test doctrine + per-module QA specs | `strategy.md`, `audit-tests.md`, `truck-module-tests.md`, `movement-engine-tests.md`, `operational-map-tests.md`, `security-tests.md`, `responsive-tests.md`, … |
| `docs/security/` | **security home**: the security doctrine (auth, authz, RBAC, RLS) — **never duplicate RLS/RBAC in README or product docs; the index links to the security home** | `authentication.md`, `authorization.md`, `rbac.md`, `rls.md`, `threat-model.md`, `database.md` |
| `docs/qa/` | the QA strategy + per-module test spec (assert every phase "has QA") | `strategy.md`, `*-tests.md` |
| `odd/tasks/` | **phase tracking home**: odd mirrors per phase; the index names the odd home (tracking is a doctrine of the phased workflow; the mirror and the README status must agree — assert `DOC-5`, `DOC-AS-3`) | `fase1-…`, …, `fase20-…`, `fase21-…` (this phase's mirror, if it opens) |
| `docs/security/` | **security home** (duplicate row disallowed by assert `DOC-4` — one home only; keeping the row here would collide) | (see `docs/security/` row above) |

## 5. How to run the system (the doctrine index's operational page)

There is **no code to run in this delta README** (it is the documentation
doctrine of a doctrine-only repository; the repo's artifact suite is the
documentation). Running the system = **reading the doctrine + the QA
asserts** until the movement-engine, capacity, map, dashboard, scanner,
scale, quarantine/seizure, layout-versioning and responsive/performance
doctrines all compile (they do — static asserts in `docs/qa/*`, ADR
0014/0019 asserts).

Real deployment run doctrine: the system is **Supabase-hosted, hosted
backend, Supabase-hosted RLS/RBAC frontend idle** (ADR 0001/0004/0007);
"run it" = bootstrap the documented schema + doctrine deltas, then the
app reads/writes through RLS-only. Any environment needing a non-RLS
write path is denied by doctrine (ADR 0011 schema doctrine).

### 5.1 Environment variables (documented, asserted, never committed)

The doctrine asserts (assert `DOC-AS-6`): **documented env vars that are
secrets (Supabase service-role key, database admin password, any
deployment secret) are documented by PRESENCE + ROLE, never by *value***.
An env var is documented in the "Environment" section as a named slot
with a role ("required for bootstrap only", "server-side only"), and the
index site asserts the secret's VALUE is never in the README/doctrine
(fail = a doctrine bug). Example entries that may appear (role, not
value):

| Env slot | Role | Documented as |
| -- | -- | -- |
| `SUPABASE_URL` | public, non-secret | "the Supabase project URL (public)" |
| `SUPABASE_ANON_KEY` | public, non-secret | "the anon/jwt role key (public, RLS-doctrine)" |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** | "server-side only; never in client bundle; bootstrap-role" |
| `SUPABASE_DB_ADMIN_PASSWORD` | **secret** | "bootstrap/doctrine only; never in client bundle" |
| `DOC_DELTA_KEY` | secret-ish | "doctrine CI key; server-side only" |

doctrina: the README never lists a secret's value; it documents role +
"never in client" (`DOC-AS-6`). Storing a real value here would be a
doctrine bug (asserted).

## 6. Business rules home — where they live (not duplicated here)

Business rules live in `docs/domain/business-rules.md` (the deciding
home; ADR 0011 special doctrine asserts domain must hold them) + the
capacity doctrine `docs/domain/capacity-occupancy.md`. The README index
**links**, never restates the rules (assert `DOC-1`): if the index
described capacity in prose, it would grow a second home for capacity.

## 7. Permissions doctrine — one home only (security home)

Permissions (RBAC/RBAC roles → RLS) live in `docs/security/rbac.md` +
`docs/security/rls.md` + `docs/security/authorization.md`. **The README
index must NEVER restate "who has which role"; it links to the security
home and asserts the security doctrine keeps a single home** (`DOC-4`).
If a future phase's UX/ux page "explains roles", it must **link to
docs/security**, never duplicate (assert `DOC-AS-4` — security home is
the deciding source; documentation never creates a second security
authority).

## 8. QA home — one QA strategy + one test spec home each

`docs/qa/strategy.md` is the QA strategy home. Each module has **one**
test-spec file in `docs/qa/` (`*-tests.md`), asserted `DOC-4`; the QA
doctrine (ADR 0014 audit + ADR 0019 tests) asserts every phase closes a
QA spec. The index links to the QA home; never restates test IDs in the
README (assert `DOC-1`).

## 9. Every future significant change updates the corresponding doc

Doctrine (ADR 0020 §DOC-3/4 + asserted `DOC-AS-1`, `DOC-AS-3`): any
significant change to the system — a doctrine delta (ADR 0019
performance asserts), a schema delta (ADR 0015 layout versioning), a
security delta (ADR 0014 audit asserts) — **must update the index in the
same commit** (the README status + the DECISION LOG (ADR 0020 §DOC-3)):
a phase that adds/changes module doctrine without touching its README
status line or DECISION LOG entry is a documentation defect (fails
`DOC-AS-3`) — the index is checked as part of the phase close.

## 10. Decision-log home + phase tracking

- **DECISION LOG.md** is the **decision-log home** (append-only; one
  Record per phase; ADR 0020 §DOC-3). The index links to it; it never
  restates records.
- **odd/tasks/** is the **tracking home** (phase mirrors; Fase 15–21
  currently referenced by the index's phase status; assert `DOC-5`
  mirror = README status agreement).

## 11. Asserts (run in `docs/qa/documentation-tests.md`; IDs DOC-*)

- `DOC-AS-1` — **one deciding source per topic**: README index never
  restates a doctrine (capacity, permissions, QA IDs, rules — links, not
  copies).
- `DOC-AS-2` — **no doctrine change, no security change**: this
  documentation delta changes no ADR content, no RLS/RBAC/schema/policy.
- `DOC-AS-3` — **the README status line matches the DECISION LOG Record
  of the current phase** (index currence); bumping the status = part of
  the phase close.
- `DOC-AS-4` — **security has one home**: README/product/UX docs never
  restate role-scopes; they link to `docs/security/*`.
- `DOC-AS-5` — **QA has one home**: README never restates test IDs; it
  links `docs/qa/strategy.md` + per-module specs.
- `DOC-AS-6` — **no secret value in docs**: README/doctrine never
  contains a service-role key / admin password / private env value;
  env vars documented as role + "never in client" only.
- `DOC-AS-7` — **every row in the index compiles**: each home the index
  names resolves to a tracked file (`git ls-files` assert); a name in
  the index with no tracked file = index defect (fail).
- `DOC-AS-8` — **the phase closes with: ADR + doctrine + UX/domain
  delta + QA spec + DECISION LOG + README status** (the phase-close
  contract, ADR 0020 §DOC-3); any phase whose close lacks one of these
  fails currence.

## Consequences

- The README is a **testable index** — DOC-AS-3/6/7 run against git
  tracked files, never prose. A misleading index is a defect, not a
  style choice.
- The security home keeps the RLS/RBAC authority; product/UX never
  grow a second security narrative (DOC-AS-4).
- Future phase closes must bump README + DECISION LOG in the SAME
  commit (DOC-AS-8) — the documentation doctrine makes "forgot the
  status" fail a doctrine, not a chore.
