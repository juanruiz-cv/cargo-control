# Operational Dashboard — UX Specification (Fase 12 / Prompt 13)

The operational dashboard: real-time operational KPIs and trend charts,
all derived server-side from the real database. No fake data, no client
recomputation from raw history.

## Route

`/dashboard` → OperationalDashboard. Guard: at least one dashboard
read permission; cards the user cannot read are hidden (per-module read
codes).

## Layout

Top-down, responsive: KPI cards row → charts grid → breakdown tables.

### KPI cards (10)

Grouped in four clusters with icon + label + value + delta caption:

| Cluster | Cards |
| ------- | ----- |
| Camiones | Dentro del predio · Esperando · Descargas en proceso |
| Mercadería | Almacenada · En Scanner · En Balanza · En Rezago · Secuestrada |
| Sectores | Ocupados · Libres |

- Value formatting: trucks = integer; merchandise = kg/vol/units as
  configured (follows the active dimension the facility uses); sectors =
  "n / total".
- Delta caption (optional): short trend vs previous window —
  "3 vs ayer", "0 hace 24 h", hidden when no previous window exists.
  Deltas are computed server-side (previous-window aggregate), never
  accumulated client-side.

### Charts (5)

1. **Ingresos por día** — bar chart, arrivals per day (window default
   30 days).
2. **Movimientos** — stacked bar or multi-line by kind per day
   (optional kind filter; bounded window).
3. **Ocupación** — occupancy % per location (bar/donut snapshot) +
   optional trend of occupancy end-points.
4. **Camiones procesados** — bar, trucks egressed per day.
5. **Mercadería procesada** — bar/area, total quantity moved per day.

Chart contract:
- Series come from the dashboard views (aggregated rows only); the
  client never requests or receives raw movement history for charts.
- Sparse series render empty chart + "sin datos en este período" empty
  state; zero-day rows are rendered as 0 (not gaps) when the server
  returns explicit zeros.
- Window selector (7/15/30/90 días) re-fetches the aggregated window;
  the page never accumulates or buckets history locally.
- Loading: skeleton cards; error: per-chart retry, never a full-page
  "no data" that hides healthy charts.

## Refresh

- KPI cards share the operational map's change-signal mechanism
  (Realtime/poll, Fase 11): events update affected cards in place — no
  full-app redraw.
- Chart series refresh on a throttle (default 60s) or explicit refresh
  button; a visible "última actualización" timestamp; manual refresh
  also re-pulls series.
- Never block the UI on refresh; concurrent updates merge by series key.

## Empty & error states

- Empty org (no trucks/lots/operations): all cards show 0, charts show
  empty-state text; no invented sample series.
- Permission-missing card: hidden (not "0"), respecting module read
  codes.
- Dashboard data unavailable (backend down): explicit error state with
  retry; no stale-fake-fallback (no hardcoded numbers, ever).

## Accessibility

- Cards/charts are keyboard-reachable; charts have textual equivalents
  (data table toggle); colors never carry meaning alone (Fase 11
  convention); window selector is a labeled control.