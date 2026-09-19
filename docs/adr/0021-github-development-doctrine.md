# ADR 0021 — Professional GitHub development doctrine (branch, conventional commits, delivery)

## Status

Accepted — Fase 22 (GitHub professional development).

## Context

The repository will be developed professionally through GitHub. The
product documentation (Fases 1-21) is complete and lives under
`docs/` with a documentation doctrine (ADR 0020), architecture home
(docs/architecture/documentation.md), domain home `docs/domain/README.md`,
domain doctrine (DOC-DOM), QA asserts home (`docs/qa/documentation-tests.md`,
DOC-AS-*), and an odd mirror (odd/tasks/fase21-documentation.md).
Before switching to GitHub as the delivery channel we need an explicit
doctrine for: the branch topology, the branch-naming convention, the
commit-message convention, the repository surface (README, CONTRIBUTING,
CHANGELOG, SECURITY, CODEOWNERS), and the hard exclusion of secrets,
tokens, service keys, and real data.

## Decision

We adopt a professional GitHub development doctrine for this repository:

1. **Branch topology.** `main` is the principal (protected) branch;
   `develop` is the integration/development branch; work happens on
   short-lived feature branches merged through pull requests. No direct
   push to `main` or `develop`.
2. **Branch-naming convention.** Feature branches are named
   `feature/<topic>`; corrective work `fix/<topic>`; refactors
   `refactor/<topic>`; documentation-only work `docs/<topic>`;
   chore/maintenance `chore/<topic>`.
3. **Commit-message convention.** Conventional Commits v1.0:
   `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`. Each commit
   holds one coherent work unit; work-unit commits are authored per ODD
   and never filmized.
4. **Repository surface.** `README.md` is the docs index (bumped per
   fase); `CONTRIBUTING.md` states how a contributor branches, commits,
   and opens a pull request; `CHANGELOG.md` records visible changes;
   `SECURITY.md` links the security doctrine under `docs/security/*`
   (one home per topic, DOC-2) instead of restating it; `CODEOWNERS`
   names the default owner for the repository surface.
5. **Hard exclusion.** `.env`, secrets, tokens, service keys, real user
   data, and any credential are never committed. A git exclusion
   (`.gitignore`) lists them, and the QA asserts (GIT-AS-*, section 5)
   scan the tracked index so a leaked path fails the check.

Homes (one home per topic per DOC-2):

- docs/architecture/github-workflow.md — this doctrine home (part 2)
- docs/qa/github-tests.md — the QA asserts for this doctrine (part 4)
- odd/tasks/fase22-github-doctrine.md — the odd mirror (close)
- "DECISION LOG.md" — Record 23 (close)
- README.md — bump to Fase 22 (close)

## Consequences

- Explicit, reproducible branch + commit discipline; the repo is ready
  for professional GitHub collaboration.
- Branch protection and remote push are NOT performed by this phase:
  configuring the GitHub remote and enabling protected branches is a
  delivery/repository-policy decision that belongs to the maintainer
  (ordinary repository policy; this phase only writes the doctrine).
- Secrets that were never committed stay excluded by assertion.

## QA asserts owned by this ADR (enforced in docs/qa/github-tests.md)

- GIT-AS-1: README l9 names the current fase (bump to 22 in close).
- GIT-AS-2: every home name CONTRIBUTING/CHANGELOG/SECURITY/CODEOWNERS
  that the doctrine names exists and is git-tracked (ls-files non-empty).
- GIT-AS-3: branch doctrine — `main` and `develop` branches exist
  (git rev-parse --verify both).
- GIT-AS-4: conventional commit tokens documented in CONTRIBUTING.
- GIT-AS-5: every tracked path under the secret exclusion list is empty
  (no .env, no tokens, no keys, no real data tracked).

## See also

- ADR 0020: Documentation doctrine (decision record for documentation
  doctrine itself) — docs/adr/0020-documentation-doctrine.md
- DECISION LOG.md Record 23 — GitHub professional development doctrine
