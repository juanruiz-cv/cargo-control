# Brand Manual — CARGO CONTROL

Official visual identity for the cargo control and traceability platform.

## 1. Brand essence

CARGO CONTROL is the operational interface of a physical facility where goods
are received, weighed, scanned, stored, and dispatched under strict control.
The interface is the digital twin of that facility: every screen must feel like
looking at a well-run yard.

## 2. Conceptual reference

The product is defined by a physical facility composed of:

| Zone                 | Meaning                                        | Interface role               |
| -------------------- | ---------------------------------------------- | ---------------------------- |
| **Playón**           | Outdoor receiving / loading yard               | Vehicle and cargo intake     |
| **Galpón**           | Warehouse pod                                  | Main storage                  |
| **Sectores de almacenamiento** | Storage sectors                | Levels, zones and bins        |
| **Scanner**          | Scanning checkpoint                           | Unit identification/check-in |
| **Balanza**          | Weighing checkpoint                          | Unit weight validation       |
| **Rezago**           | Backlog / leftovers repository                | Quarantine / hold            |
| **Secuestro**        | Seized goods                                  | Legal hold, blocked          |

These zones give spatial meaning to the status model: cargo flows from playón →
scanner → balanza → galpón → sectores, and may enter **rezago** (warning) or
**secuestro** (blocked) states.

## 3. Brand values

The interface must always transmit:

- **Control** — clear state ownership, explicit actions
- **Precisión** — exact weights, codes, timestamps
- **Trazabilidad** — every event visible and immutable
- **Seguridad** — permission awareness, locked states visible
- **Orden** — consistent layout, predictable navigation
- **Eficiencia** — compact density, keyboard-first workflows
- **Tecnología** — scanner/scale integration as a first-class flow

## 4. Design personality

- **Operational, not decorative.** Density over whitespace, but never at the
  cost of legibility or accessibility.
- **Calm control.** Low-chroma neutrals carry the UI; status colors are used
  sparingly and with meaning (never decorative).
- **Precise data.** Typography and tables are designed to be read fast and
  compared accurately.

## 5. Usage rules

- Use only tokens defined in `design-tokens.md`. **No arbitrary colors.**
- Status colors are semantic: they encode state, not decoration.
- Priority of contrast: text over surfaces must meet WCAG AA (see `colors.md`).
- Keep primary actions limited; one primary action per operational view.
- Icons come from Lucide only (see `iconography.md`).

## 6. Files

- `colors.md` — color system and token mapping
- `typography.md` — type system (Inter)
- `iconography.md` — icon system (Lucide)
- `design-tokens.md` — token architecture and values
- `components.md` — base component specifications