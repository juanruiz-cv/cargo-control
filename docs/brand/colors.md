# Colors — CARGO CONTROL

The color system is token-based. All UI colors come from the definitions below;
no arbitrary values are allowed in styles.

## 1. Brand palette

| Token        | Hex       | Usage                                              |
| ------------ | --------- | -------------------------------------------------- |
| Primary      | `#1F4E5F` | Navigation, primary actions, active states         |
| Primary Light| `#B7DCE8` | Primary hover/soft surfaces, selected backgrounds  |
| Background   | `#EEF3F5` | App background                                      |
| Surface      | `#FFFFFF` | Cards, tables, dialogs, form surfaces               |
| Text         | `#1F2933` | Primary text                                        |
| Secondary Text | `#64748B` | Labels, meta, hints                            |
| Border       | `#CBD5E1` | Hairlines, dividers, input borders                  |

## 2. Physical zone palette (maps and facility views)

Used to render the facility: playón, galpón and storage sectors. Not for general
UI chrome.

| Token           | Hex       | Zone                         |
| --------------- | --------- | ---------------------------- |
| Warehouse       | `#F5F0D6` | Galpón (warehouse pod)       |
| Warehouse Area  | `#E1BA84` | Sector de almacenamiento     |
| Playón          | `#D5D7D8` | Patio / receiving yard       |

## 3. Status palette

| Token    | Hex       | Meaning                                       |
| -------- | --------- | --------------------------------------------- |
| Success  | `#16A34A` | Released, checked, complete                   |
| Info     | `#2563EB` | In warehouse, informational state             |
| Warning  | `#F59E0B` | In quarantine / rezago, attention required    |
| Danger   | `#DC2626` | Error, failure, blocked operation             |
| Blocked  | `#7C3AED` | Seized (secuestro), frozen state              |

Status-to-zone mapping:

| Domain state             | Token used |
| ------------------------ | ---------- |
| `checked` / `released`   | Success    |
| `in_warehouse` / staged  | Info       |
| `in_quarantine` (rezago) | Warning    |
| `seized` (secuestro)     | Blocked    |
| Operational error        | Danger     |

## 4. Contrast and accessibility

Must meet WCAG 2.1 AA:

- `Text` on `Surface` === excellent (> 7:1).
- `Secondary Text` on `Surface` — do not use for body text; reserved for meta.
- `Primary` as link/icon on `Surface` — verify 4.5:1 before use at small sizes;
  `Primary Light` is never used for text.
- White on status colors (Success/Info/Warning/Danger/Blocked) — for badges use
  a soft surface variant of the status color with the status hex as foreground.

Soft status surfaces (recommended shorthand): status hex at ~10–12% opacity over
`Surface`, text in the full status hex.

## 5. Rules

- Status colors never gradient into decoration.
- Zone palette never used for interactive chrome.
- Hover states derive from token alphas, not new hexes.