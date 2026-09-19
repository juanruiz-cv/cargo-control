# ADR 0002 — Brand System and Design Tokens

- **Status:** Accepted (2026-09-19)
- **Applies to:** `cargo-control-web` (UI), all documentation

## Context

Fase 1 (Brand System). Before any UI implementation, the visual identity must be
defined and frozen so components and screens are consistent and no arbitrary
colors or typography enter the codebase.

## Decision

- **Tokens only.** Introduce the `--cc-*` token architecture
  (color, space, radius, border, shadow, typo, motion, size, z) defined in
  `docs/brand/design-tokens.md`.
- **Palette:** Primary `#1F4E5F` / Primary Light `#B7DCE8`; Background
  `#EEF3F5`; Surface `#FFFFFF`; Text `#1F2933`; Secondary Text `#64748B`;
  Border `#CBD5E1`. Status: Success `#16A34A`, Info `#2563EB`, Warning
  `#F59E0B`, Danger `#DC2626`, Blocked `#7C3AED`.
- **Physical zones** (facility views, not general UI): Warehouse `#F5F0D6`,
  Warehouse Area `#E1BA84`, Playón `#D5D7D8`.
- **Typography:** Inter only, compact operational scale (12–20px), tabular
  figures for numerics, mono fallback for codes.
- **Icons:** Lucide only, fixed size grid, semantic mapping documented.
- **Components:** 20 base components specified in `docs/brand/components.md`
  (variants, states, API, a11y). Implementation happens in `cargo-control-web`.

## Consequences

- Zero arbitrary colors; UI divergence is preventable by review.
- Component implementation is deferred to the web repo (spec-first).
- Future dark mode maps roles, not raw palette.