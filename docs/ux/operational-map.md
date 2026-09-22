# Operational Map — UX Specification (Fase 11 / Prompt 12)

The main screen: a live visual map of the operational floor loaded from
Supabase (never hardcoded), with zoom/pan/fit, legend and filters, and
selection panels that compose the existing module specs.

## Route

`/` (default route) → OperationalMap. Guard: `warehouse.read` required;
detail panels enforce their own module read permissions.

## Canvas

- Renders the **published layout** (`layouts.status = published`) with
  its `layout_elements` (geometry in px; ADR 0005). Element shapes by
  `element_type`: playon (outlined area), warehouse/galpón (block),
  storage/sectores 1-12 (blocks), scanner/scale (station icons),
  quarantine/seizure (hold icons).
- **Layout from Supabase only.** If none published: empty state with
  "Configurar mapa" action. No baked-in arrangement, ever.
- **Viewport controls (always visible):**
  - Zoom: wheel/ctrl+wheel, +/- buttons, pinch; bounded 25%–400%.
  - Pan: drag canvas / scroll when zoomed.
  - Fit to screen: reset viewport to layout bounds.
  - Legend: collapsible overlay explaining the 5 states + element
    icons + absence of published layout notice.
  - Filters: by element type (playón/sectores/galpón/áreas), by state
    (LIBRE/PARCIAL/OCUPADO/BLOQUEADO/MANTENIMIENTO), by truck present;
    filters hide elements, never data.

## Element rendering

Each element card/badge shows:

- **name** + **code** (from layout_element/location)
- **estado** — visual state with label + color:
  - `LIBRE` (green), `PARCIAL` (amber), `OCUPADO` (red),
    `BLOQUEADO` (purple), `MANTENIMIENTO` (gray/hatched)
- **ocupación** — e.g. `1.2 t / 2 t · 60%` (kg/volume/units as known)
- **capacidad** — per dimension; `∞` when NULL (unlimited)

Playón renders **truck chips** at their lane positions when known
(otherwise grouped in a "Camiones en playón" cluster): plate + state
badge; click selects the truck.

## Truck finder panel (right)

A right-side panel lists trucks with a **debounced (300 ms) search** by
plate or transporter; it is the map's "where is my truck?" entry point.

- **Search**: filters the full truck catalog by plate/company, debounced
  300 ms (ADR 0016); the list shows every truck, not only those on the
  playón.
- **Row content**: plate (bold), derived state badge (same
  `derivarEstadoCamion` taxonomy as the trucks module — never a second
  vocabulary), transporter, and a location hint:
  - On the playón → "En playón" + the sector it renders over;
  - Not on the playón → its derived state label (En ruta / Disponible /
    Retenido / En balanza …).
- **Click behavior**: selects the truck — the map **centers the viewport
  on the truck chip** (pan/zoom without leaving the map) and opens the
  same truck detail panel as clicking the chip; a second click on the
  same row keeps the panel open.
- **Permissions**: the panel is a `truck.read` surface (the map route is
  `warehouse.read`); rows/counters never reveal rows the caller cannot
  read. RLS remains the authority; the panel only hides unavailable rows.
- **Empty states**: no match → "Sin resultados"; no trucks at all →
  "Sin camiones registrados".
- **Live sync**: the panel follows the same refresh cycle as the canvas
  (occupancy/movement/hold signals); a truck leaving the playón drops
  from the map chips but stays listed with its new derived location.

## Selection

Selecting an element opens a side panel (drawer) without leaving the
map:

### Truck
- Detail: plate, transporter, derived state (Fase 7)
- Mercadería: manifests/items/lots (cargo module)
- Estado + movimientos: movements timeline (Fase 9)
- Acciones permitidas: buttons from kind→permission map (egreso,
  transfer, return_to_truck…) shown only when the actor has the
  permission; disabled otherwise.

### Sector / Galpón / Playón
- Capacidad + ocupación per dimension (kg/m³/units + %)
- Mercadería: current lots placed (cargo module, derived currentLocation)
- Movimientos: timeline filtered to this location (Fase 9)

### Scanner
- Specific: pending queue via `station_queue` (kind=scan) + performed
  ops (Fase 10). Actions: capture dialog if `scanner.create`.

### Balanza
- Depth: pending queue (kind=scale) + weigh form + history (Fase 10).
  Actions: weigh if `scale.create`.

### Rezago / Secuestro
- Open holds + history + resolution notes + docs (Fase 10).
  Actions: open case if `quarantine.create`/`seizure.create`.

## Live updates — no full redraw

- The map subscribes to change signals (Realtime/poll) per element key.
- On an event (occupancy, movement, hold change, truck arrival/departure,
  maintenance flag), only the affected element re-renders: derived color
  badge + occupancy line recompute locally; canvas, other elements,
  filters and legend are untouched.
- Optimistic updates: none. Visual state follows committed data.

## Filters & legend

- **Filters:** element type, state, truck present; combine additively;
  "Limpiar" resets.
- **Legend:** 5 state colors with short explanation; element type icons;
  notice row "Sin layout publicado" when applicable.

## Accessibility

- Map is keyboard-pannable/zoomable (focus trap in drawer; +/- and
  arrows); colors always paired with text labels (never color-only);
  legend reachable via a button; drawer is a focus-trapped dialog.