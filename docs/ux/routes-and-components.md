# UX & Design System — Cargo Control

## Visual system

- **UI library:** shadcn/ui (Radix primitives) on Tailwind CSS.
- **Icons:** Lucide.
- **Style:** clean, dense operational interface; high contrast for audit
  screens; accessible focus states.
- **Status colors:**
  - `released/ok` — green
  - `in_warehouse/staged` — blue
  - `in_transit/loaded_out` — indigo
  - `in_quarantine/open` — amber
  - `seized` — red
- **Accessibility:** keyboard complete workflows (scanner/scale have input
  focus-first UX), semantic HTML, proper labels, high-contrast notices.

## Routes

```
/dashboard
/trucks        /trucks/:id
/cargo         /cargo/:id
/warehouse     /warehouse/:locationId
/scanner
/scale
/quarantine    /quarantine/:caseId
/seizure       /seizure/:recordId
/movements
/reports
/audit
/settings
```

## Component structure

```
src/
├── components/
│   ├── ui/            # shadcn/ui primitives (button, dialog, table, ...)
│   ├── layout/        # app shell, sidebar, topbar, toasts
│   ├── map/           # map widgets (future)
│   ├── trucks/        # truck list, truck detail parts
│   ├── cargo/         # cargo list/detail, unit grid, status badges
│   ├── warehouse/     # location tree, stock views
│   ├── movements/     # event trail timeline
│   └── shared/        # radio badges, data tables, empty states, page headers
├── pages/             # one composition per route
├── hooks/             # small focused hooks (e.g. useCargoById)
├── services/          # data access layer — single source of queries
├── lib/               # utils, formatters, zod schemas
├── types/             # strict domain types
├── config/            # app config, feature flags, env schema
└── integrations/      # supabase client, adapters
```

## Conventions

- Pages compose feature components; feature components never hold global state.
- Queries live in one service each; hooks wrap them, do not duplicate SQL.
- No giant components; split by responsibility and reuse `shared/`.