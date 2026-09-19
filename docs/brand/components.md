# Components — CARGO CONTROL

Base component specifications for the web application. These are specs; React
implementation lives in `cargo-control-web` (shadcn/ui primitives + Lucide).
All components consume tokens from `design-tokens.md`; no hardcoded colors.

Legend: variants, states, API, a11y notes per component.

---

## Button

- **Variants:** `primary`, `secondary`, `outline`, `ghost`, `danger`, `blocked`.
- **Sizes:** `sm` (28px), `md` (32px), `lg` (38px).
- **States:** idle, hover, active, focus-visible, disabled, loading.
- **Loading:** inline spinner + label; disables pointer events, keeps width stable.
- **Props (core):** `variant`, `size`, `isLoading`, `icon`, `iconRight`, `disabled`.
- **A11y:** native `<button>`; focus ring `--cc-primary`; icon-only buttons require
  `aria-label`.

## Input

- **Variants:** default, with icon (leading/trailing), search variant (see Search).
- **Sizes:** `sm`, `md` (default), `lg`.
- **States:** idle, focus, disabled, readOnly, invalid (error), success-backed.
- **Validation:** status communicated with both color and message (never color alone).
- **Props (core):** `value`, `onChange`, `placeholder`, `invalid`, `invalidText`, `icon`.
- **A11y:** label bound via `htmlFor`/`id`; error via `aria-describedby`.
- **Typography:** `--cc-typo-size-sm`; codes use `--cc-typo-mono`.

## Select

- **Variants:** default, with icon, native-drawn (operational fallback).
- **Sizes:** `sm`, `md`, `lg`.
- **States:** idle, focus, disabled, invalid.
- **Props (core):** `value`, `onChange`, `options`, `placeholder`, `invalid`.
- **A11y:** visible label; `aria-expanded` handled by primitive (shadcn select).

## Combobox

- Autocomplete input + popover list, keyboard navigable.
- **Behavior:** filter as you type; arrow keys navigate; Enter selects; Esc closes.
- **States:** closed, open, loading options, empty options (EmptyState message).
- **Props (core):** `items`, `value`, `onChange`, `getItemLabel`, `isLoading`, `placeholder`.
- **A11y:** combobox ARIA pattern (`role="combobox"`, `aria-controls`, `aria-activedescendant`).

## Search

- Specialized Input with `Search` icon, debounced query, clear button.
- **Behavior:** debounce 300ms; `onQueryChange(query)`; clear restores full list.
- **Sizes/States:** same as Input.
- **Props (core):** `query`, `onQueryChange`, `debounceMs`, `placeholder`.
- Usage: global and per-table search; submits on Enter for scanning workflows.

## Filter

- **Behavior:** composed of Select + Search + chip row of active filters; resettable.
- **Props (core):** `filters` (schema: `[{ key, label, type: select|search }]`),
  `value`, `onChange`, `onReset`, `isActive`.
- **A11y:** chip actions are buttons; counts announced (`aria-live="polite"`).
- Used for: status, type, date range, zone filters on lists and movements.

## Table

- **Layout:** compact density (8px vertical), `tabular-nums`, right-aligned
  numeric columns, sticky header.
- **Variants (self):** plain, selectable (checkbox rows), with row actions.
- **States:** loading (skeleton rows), empty (EmptyState), row hover, selected.
- **Props (core):** `columns`, `data`, `sortable`, `onSortChange`, `onRowClick`,
  `selected`, `onSelectionChange`.
- **A11y:** semantic `<table>` or `role="table"`; sort indicators audibly labeled;
  row actions keyboard reachable.

## Badge

- **Variants (tone):** neutral, `primary`, `success`, `info`, `warning`, `danger`, `blocked`.
- **Style:** soft surface (status hex ~10–12% over Surface) + full hex foreground;
  `md` default (12px), small for table cells.
- **Right aligned with optional leading icon.**
- **Usage:** domain status labels and zone labels. Never for decorative tinting.

## Card

- **Parts:** header (title, optional actions), body, footer (optional).
- **Variants:** default (Surface, border, `--cc-radius-md`), interactive (hover
  elevation `--cc-shadow-sm`), `status-tone` (left border in status color for
  quarantine/seizure highlights).
