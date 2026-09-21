/**
 * JS/TS mirror of the Cargo Control design tokens.
 *
 * The CSS custom properties in src/index.css are the single source of
 * truth for styles; this object exists for code that needs the values at
 * runtime (status badge derivation, chart config, map layers in future
 * phases). Values come from docs/brand/design-tokens.md and
 * docs/brand/colors.md — do not edit one without the other.
 */
export const tokens = {
  colors: {
    primary: "#1F4E5F",
    primaryLight: "#B7DCE8",
    bg: "#EEF3F5",
    surface: "#FFFFFF",
    text: "#1F2933",
    textSecondary: "#64748B",
    border: "#CBD5E1",
  },
  zones: {
    warehouse: "#F5F0D6",
    warehouseArea: "#E1BA84",
    playon: "#D5D7D8",
  },
  status: {
    success: "#16A34A",
    info: "#2563EB",
    warning: "#F59E0B",
    danger: "#DC2626",
    blocked: "#7C3AED",
  },
  breakpoints: {
    xs: 0,
    sm: 480,
    md: 768,
    lg: 1024,
    xl: 1600,
  },
  radii: {
    sm: 4,
    md: 6,
    lg: 10,
    full: 9999,
  },
  space: {
    base: 4,
  },
  motion: {
    fast: 120,
    base: 200,
    slow: 320,
    ease: "cubic-bezier(0.2, 0, 0, 1)",
  },
} as const

export type StatusToken = keyof typeof tokens.status