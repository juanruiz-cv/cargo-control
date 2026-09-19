# Contributing — Cargo Control

> Root contributing home (GitHub-recognized surface file per ADR 0021,
> section 4 "Repository surface"). This is **THE home** for how a
> contributor works on this repository, per DOC-2 (one home per topic).
> The full workflow doctrine (branches, naming, conventional commits,
> pull requests) lives in ONE architecture home: `docs/architecture/github-workflow.md`.
> This file is a root entry point that points contributors there; it does
> NOT restate the doctrine (DOC-3: homes link, never duplicate).

## Addressed doctrine

- Branch topology and naming — `docs/architecture/github-workflow.md` §1-2
- Conventional commits — `docs/architecture/github-workflow.md` §3
- Pull-request flow — `docs/architecture/github-workflow.md` §3
- Secret exclusion — `docs/architecture/github-workflow.md` §5
- Decision provenance — `odd/tasks/fase22-github-doctrine.md` (odd home
  tracking home per DOC-5: `odd/tasks/`), and `DECISION LOG.md` Record 23

## Workflow (in short — read the architecture home for the doctrine)

1. Branch types: `feature/`, `fix/`, `refactor/`, `docs/`, `chore/`.
2. Conventional commits: `feat:` `fix:` `refactor:` `docs:` `test:` `chore:`.
3. Work on `develop` (integration) or `main` (principal); feature
   branches for substantial work. Never commit secrets, tokens, service
   keys, `.env`, or real data — the QA asserts (GIT-AS-*) enforce this.
4. Open a pull request through the GitHub flow; QA asserts run on the
   candidate (stacked PR doctrine per DOC-*).

## Contributing homes (one per topic, DOC-2)

- `docs/architecture/github-workflow.md` — the GitHub workflow doctrine home
- `docs/architecture/documentation.md` — documentation doctrine home
- `docs/security/*` — security doctrine homes (authentication, rbac, rls, threat-model)
- `docs/qa/github-tests.md` — the GitHub QA asserts (GIT-AS-*) home
- `odd/tasks/` — the odd/tasks tracking home (DOC-5)
