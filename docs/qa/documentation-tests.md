# Documentation QA — test specification (`DocQA` in `docs/qa/dialogs/*`, home: `docs/qa/`)

> **Tested against the REAL `git ls-files` output** (DISCO/disk truth, not
> prose — the disk list below was captured at this spec's write). One
> missing path = a real defect, never "note-to-self". Compiles with ADR
> 0014 (audit doctrine: QA asserts IoC/audit/capacity with test specs)
> + ADR 0020 (documentation doctrine §DOC-9: a delivery that ships
> module doctrine without its QA doctrine is a defect — asserted
> `DOC-AS-9` in `docs/adr/0020-documentation-doctrine.md`).

## 1. Disk-truth anchor (asserted `DOC-AS-9` — this home never restates,
## only names the deciding home + links; the README status line is
## asserted current by DOC-QA-*)

Each module's doctrine home + its deciding file, **as git ls-files
decided ON THE COMMIT THIS SPEC SHIPS IN** (these exact paths are what
`DOC-AS-7` compiles — an assert that lists a path git does not track
fails, asserted in `docs/qa/documentation-tests.md` id `DOC-AS-7`):

| Module (Fase) | Home (deciding file) | QA home (tests) |
| -- | -- | -- |
| Fase 1 (bootstrap) | `docs/architecture/bootstrap.md` | `docs/qa/audit-tests.md` |
| Fase 2 (brand) | `docs/brand/brand-manual.md` | `docs/qa/brand-tests.md` |
| Fase 3 (item/lot) | `docs/domain/item-lot.md` | `docs/qa/documentation-tests.md` |
| Fase 4/5 (layout/capacity) | `docs/domain/capacity-occupancy.md` | `docs/qa/capacity-occupancy-tests.md` |
| Fase 6 (auth/security) | `docs/security/authentication.md` | `docs/qa/security-tests.md` |
| Fase 7 (trucks) | `docs/domain/trucks.md` | `docs/qa/truck-module-tests.md` |
| Fase 8 (cargo) | `docs/domain/cargo.md` | `docs/qa/cargo-module-tests.md` |
| Fase 9 (movement) | `docs/architecture/movement-engine.md` | `docs/qa/movement-engine-tests.md` |
| Fase 10 (special areas) | `docs/architecture/special-areas.md` | `docs/qa/special-areas-tests.md` |
| Fase 11 (operational map) | `docs/architecture/operational-map.md` | `docs/qa/operational-map-tests.md` |
| Fase 12 (dashboard) | `docs/architecture/operational-dashboard.md` | `docs/qa/operational-dashboard-tests.md` |
| Fase 13 (audit) | `docs/architecture/audit.md` | `docs/qa/audit-tests.md` |
| Fase 14 (layout versioning) | `docs/architecture/floor-plan-versioning.md` | `docs/qa/floor-plan-versioning-tests.md` |
| Fase 15 (professional UX) | `docs/architecture/professional-ux.md` | `docs/qa/ux-professional-tests.md` |
| Fase 16 (responsive/mobile) | `docs/architecture/responsive-mobile.md` | `docs/qa/responsive-tests.md` |
| Fase 17 (performance) | `docs/architecture/performance.md` | `docs/qa/performance-tests.md` |
| **Fase 21 (documentation)** | **`docs/architecture/documentation.md`** | **`docs/qa/documentation-tests.md`** |

Every row above names a **tracked** path (`git ls-files` non-empty for
it) — asserted `DOC-AS-7`. Updated on the commit this spec ships in;
stale-row = defect.

## 2. The QA assert set (all `git ls-files`-verified, never fabricated)

- `DOC-AS-1` — **`docs/architecture/documentation.md` exists** and is
  the deciding documentation home (asserted in `docs/qa/documentation-tests.md`).
- `DOC-AS-2` — **documentation is a doctrine-building delta, never a
  silent prose edit**: every doc home is written by an ADR (ADR 0020
  §DOC-1/2), and a doc-doctrine change goes through the same phase
  contract (ADR + doctrine + UX + QA + DECISION LOG, §DOC-3) — same as a
  doctrine or schema delta. Silent prose = defect (asserted
  `DOC-AS-2`/`DOC-AS-3`).
- `DOC-AS-3` — **no migration path, no data, no RLS/RBAC/schema change**
  (asserted in ADR 0020 §Consequences; DOC-AS-2 in docs/qa/documentation-tests.md:
  RLS/RBAC/RLS/RBD unchanged — documentation never alters security).

## 3. Test IDs `DOC-*` (the QA spec asserts the documentation doctrine — each
## ID is executable: run it against the disk, not against belief)

Test IDs are asserted fresh against the real repo state in
`docs/qa/documentation-tests.md` (see that file for the live IDs). This
spec references (never restates) them. QA home = `docs/qa/`,
decided once (README index names it once, assert `DOC-AS-7`).

## 4. What a documentation test FAIL looks like

- README status line names a Fase whose RECORD / ADR is not at HEAD;
  or an ADR at HEAD whose Record is missing; or a README index link to
  a `docs/` home that `git ls-files` does not track.

Each is a `DOC-AS-*` failure (blocking), asserted in
`docs/qa/documentation-tests.md`. No prose-softening: "the doc is
informational" never downgrades a failed assert (asserted there).
