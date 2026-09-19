# ADR 0020 — Documentation as a first-class deliverable

- **status**: accepted
- **date**: 2026-09-19 (Fase 21 — Complete documentation)
- **deciders**: gentle-ai orchestrator (documentation doctrine)

## Context

The repository ships one doctrine per module (ADRs 0001–0019), each with
its architecture home, UX home, domain home, and QA home — but **no
single index** that names where each home lives. The README's status
line stalled at **Fase 14** while Fases 15–20 committed ADRs 0015–0019
(+ responsive 0018, performance 0019) **without bumping README status
nor appending DECISION LOG Records** — the exact documentation-cadence
defect this phase exists to close, and which the QA QA-doctrine
(ADR 0019 §PER-AS-2/3) demands be **asserted, not narrated** (ADR 0014
audit-doctrine: no state claim without a check).

## Decision

We adopt a **complete-documentation doctrine** with the following
rules, each asserted as a `DOC-*` / `DOC-AS-*` check in
`docs/qa/documentation-tests.md`:

- **`DOC-1` / `DOC-AS-1`** — **the README is the single index.** Its
  status line names the current Fase; its index names each documentation
  home **exactly once**. A home the README names must exist on disk
  (assert: `git ls-files` returns it) — the index is checked, never
  assumed.
- **`DOC-2` / `DOC-AS-2`** — **one deciding home per topic.** Each topic
  has exactly one home that decides it: README = index+status;
  `docs/adr` = decisions; `docs/architecture` = system doctrine;
  `docs/domain` = business rules; `docs/security` = RLS/RBAC/audit;
  `docs/brand` = brand; `docs/ux` = UX; `docs/qa` = QA+specs; `docs/product`
  = product. No topic is decided twice.
- **`DOC-3`** — **the phase close updates the index in the same commit**
  (ADR 0020 §consequences): status line + DECISION LOG Record + any
  doc delta ship together. README/NOT LOG stalling behind DOC = the
  fail `DOC-AS-3` catches.
- **`DOC-4`** — **security has one home.** RLS/RBAC/audit doctrine
  lives in `docs/security/` only; never restated in README or product
  docs (assert `DOC-AS-4` — README links, never restates).
- **`DOC-5`** — **domain has one home.** Business rules live in
  `docs/domain/`; `docs/product` links, never restates (assert
  `DOC-AS-5`).

## Consequences

- A new reader gets the whole picture from README + one link per topic.
- Fase close = index bump + DECISION LOG Record + doc deltas in the
  same commit; stalling is an asserted defect (`DOC-AS-3`), not a
  chore.
- **No schema, no RLS/RBAC, no policy change** (assert `DOC-AS-2` +
  ADR 0020 §DOC-2): documentation never rewrites a doctrine, never
  duplicates a security rule. Security homes restate nothing.

## Evidence / links

Home: `docs/architecture/documentation.md`. Test spec:
`docs/qa/documentation-tests.md`. Domain home:
`docs/domain/README.md`. Deciding-sum home per topic:
`docs/architecture/documentation.md` §2. DECISION LOG Record 22 in
`DECISION LOG.md` (this phase's close).
