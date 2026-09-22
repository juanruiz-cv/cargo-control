/**
 * Lightweight SVG bar charts (Fase 12).
 *
 * Own dependency-free kit (no recharts — the dashboard only renders
 * server-aggregated rows, so a full charting lib is churn). Professional-ux
 * constraints: each chart is a labelled widget (role="img" + aria-label +
 * <title> tooltips + a data-table <details> toggle for the textual
 * equivalent). Zero values render as 0-height columns with a visible x
 * label — never "gaps" (QA DB-60).
 */

export interface BarPoint {
  label: string
  value: number
}

export interface BarPart {
  label: string
  value: number
}

const W = 640
const H = 200
const PL = 42
const PR = 8
const PT = 12
const PB = 26

interface BarsChartProps {
  points: BarPoint[]
  /** Renders a value (e.g. "3", "1.200"). */
  formatter: (n: number) => string
  /** Screen-reader label for the whole widget. */
  ariaLabel: string
  /** Per-bar tooltip. */
  barLabel: (p: BarPoint) => string
}

function yTicks(max: number): number[] {
  return [0, 25, 50, 75, 100].map((pct) => (max * pct) / 100)
}

export function BarsChart({ points, formatter, ariaLabel, barLabel }: BarsChartProps) {
  const max = Math.max(...points.map((p) => p.value), 1)
  const n = points.length
  const chartW = W - PL - PR
  const plotH = H - PT - PB
  const step = chartW / Math.max(n, 1)
  const bw = Math.max(4, Math.min(step * 0.66, 44))
  const labelStep = Math.max(1, Math.ceil(n / 12))

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
    >
      {/* grid + y labels */}
      {yTicks(max).map((tick, i) => (
        <g key={i}>
          <line
            x1={PL}
            x2={W - PR}
            y1={PT + plotH - (tick / max) * plotH}
            y2={PT + plotH - (tick / max) * plotH}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={PL - 5}
            y={PT + plotH - (tick / max) * plotH + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[9px]"
          >
            {formatter(Math.round(tick))}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const h = (p.value / max) * plotH
        const x = PL + i * step + (step - bw) / 2
        const y = PT + plotH - h
        const showLabel = n <= 12 && p.value > 0
        const showXLabel = i % labelStep === 0 || i === n - 1
        return (
          <g key={i}>
            <title>{barLabel(p)}</title>
            <rect
              x={x}
              y={y}
              width={bw}
              height={Math.max(h, p.value > 0 ? 1.5 : 0)}
              rx={2}
              className="fill-info"
            />
            {showLabel ? (
              <text
                x={x + bw / 2}
                y={y - 4}
                textAnchor="middle"
                className="fill-foreground text-[9px] font-medium"
              >
                {formatter(p.value)}
              </text>
            ) : null}
            {showXLabel ? (
              <text
                x={x + bw / 2}
                y={H - 9}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

interface StackedBarsChartProps {
  points: { label: string; parts: BarPart[] }[]
  formatter: (n: number) => string
  ariaLabel: string
  /** Tailwind fill classes per part index (cycled). */
  palette: readonly string[]
  barLabel: (label: string, partLabel: string, value: number) => string
}

export function StackedBarsChart({
  points,
  formatter,
  ariaLabel,
  palette,
  barLabel,
}: StackedBarsChartProps) {
  const max = Math.max(
    ...points.map((p) => p.parts.reduce((acc, part) => acc + part.value, 0)),
    1,
  )
  const n = points.length
  const chartW = W - PL - PR
  const plotH = H - PT - PB
  const step = chartW / Math.max(n, 1)
  const bw = Math.max(4, Math.min(step * 0.66, 44))
  const labelStep = Math.max(1, Math.ceil(n / 12))

  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
    >
      {yTicks(max).map((tick, i) => (
        <g key={i}>
          <line
            x1={PL}
            x2={W - PR}
            y1={PT + plotH - (tick / max) * plotH}
            y2={PT + plotH - (tick / max) * plotH}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          <text
            x={PL - 5}
            y={PT + plotH - (tick / max) * plotH + 3}
            textAnchor="end"
            className="fill-muted-foreground text-[9px]"
          >
            {formatter(Math.round(tick))}
          </text>
        </g>
      ))}
      {points.map((p, i) => {
        const total = p.parts.reduce((acc, part) => acc + part.value, 0)
        const x = PL + i * step + (step - bw) / 2
        const showXLabel = i % labelStep === 0 || i === n - 1
        let y = PT + plotH
        return (
          <g key={i}>
            {p.parts.map((part, j) => {
              if (part.value <= 0) return null
              const h = (part.value / max) * plotH
              y -= h
              const rect = (
                <rect
                  key={j}
                  x={x}
                  y={y}
                  width={bw}
                  height={Math.max(h, 1.5)}
                  className={palette[j % palette.length]}
                >
                  <title>{barLabel(p.label, part.label, part.value)}</title>
                </rect>
              )
              return rect
            })}
            {total <= 0 ? (
              <rect x={x} y={PT + plotH} width={bw} height={1.5} className="fill-border">
                <title>{barLabel(p.label, "sin movimientos", 0)}</title>
              </rect>
            ) : null}
            {showXLabel ? (
              <text
                x={x + bw / 2}
                y={H - 9}
                textAnchor="middle"
                className="fill-muted-foreground text-[9px]"
              >
                {p.label}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}