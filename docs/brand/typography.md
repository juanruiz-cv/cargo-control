# Typography — CARGO CONTROL

## 1. Typeface

- **Inter** is the only brand typeface.
- Fallback stack: `Inter, system-ui, -apple-system, "Segoe UI", sans-serif`.
- Font loading: variable font (normal weight range) when possible; disable
  ligatures where they conflict with codes (`font-feature-settings`).

## 2. Type scale (compact operational)

Density is tuned for operational screens: minimum text size is 12px, default
body 13–14px. Tabular figures (`font-variant-numeric: tabular-nums`) for every
numeric column so weights and quantities align.

| Token            | Size    | Weight | Line-height | Usage                                        |
| ---------------- | ------- | ------ | ----------- | -------------------------------------------- |
| `text-xs`        | 12px    | 400/500| 16px        | Meta, badges, table cells                    |
| `text-sm`        | 13px    | 400/500| 18px        | Default body, table content                  |
| `text-base`      | 14px    | 400/500| 20px        | Body emphasis, dialogs                       |
| `text-md`        | 15px    | 500/600| 22px        | Subheadings, field labels                    |
| `text-lg`        | 17px    | 600     | 24px        | Card titles, page subheaders                 |
| `text-xl`        | 20px    | 600     | 28px        | Page titles (h1)                             |

## 3. Weights

- 400 — body text
- 500 — emphasis, table headers, labels
- 600 — titles, buttons (medium-semibold)
- 700 — numeric alerts, key metrics (sparingly)

Avoid 300 or below for operational legibility.

## 4. Numeric and code styling

- Quantities, weights and dimensions: `tabular-nums`, right-aligned in tables.
- Unit codes, barcodes, plate numbers: monospace fallback
  (`ui-monospace, "SF Mono", "Cascadia Mono", monospace`) at 12–13px.
- Codes are never auto-corrected or hyphenated.

## 5. Rules

- Truncate with ellipsis instead of wrapping where layout demands density.
- Line lengths for labels: short; no paragraphs of justified text.
- Emphasis via weight, not color, for body-level hierarchy.
- Headings are sentence case except proper nouns, in `Text` color (never
  `Primary` for running headings).