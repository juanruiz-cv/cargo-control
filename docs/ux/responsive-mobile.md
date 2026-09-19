# Responsive & Mobile UX — Cargo Control

> **Compiles with ADR 0016 (Professional UX Doctrine), ADR 0018
> (Responsive & Mobile-Ready), ADR 0015 (layout versioning) and the
> doctrine of visual ≠ logistic.** Extends per module; never relaxes.

## 1. Breakpoint doctrine (empirical mapping)

Min size, desktop-first. Behavior by design-token breakpoint
(`--cc-bp-lg` = 1024px md = 768px):

| Range | Focus | Layout |
| -- | -- | -- |
| `< 768px` | compensation smallest | stacked single-column; nav above; density preserved |
| `768–1023px` | tablet | icon-rail nav; part-condensed tables; forms preserved; scan affordance |
| `1024–1599` | laptop | full sidebar + dense tables (default) |
| `≥ 1600` | desktop wide | full sidebar + full density; multi-panel |

**Rule: no mini-modes.** Dense tables stay dense on tablet — same
columns, same data. A breakpoint collapses **chrome, not data.** Every
operational view on tablet shows the same rows a desktop shows.

## 2. Tablet nav (768–1023)

- Sidebar → **icon rail** (56px): icons + tooltip on hover/focus;
  active = filled pill + icon (ADR 0016, never color alone — keep
  label in tooltip).
- Header: title collapses to breadcrumb; search stays (debounced 300
  ms — never removed).
- Dense tables unchanged; density toggle remains optimistic-safe local
  pref (ADR 0016 §3).
- Cta actions: primary stays visible; secondary into overflow menu.

## 3. Tablet operational flows (full capability)

**Tablet = full write path, never read-only.** Registration of
movement, quarantine/seizure/release, and layout publish/restore work
IDENTICALLY on tablet — same API, same confirmations, same server
commit, same audit rows. No tablet-specific reduced modes.

- Movement registration on tablet: same Stages (scan/identify →
  details → signage), same movement-timeline and
  floor-plan versioning confirmations, same toast contract.
- Because the confirmation + server-commit doctrine (ADR 0016) holds
  on every viewport, **confirmations appear on tablet too** — publish/
  restore/publish-layout never bypassed by a smaller viewport.

## 4. Dense tables on tablet

| Rule | Desktop | Tablet (768+) |
| -- | -- | -- |
| Columns | all in compact density | same columns; min 28px hit targets; horizontal scroll only if ≥ 6 primary cols |
| Status | color + label | color + label (unchanged) |
| Sort / column toggle | optimistic-safe local (ADR 0016) | same |
| Density toggle | compact/large pref | same, respects breakpoint default |

- When a table has > expected width for the viewport: **keep density,
  allow horizontal scroll within the table row group** — never drop a
  column on tablet that desktop shows (data parity; "breakpoint
  collapses chrome, not data").

## 5. Scanner doctrine (future contract, ADR 0018 §3)

Today: **scan affordance** — a Scan button (icon + label) next to the
search input (trucks, cargo, movements, sectors, map). Pressing it
shows a placeholder dialog that documents the **future barcode/QR
camera path**; it never opens a live camera yet, never fabricates a
decode.

- Contract (normative, for when it ships): scan → decode → **fills the
  search input** → debounced server query (300 ms, ADR 0016) → results
  via RLS. Scan **never** triggers a mutation, **never** registers a
  movement by itself; any write still requires the operator confirm +
  server commit.
- On tablet the scan affordance is the SAME control (never a
  flow-forking "mobile-only scan").

## 6. Empty / loading / feedback on tablet

- Skeletons for cold navigation (ADR 0016) — unchanged; they meet the
  breakpoint, never replaced by a spinner just because the viewport
  changed.
- Debounce 300 ms on tablet search (same as desktop) — never a
  second, larger factory delay.
- Confirmations on tablet: same modal; min hit targets 28px (already
  doctrine); keyboard + touch both.
- Errors inline near field (icon + text) — unchanged by viewport.

## 7. Future mobile app — what reuses, what does not

| Reuses verbatim (ADR 0018) | Does NOT reuse / new |
| -- | -- |
| API (REST) | no separate mobile API |
| Auth (session/JWT) | no second identity store |
| Permissions (RLS + RBAC) | no new permission codes |
| Data model (schema versions) | no mobile-specific tables |
| Business rules (append-only movements, visual ≠ logistic) | no fork |

The mobile app, when it ships, is a **thin client over the same origin**:
same endpoints, same RLS-constrained reads, same append-only write
path, same audit. "Mobile" never means weaker policy.

## 8. Module assertions

Each module UX/QA doc now asserts:

> *Compiles with the Responsive & Mobile-Ready doctrine (ADR 0018);
> tablet parity on every operational path; no permission, schema, or
> policy change.*
