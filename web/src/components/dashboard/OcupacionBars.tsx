/**
 * Occupancy snapshot bars (Fase 12) — the "Ocupación por sector" chart card.
 *
 * Renders dashboard_occupancy_snapshot rows as horizontal pct bars, sorted
 * descending. For each location the bar uses the dimension with the highest
 * pct (kg / m³ / units — labelled per row), so the bar always reads as
 * "how full is this place" (QA DB-38: numbers mirror location_occupancy).
 * Near-full rows turn warning/danger to match the map's occupancy states.
 */

import { cn } from "cn"

export interface OcupacionBarRow {
  code: string
  pct: number
  /** Human unit of the dimension used (kg / m³ / unidades). */
  unidad: string
  /** Occupied amount in that dimension. */
  ocupado: number
}

const DANGER = 90
const WARNING = 70

function colorDePct(pct: number): string {
  if (pct >= DANGER) return "bg-danger"
  if (pct >= WARNING) return "bg-warning"
  return "bg-info"
}

interface OcupacionBarsProps {
  rows: OcupacionBarRow[]
  formatter: (n: number) => string
  ariaLabel: string
}

export function OcupacionBars({ rows, formatter, ariaLabel }: OcupacionBarsProps) {
  return (
    <div role="table" aria-label={ariaLabel} className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <div key={row.code} className="grid grid-cols-[72px_1fr_64px] items-center gap-2">
          <span className="truncate text-xs font-medium text-foreground">{row.code}</span>
          <div
            role="img"
            aria-label={`${row.code} ${formatter(row.pct)}% ${row.unidad}`}
            className="h-2.5 overflow-hidden rounded-full bg-muted/70"
          >
            <div
              className={cn("h-full rounded-full", colorDePct(row.pct))}
              style={{ width: `${Math.max(row.pct, 0)}%` }}
            />
          </div>
          <span className="text-right text-xs tabular-nums text-muted-foreground">
            {formatter(row.pct)}%
          </span>
        </div>
      ))}
    </div>
  )
}