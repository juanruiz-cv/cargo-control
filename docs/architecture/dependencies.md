# Dependencies — Cargo Control

Versioned, minimal, and pinned. Add new dependencies only after checking for
existing alternatives (reuse over accumulation).

## Frontend

| Package            | Purpose                             |
| ------------------ | ----------------------------------- |
| `react`            | UI library                         |
| `react-router`     | Routing                            |
| `@supabase/supabase-js` | Data/auth/storage client      |
| `tailwindcss`      | Styling                            |
| `lucide-react`     | Icons                              |
| `@radix-ui/*`      | Headless primitives (via shadcn/ui) |
| `zod`              | Validation (schemas shared with contracts) |
| `date-fns`         | Date handling                       |

### Dev / tooling

| Package                  | Purpose                       |
| ------------------------ | ----------------------------- |
| `typescript` (strict)    | Typing                        |
| `vite`                   | Build tooling                 |
| `eslint` + `prettier`    | Lint / format                 |
| `vitest` + `@testing-library/react` | Unit/component tests |
| `playwright` (optional)  | E2E later                     |

## Data / backend

| Technology        | Purpose                                |
| ----------------- | -------------------------------------- |
| Supabase          | PostgreSQL, Auth, Storage, Edge Functions |
| Deno              | Edge Functions runtime (managed)       |
| PostgreSQL        | Constraints, triggers, RLS             |

## Policy

- Third-party UI-heavy or state libraries only if materially required.
- Edge Functions called only for logic that must not live in the client
  (secure handling, cross-entity integrity, Storage signing).
- Contracts (shared types) planned for `cargo-control-contracts` in stage 2.