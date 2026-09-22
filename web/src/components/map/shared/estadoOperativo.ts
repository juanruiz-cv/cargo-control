import type { LayoutElementRow, LocationOccupancyRow, LocationRow } from "@/types"

/**
 * Operational state of a floor-plan place (docs/ux/operational-map.md §3,
 * docs/brand/colors.md). Derived read-side, never stored.
 *
 * Priority per docs:
 *   1. maintenance       → MANTENIMIENTO (gris/hatched)
 *   2. open hold/seizure → BLOQUEADO  (púrpura cc-blocked)
 *   3. any pct ≥ 100     → OCUPADO    (rojo)
 *   4. any pct > 0       → PARCIAL    (ámbar)
 *   5. otherwise         → LIBRE      (verde)
 *
 * Null capacity = ∞: that dimension can never push the state to OCUPADO.
 * Non-place elements (corridor, door, annotation) are always LIBRE.
 */
export const ESTADO_OPERATIVO = {
  LIBRE: "libre",
  PARCIAL: "parcial",
  OCUPADO: "ocupado",
  BLOQUEADO: "bloqueado",
  MANTENIMIENTO: "mantenimiento",
} as const

export type EstadoOperativo = (typeof ESTADO_OPERATIVO)[keyof typeof ESTADO_OPERATIVO]

export interface DatosEstadoElemento {
  elemento: LayoutElementRow
  ubicacion: LocationRow | null
  ocupacion: LocationOccupancyRow | null
}

/** Colors from the brand palette (config/tokens.ts): no invented hues. */
export const ESTADO_META: Record<EstadoOperativo, { labelEs: string; color: string; descripcion: string }> = {
  [ESTADO_OPERATIVO.LIBRE]: {
    labelEs: "Libre",
    color: "#16A34A",
    descripcion: "Sin stock y sin mantenimiento",
  },
  [ESTADO_OPERATIVO.PARCIAL]: {
    labelEs: "Parcial",
    color: "#F59E0B",
    descripcion: "Stock entre 0% y 100% de alguna capacidad",
  },
  [ESTADO_OPERATIVO.OCUPADO]: {
    labelEs: "Ocupado",
    color: "#DC2626",
    descripcion: "Alguna capacidad ≥ 100%",
  },
  [ESTADO_OPERATIVO.BLOQUEADO]: {
    labelEs: "Bloqueado",
    color: "#7C3AED",
    descripcion: "Rezago o secuestro abierto en la ubicación",
  },
  [ESTADO_OPERATIVO.MANTENIMIENTO]: {
    labelEs: "Mantenimiento",
    color: "#64748B",
    descripcion: "Ubicación en mantenimiento (location.maintenance)",
  },
}

export const ESTADOS_ORDEN: EstadoOperativo[] = [
  ESTADO_OPERATIVO.LIBRE,
  ESTADO_OPERATIVO.PARCIAL,
  ESTADO_OPERATIVO.OCUPADO,
  ESTADO_OPERATIVO.BLOQUEADO,
  ESTADO_OPERATIVO.MANTENIMIENTO,
]

const EMPTY_LOCATIONS: ReadonlySet<string> = new Set()

export function derivarEstadoOperativo(
  datos: DatosEstadoElemento,
  ubicacionesConHoldAbierto: ReadonlySet<string> = EMPTY_LOCATIONS,
): EstadoOperativo {
  const { elemento, ubicacion, ocupacion } = datos
  if (!elemento.location_id || !ubicacion) return ESTADO_OPERATIVO.LIBRE
  if (ubicacion.maintenance) return ESTADO_OPERATIVO.MANTENIMIENTO
  if (ubicacionesConHoldAbierto.has(ubicacion.id)) return ESTADO_OPERATIVO.BLOQUEADO

  const pcts = [ocupacion?.pct_units, ocupacion?.pct_kg, ocupacion?.pct_m3]
  if (pcts.some((p) => p != null && p >= 100)) return ESTADO_OPERATIVO.OCUPADO
  if (pcts.some((p) => p != null && p > 0)) return ESTADO_OPERATIVO.PARCIAL
  return ESTADO_OPERATIVO.LIBRE
}

export function capacidadReadable(o: LocationOccupancyRow | null): string {
  if (!o) return "—"
  const parts: string[] = []
  if (o.pct_units != null) parts.push(`${o.pct_units}% unidades`)
  if (o.pct_kg != null) parts.push(`${o.pct_kg}% kg`)
  if (o.pct_m3 != null) parts.push(`${o.pct_m3}% m³`)
  if (parts.length === 0) return "∞ capacidad"
  return parts.join(" · ")
}