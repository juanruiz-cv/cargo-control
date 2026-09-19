# Iconography — CARGO CONTROL

## 1. Icon set

- **Lucide** icons only.
- Stroke-based (1.5–2px stroke), never filled decorative glyphs outside badges.
- No third-party or hand-drawn icons.

## 2. Size grid

| Token        | Size  | Usage                                  |
| ------------ | ----- | -------------------------------------- |
| `icon-16`    | 16px  | Table cells, compact buttons, meta     |
| `icon-18`    | 18px  | Default action buttons                 |
| `icon-20`    | 20px  | Inputs, empty states                   |
| `icon-24`    | 24px  | Page headers, indicators               |

Status indicators use filled dots (see `components.md` → StatusIndicator), not
stroke icons.

## 3. Semantic mapping

| Concept        | Icon (Lucide)                  |
| -------------- | ------------------------------ |
| Scanner        | `ScanBarcode` or `ScanLine`    |
| Scale / weight | `Scale`                        |
| Truck          | `Truck`                        |
| Cargo/package  | `Package` / `Boxes`            |
| Warehouse      | `Warehouse` / `LayoutGrid`     |
| Playón / yard  | `Warehouse` + `ArrowDownUp`    |
| Quarantine / rezago | `ShieldAlert` / `PackageX` |
| Seizure / blocked | `Lock` / `ShieldOff`        |
| Movements/trail| `Route` / `History`            |
| Audit          | `FileSearch` / `ClipboardList` |
| Reports        | `BarChart3` / `FileBarChart`   |
| Dashboard      | `LayoutDashboard`              |
| Search         | `Search`                       |
| Filter         | `Filter` / `SlidersHorizontal` |
| Warning        | `TriangleAlert`                |
| Danger         | `CircleAlert`                  |
| Success        | `CheckCircle2` / `CircleCheckBig` |

## 4. Rules

- One icon per concept; do not mix equivalents for the same action.
- Icons accompany actions/text and are labeled for accessibility
  (`aria-label` when icon-only, or hidden via `aria-hidden` when adjacent to
  meaningful text).
- Status icons follow the status color; do not recolor icons for decoration.
- In tables, keep icon column widths fixed (16px) to preserve alignment.