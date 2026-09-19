# QA Strategy — Cargo Control

## Layers

| Layer       | Tooling                 | Scope                                         |
| ----------- | ----------------------- | --------------------------------------------- |
| Unit        | Vitest                  | Services, hooks, lib utils, validation schemas |
| Component   | Testing Library         | Feature components and pages                  |
| Database    | SQL test scripts / CI   | Constraints, triggers, RLS behavior           |
| Isolation   | Supabase local + tests  | Two-org cross-read must return empty          |
| E2E (later) | Playwright              | Scanner/scale happy path, quarantine flow     |

## Rules

- No feature lands without tests for its core invariant.
- RLS isolation tests are required before any schema change.
- TypeScript strict mode is part of continuous integration.
- Event-log immutability is asserted by tests (UPDATE/DELETE must fail).

## Definition of done

- Lint and typecheck pass.
- New/changed invariants covered by tests.
- RLS isolation verified.
- Decision logged in `DECISION LOG.md` when architectural.