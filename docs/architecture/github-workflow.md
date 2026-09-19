# GitHub Professional Development Doctrine (home)

> Tracking home per ADR 0021 (`docs/adr/0021-github-development-doctrine.md`),
> DOC-2 (one home per topic), and DOC-5 (the odd mirror is the tracking
> home for the close). This is **THE home** for the professional GitHub
> workflow doctrine of this repository: branch topology, branch naming,
> conventional commits, pull requests, repository surface, and the hard
> exclusion of secrets. It mirrors what ADR 0021 decided; the QA asserts
> live in one QA home (`docs/qa/github-tests.md`, GIT-AS-*) and the odd
> mirror tracks this phase (`odd/tasks/fase22-github-doctrine.md`).

## 1. Branch topology

- `main` — the principal (protected) branch. Direct push is forbidden;
  only review-approved changes land here, normally through a pull request.
- `develop` — the development/integration branch. Feature/development
  work lands here; integration and pre-release checks happen on it.
- Work happens on short-lived feature branches that are merged through
  pull requests. No direct push to `main` or `develop`.

## 2. Branch naming convention

Every branch carries a type prefix followed by a topic:

- `feature/<topic>` — new capability
- `fix/<topic>` — corrective work
- `refactor/<topic>` — structural change, no behavior change
- `docs/<topic>` — documentation-only work
- `chore/<topic>` — maintenance / tooling / non-functional work

## 3. Conventional commits

Every commit message follows Conventional Commits v1.0:

- `feat:` — new capability
- `fix:` — bug fix
- `refactor:` — structural change, no behavior change
- `docs:` — documentation-only change
- `test:` — test-only change
- `chore:` — maintenance / tooling / non-functional change

Each commit holds one coherent work unit (DOC-1). Rule for scope: use a
scope that reproduces the repo structure, e.g. `docs(adr):`, `docs(qa):`,
`docs(log):`.

## 4. Repository surface

One home per topic (DOC-2), tracked (DOC-AS-*):

- `README.md` — repository home / docs index (bumped per fase per
  DOC-AS-1).
- `CONTRIBUTING.md` — contribution guide: branch naming (§2), commit
  convention (§3), and pull-request flow.
- `CHANGELOG.md` — user-visible changes, newest first.
- `SECURITY.md` — security policy / home (never restates doctrine;
  DOC-5/RIGHT → doc home `docs/security/*`).
- `CODEOWNERS` — default owners for review (when applicable).

## 5. Hard exclusion (never committed)

- `.env` files, secrets, tokens, service keys, and real data are **never**
  committed. A tracked `.gitignore` excludes them, and the QA asserts
  (GIT-AS-*) scan the tracked index so a leaked path fails the check
  (DOC-AS-4/RIGHT — security doctrine home never restates them).
