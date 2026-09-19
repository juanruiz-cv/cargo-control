# Design Tokens — CARGO CONTROL

Single source of truth for the visual system. Implementable as CSS custom
properties (and equivalently for JS/TS theme objects consumed by the web app).

## 1. Token naming

`--cc-<group>-<name>` where `group` is one of:

| Group    | Purpose                                |
| -------- | -------------------------------------- |
| `color`  | Brand, surface, text, status colors    |
| `space`  | Spacing scale                          |
| `radius` | Corner radii                           |
| `border` | Widths and border tokens               |
| `shadow` | Elevation                              |
| `typo`   | Font family, size, weight, line-height |
| `motion` | Durations and easing                   |
| `size`   | Control heights (inputs/buttons), icons |
| `z`      | Z-index scale                          |

Semantic role tokens (e.g. `--cc-color-bg`) are preferred over raw palette in
components; raw palette preserves the source hex.

## 2. Color tokens

```css
:root {
  /* palette */
  --cc-primary: #1F4E5F;
  --cc-primary-light: #B7DCE8;
  --cc-bg: #EEF3F5;
  --cc-surface: #FFFFFF;
  --cc-text: #1F2933;
  --cc-text-secondary: #64748B;
  --cc-border: #CBD5E1;

  /* physical zones */
  --cc-zone-warehouse: #F5F0D6;       /* galpón */
  --cc-zone-warehouse-area: #E1BA84;  /* sector de almacenamiento */
  --cc-zone-playon: #D5D7D8;          /* patio */

  /* status */
  --cc-success: #16A34A;
  --cc-info: #2563EB;
  --cc-warning: #F59E0B;
  --cc-danger: #DC2626;
  --cc-blocked: #7C3AED;

  /* role aliases */
  --cc-color-bg: var(--cc-bg);
  --cc-color-surface: var(--cc-surface);
  --cc-color-text: var(--cc-text);
  --cc-color-text-secondary: var(--cc-text-secondary);
  --cc-color-border: var(--cc-border);
}
```

Soft status surfaces (badge backgrounds) derive from status hexes at ~10–12%
alpha over `Surface`.

## 3. Spacing scale

Base unit 4px.

```css
:root {
  --cc-space-0: 0;
  --cc-space-1: 2px;
  --cc-space-2: 4px;
  --cc-space-3: 6px;
  --cc-space-4: 8px;
  --cc-space-5: 12px;
  --cc-space-6: 16px;
  --cc-space-7: 20px;
  --cc-space-8: 24px;
  --cc-space-9: 32px;
}
```

Density: operational tables use `--cc-space-2`/`--cc-space-4` cell padding.

## 4. Radius, borders, shadows

```css
:root {
  --cc-radius-sm: 4px;
  --cc-radius-md: 6px;
  --cc-radius-lg: 10px;
  --cc-radius-full: 9999px;

  --cc-border-width: 1px;
  --cc-border-color: var(--cc-border);

  --cc-shadow-sm: 0 1px 2px rgb(15 23 42 / 0.05);
  --cc-shadow-md: 0 4px 12px rgb(15 23 42 / 0.08);
  --cc-shadow-lg: 0 8px 24px rgb(15 23 42 / 0.12);
}
```

## 5. Typography tokens

```css
:root {
  --cc-typo-font: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  --cc-typo-mono: ui-monospace, "SF Mono", "Cascadia Mono", monospace;

  --cc-typo-size-xs: 12px;
  --cc-typo-size-sm: 13px;
  --cc-typo-size-base: 14px;
  --cc-typo-size-md: 15px;
  --cc-typo-size-lg: 17px;
  --cc-typo-size-xl: 20px;

  --cc-typo-weight-regular: 400;
  --cc-typo-weight-medium: 500;
  --cc-typo-weight-semibold: 600;

  --cc-typo-leading-xs: 16px;
  --cc-typo-leading-sm: 18px;
  --cc-typo-leading-base: 20px;
  --cc-typo-leading-md: 22px;
  --cc-typo-leading-lg: 24px;
  --cc-typo-leading-xl: 28px;
}
```

Numbers use `font-variant-numeric: tabular-nums`.

## 6. Control and icon sizes

```css
:root {
  --cc-size-control-sm: 28px;
  --cc-size-control-md: 32px;
  --cc-size-control-lg: 38px;

  --cc-size-icon-16: 16px;
  --cc-size-icon-18: 18px;
  --cc-size-icon-20: 20px;
  --cc-size-icon-24: 24px;
}
```

Controls are compact but keyboard- and touch-friendly (min 28px hit target).

## 7. Motion

```css
:root {
  --cc-motion-fast: 120ms;
  --cc-motion-base: 200ms;
  --cc-motion-slow: 320ms;
  --cc-motion-ease: cubic-bezier(0.2, 0, 0, 1);
}
```

Motion is functional only: dialogs/drawers, toasts, focus visibility. Respect
`prefers-reduced-motion`.

## 8. Elevation / z-index

```css
:root {
  --cc-z-dropdown: 30;
  --cc-z-sticky: 40;
  --cc-z-overlay: 50;
  --cc-z-dialog: 60;
  --cc-z-drawer: 60;
  --cc-z-toast: 70;
}
```

## 9. Rules

- Components consume role tokens, never hardcoded hex.
- New colors may only be added by updating this document and `colors.md`
  together (decision log entry required).
- Dark mode (future) maps roles, not raw palette.