# GitHub Doctrine QA Asserts (GIT-AS-*)

> SA home for the professional GitHub development doctrine asserts, per
> ADR 0021 §5 (the ADR's assert clause) + DOC-AS-4 (one thread per
> assert; DOC-AS-4 names LITERALLY the QA paths, DOC-4/6 home per topic)
> + DOC-5 (odd/tasks/ is the tracking home for close assertions). The
> asserted doctrina home: `docs/architecture/github-workflow.md` (and
> ADR 0021). Each assert is on a coherent line group; runs are
> independently readable (DOC-AS-1).

## GIT-AS-*

### GIT-AS-1 — branch principal + desarrollo exist and are named per ADR 0021 §1

The repository has a principal branch and a development branch, named
per the doctrine. ADR 0021 §1 (branch topology) says the principal is
the protected branch and the integration/development branch carries the
development work.

Run: `git rev-parse --verify main && git rev-parse --verify develop`

Assert: both `main` and `develop` resolve (exit 0). FAIL = the branch
topology asserted by ADR 0021 §1 is not on disk (branch defect).

### GIT-AS-2 — branch naming convention is documented in the workflow home (ADR 0021 §2)

The workflow home states the branch-naming convention with the type
prefixes. ADR 0021 §2 (branch naming) fixes: `feature/`, `fix/`,
`refactor/`, `docs/`, `chore/`.

Run: `grep -E 'feature/|fix/|refactor/|docs/|chore/' docs/architecture/github-workflow.md`

Assert: the naming convention tokens appear in the workflow home. FAIL =
a branch-naming convention that the doctrine decides but the home does
not state (home/decision drift, DOC-2/DOC-AS-4).

### GIT-AS-3 — conventional commit types are documented in the workflow home (ADR 0021 §3)

The workflow home states the conventional commit convention. ADR 0021
§3 (conventional commits) fixes: `feat:`, `fix:`, `refactor:`, `docs:`,
`test:`, `chore:`.

Run: `grep -E 'feat:|fix:|refactor:|docs:|test:|chore:' docs/architecture/github-workflow.md`

Assert: the conventional commit types appear in the workflow home. FAIL
= a commit doctrine that the decision record decides but the home does
not state (home/decision drift).

### GIT-AS-4 — repository surface records are tracked (ADR 0021 §4)

The doctrine names the professional repository surface: README (bumped
per fase), CONTRIBUTING, CHANGELOG, SECURITY, CODEOWNERS. Anything the
doctrine nominates as a repository surface home MUST be tracked by git
(DOC-AS-2): a home the index lists that git does not track is a defect.

Run: `git ls-files README.md CONTRIBUTING.md CHANGELOG.md SECURITY.md CODEOWNERS`

Assert: all five surface paths resolve as tracked (5 results). FAIL =
a surface path the doctrine nominates is untracked (DOC-AS-2 / GIT-AS-4
defect).

### GIT-AS-5 — nothing from the secret exclusion list is tracked (ADR 0021 §5)

The doctrine hard-excludes secrets: `.env`, tokens, service keys,
credentials, real user data. SECURITY.md itself is never a duplicate
home (DOC 5 / DOC-2); the security doctrine lives in one home
(`docs/security/`), and secret content is never committed.

Run: `git ls-files | grep -iE '\.env|secret|token|api[_-]?key|service[_-]?key|password|credential'` — expect no tracked path carries those tokens.

Also negative-inspection (never rely on a tracked home that is empty of
asserts — asserts must run even if the home is thin): a tracked path
that is an odd mirror (`odd/tasks/*.md`) is a tracking artifact, not a
secret.

Assert: the exclusion list matches nothing tracked. FAIL = a secret or
credential path is tracked (defect by exclusion; never a review gate).

## Scope and homes

- Doctrina home (decided home): `docs/architecture/github-workflow.md`
- Decision record: `docs/adr/0021-github-development-doctrine.md`
- Close assertions tracking home: `odd/tasks/fase22-github-doctrine.md`
- Proximity: each GIT-AS-* lives here in English and asserts against
  the workflow home; no doctrine content is restated here (DOC-3).