- **Props (core):** `title`, `actions`, `tone`, `padded`.
- **A11y:** interactive cards require real buttons/links, not onClick divs.

## Dialog

- **Behavior:** confirm/edit flows; focus trap; Esc closes; overlay closes on
  backdrop click (except destructive confirms — require explicit choice).
- **Sizes:** `sm`, `md` (default), `lg`.
- **Props (core):** `open`, `onOpenChange`, `title`, `description`, `footer`.
- **A11y:** `role="dialog"` + `aria-modal`, labelled by title.

## Drawer

- Right-side panel for detail/audit context (e.g. cargo unit trail).
- **Behavior:** overlay + slide-in; focus trap; Esc closes; body scroll locked.
- **Sizes:** `md` (default 40%), `lg` (60%).
- **Props (core):** `open`, `onOpenChange`, `title`, `placement` (default right).
- **A11y:** `role="dialog"` `aria-modal`; labelled by title.

## Toast

- **Behavior:** auto-dismiss (success/info 4s, error/warning persist until closed);
  stack bottom-right; action button optional (e.g. "View report").
- **Tones:** `success`, `info`, `warning`, `danger`.
- **A11y:** `role="status"` for success/info; `role="alert"` for warning/danger.
- Expose via a toast provider; no manual DOM creation in components.

## Alert

- Inline, persistent feedback within a view (not transient like Toast).
- **Tones:** `info`, `warning`, `danger`; optional `title` + body.
- **Props (core):** `tone`, `title`, `children`, `action`.
- **A11y:** `role="alert"` for danger/warning; icon + color (not color alone).

## Tooltip

- Short, non-critical help or metadata.
- **Behavior:** show on hover/focus, hide on Esc; `space-5` delay on open.
- **Props (core):** `content`, `children`, `side`.
- **A11y:** content via `aria-describedby`; never required to complete a task.

## Tabs

- **Variants:** `line` (default, bottom border indicator), `pills`.
- **Behavior:** keyboard nav (arrow keys), `role="tablist"`/`aria-selected`.
- **Props (core):** `items`, `value`, `onChange`.
- **Usage:** cargo detail (Header/Units/Movements), truck detail, settings.

## Pagination

- **Behavior:** page numbers + prev/next; page size selector; preserves query
  params. Shows "total N" and current range.
- **Props (core):** `page`, `pageSize`, `total`, `onPageChange`, `onPageSizeChange`.
- **A11y:** each control is a button with accessible label; `aria-current="page"`.

## EmptyState

- For empty lists/filters.
- **Parts:** icon, title, description, optional action button.
- **Props (core):** `icon`, `title`, `description`, `action`.
- **A11y:** non-interactive; pure status presentation.

## LoadingState

- **Variants:** skeleton rows (table), spinner + label (full view), inline skeleton.
- **Props (core):** `variant`, `label`, `rows` (skeleton).
- **A11y:** `aria-busy` on container; no result announces.
- Skeletons emulate final layout height to avoid jump.

## ErrorState

- **Parts:** icon (danger), title, description, retry button.
- **Props (core):** `error`, `onRetry`.
- **A11y:** `role="alert"`; message mirroring for failures of the whole view.
- Retry re-runs the same query; transient network errors show Toast on retry fail.

## StatusIndicator

- **Variants (tone):** `success`, `info`, `warning`, `danger`, `blocked`.
- **Shape:** filled dot + label (`Warning` for quarantine/rezago, `Blocked` for
  seizure/secuestro, `Success` released, `Info` in warehouse, `Danger` errors).
- **Props (core):** `tone`, `label`, `pulse` (only while awaiting action).
- **A11y:** label text is the accessible name; never color-only.

---

## Cross-cutting rules

- Density: operational default is compact (`--cc-size-control-md`); lg reserved
  for primary entry screens.
- All form components render status with **color + text/icon** — never color alone.
- Component library is built on shadcn/ui primitives; custom business components
  must be added to `components/` feature folders, not duplicated in `ui/`.
- Theming: tokens only. Any palette addition requires updating
  `colors.md` + `design-tokens.md` and a DECISION LOG entry.