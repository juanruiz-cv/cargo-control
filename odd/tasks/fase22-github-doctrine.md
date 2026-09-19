# odd mirror — Fase 22 (professional GitHub development doctrine)

> Tracking home per DOC-5 (odd/tasks = the tracking home, decided in
docs/architecture/documentation.md §7) + ADR 0021 §5 (homes; odd
mirror = `odd/tasks/fase22-github-doctrine.md`, THE tracking home for
this doctrine). Mirror == the repository doc home for Fase 22: the
ADR (docs/adr/0021-github-development-doctrine.md), the workflow home
(docs/architecture/github-workflow.md), the QA asserts home
(docs/qa/github-tests.md, GIT-AS-*), the root repo surface
(CONTRIBUTING.md, CHANGELOG.md, CODEOWNERS; SECURITY.md inherited from
Fase 21 — never restated here, DOC-3), README l9 (bumped to Fase 22),
and DECISION LOG Record 23 (the close record this phase appended).

## Close asserts (observed on disk)

- GIT-AS-1: `main` and `develop` branches exist on disk (branch
  topology per ADR 0021 §1).
- GIT-AS-2: branch naming convention (feature/ fix/ refactor/ docs/
  chore/) documented in docs/architecture/github-workflow.md (§2).
- GIT-AS-3: conventional commit types (feat: fix: refactor: docs:
  test: chore:) documented in the workflow home (§3).
- GIT-AS-4: repository surface homes all tracked (CONTRIBUTING,
  CHANGELOG, SECURITY, CODEOWNERS — `git ls-files` non-empty per path;
  SECURITY inherited from prior fase, not recreated).
- GIT-AS-5: secret exclusion honored (no .env/secret/token/service key
  tracked; asserts live in the QA home docs/qa/github-tests.md).

## This mirror is tracked o disco (DOC-AS-2, DOC-AS-7)
