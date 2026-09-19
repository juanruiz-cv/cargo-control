# Domain home — Cargo Control

> **This is the domain home (doctrine `DOC-2`: one home per topic; the
> repository index — README.md → docs/architecture/documentation.md —
> links to THIS home and to NO OTHER domain home). Compiles with ADR
> 0020 (documentation doctrine). No RLS/RBAC/schema/policy change —
> documented changes only, asserted `DOC-AS-2`.**
>
> The topic set in this home is: **what the cargo domain IS** — the
> entities and business rules the movement engine, capacity/occupancy,
> trucks, and special areas all operate on. It is NOT the server-side
> security model (that home is `docs/security/`, never duplicated here,
> asserted `DOC-4`), NOT the interaction design (that home is
> `docs/ux/`), NOT the product story (that home is `docs/product/`).

## The five domain homes (each file DECIDES its own slice; README index
## names each ONE home — never two homes for one topic, assert `DOC-2`)

| File (deciding home) | Decides what |
| --- | --- |
| `entities.md` | The **kinds of things** in the domain: trucks, carriers, drivers, cargo items, merchandise lots, locations/zones/bins, special areas, checkpoints — and how they relate (an item lives on a truck; a lot splits off an item; a lot is stored in a zone). Contrast ADR 0003/0005 (item/lot/quantity model; special areas taxonomy). |
| `states.md` | The **lifecycle states** each entity can be in — cargo item (`playon`→`control`→`stored`/`quarantine`/`seizure`→`egress`), truck (moving/stationary/loaded), lot (on-truck/at-checkpoint/stored/split), special-area lots (in-special-zone, held-for-discharge, awaiting-inspection). Contrast ADR 0002 (state doctrine), ADR 0006 (capacity/occupancy invariants). |
| `flows.md` | The **end-to-end flows** the doctrine mandates: arrival → control → discharge → storage/scanner/scale/quarantine/seizure → movements → egress (asserted: every flow the system supports is named here; a movement uncodified here is a domain shadow). Contrast ADR 0010 (movement engine), ADR 0011 (special operational areas). |
| `business-rules.md` | The **operational business rules** — the deciding home for arrival/identity rules, full vs partial discharge, the split/quantity invariant (Σ leaf lots = total_quantity), lot transfers, egress with on-truck remnants, quarantine/seizure doctrine. **This file, and only this file, decides operational rules; it is linked (not restated) from the domain index, product docs, and QA specs** (assert `DOC-AS: business-rules.md is the single deciding home — no second home restates a rule). |
| `capacity-occupancy.md` | The **capacity/occupancy doctrine** — how capacity is measured and asserted per location (ADO sub-risk contract ADR 0006/0019), reserved minimums, occupancy statuses, over-capacity failure. Contrast ADR 0013 (operational dashboard capacity cards) — the dashboard *displays* capacity, this file *decides* it. |

## Crossing homes — which file decides a topic that appears in several guides

The README/documentation index is the **crossing index** (assert `DOC-1`:
one deciding source per topic). When a topic seems to live in several
homes, the **deciding home** is:

| Topic | Deciding home | Other places LINK it, never restate |
| --- | --- | --- |
| Split/quantity invariant (Σ leaf = total) | `docs/domain/business-rules.md` (ADR 0003) | `docs/domain/entities.md`, QA specs (link) |
| Capacity measurement | `docs/domain/capacity-occupancy.md` (ADR 0006) | operational dashboard (AD 0013) *displays*, QA asserts |
| Movement event shape | `docs/architecture/movement-engine.md` (ADR 0010) | domain `flows.md` names the flow, never the schema |
| Security model (RLS/RBAC/RBAC roles) | `docs/security/*` (ADR 0014) — **never restated in domain/ or product/ or README** | README index links to `docs/security/` (assert `DOC-4`) |
| Layout/format versioning | `docs/architecture/layout-versioning.md` (ADR 0015) | `docs/product/*` mention "lot versioning" as flows, not as schema |
| Responsive/mobile behavior | `docs/architecture/responsive-mobile.md` (ADR 0018) | `docs/ux/responsive-mobile.md` = the UX spec, links the architecture home |
| Performance allocation | `docs/architecture/performance.md` (ADR 0019) | QA specs assert, never restate |

## Doctrinal asserts (this home; live as `DOC-DOM-*` — QA runs them)

- `DOC-DOM-1` — **one deciding source per domain topic**: no file under
  `docs/domain/` restates a rule the deciding home already owns
  (entities-only files link, never copy rules; states-only files link
  the capacity doctrine). Asserted by the index (README →
  documentation.md index compiles against `git ls-files docs/domain`).
- `DOC-DOM-2` — **no hidden topic**: every domain topic (entity,
  state, flow, rule, capacity) has exactly ONE deciding file in this
  home; a topic with no deciding file is a gap, a topic with two is a
  duplicate (both fail).
- `DOC-DOM-3` — **the domain home is not the security home**: nothing in
  `docs/domain/*` states RLS/RBAC/permissions/roles; those assertions
  live only in `docs/security/*` (assert `DOC-4`). A domain doc that
  says "the driver role can…" is a doctrine defect (grabs the
  security home).
- `DOC-DOM-4` — **homes are index-linked, never restated in the repo
  README**: README.md and docs/architecture/documentation.md **name**
  this home (link); they do not summarize its rules. (Assert `DOC-2`,
  `DOC-3` reverse.)

## How this home is updated

A delta to any file in this home (a new rule, a changed invariant, a
new entity/state/flow) is **a do-matter doctrine delta**: it ships with
its ADR (ADR 0003/0005/0006/0010/0011/0015 — whichever the domain
change is), its README status bump (assert `DOC-3`), its QA assert
(`DOC-1` via README; per-change `DOC-DOM-*` above), and one DECISION
LOG record. Never: edit a domain rule silently and call it
"documentation" — a doctrine delta is a decision (ADR 0014 audit
doctrine; ADR 0020 §DOC-AS-3 asserts no silent doctrine change).
