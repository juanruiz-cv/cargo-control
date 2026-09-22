/**
 * KPI card registry (Fase 12, ADR 0013) — pure data + permission gate.
 *
 * The dashboard card grid is declarative: 10 cards grouped in 3 clusters
 * (operational-dashboard.md §KPI grid). Each card carries the module read
 * code that gates it; the page renders a card only when the session has
 * BOTH the dashboard base read (warehouse.read) AND the card's code. A
 * non-readable card is HIDDEN — no partial aggregate leaks through a
 * "summary" that mixes modules.
 *
 * Pure on purpose (no React/lucide here): the verification script imports
 * kpisVisibles directly, and the page maps ids → icons.
 */

import type {
  DashboardMetricsRow,
  PermissionCode,
} from "@/types"

/** The 10 KPI card identifiers (fixed order = grid order within cluster). */
export type KpiCardId =
  | "trucks_in_yard"
  | "trucks_waiting"
  | "trucks_discharging"
  | "merchandise_stored"
  | "merchandise_in_scanner"
  | "merchandise_in_scale"
  | "merchandise_in_quarantine"
  | "merchandise_seized"
  | "sectors_occupied"
  | "sectors_free"

export type KpiCluster = "Camiones" | "Mercadería" | "Sectores"

const entero = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 })

export interface KpiCardDef {
  id: KpiCardId
  cluster: KpiCluster
  /** Short label under the value (operational-dashboard.md §KPI grid). */
  label: string
  /** Module read code that gates the card (base warehouse.read is applied additionally). */
  permission: PermissionCode
  /** Primary value; optional secondary detail line under the value. */
  format(m: DashboardMetricsRow): { valor: string; detalle?: string }
}

export const KPI_CARDS: readonly KpiCardDef[] = [
  // --- Camiones (read: truck.read) ---
  {
    id: "trucks_in_yard",
    cluster: "Camiones",
    label: "Camiones en playa",
    permission: "truck.read",
    format: (m) => ({ valor: entero.format(m.trucks_in_yard) }),
  },
  {
    id: "trucks_waiting",
    cluster: "Camiones",
    label: "Camiones en espera",
    permission: "truck.read",
    format: (m) => ({ valor: entero.format(m.trucks_waiting) }),
  },
  {
    id: "trucks_discharging",
    cluster: "Camiones",
    label: "Camiones en descarga",
    permission: "truck.read",
    format: (m) => ({ valor: entero.format(m.trucks_discharging) }),
  },
  // --- Mercadería (read: per-module) ---
  {
    id: "merchandise_stored",
    cluster: "Mercadería",
    label: "Mercadería almacenada",
    permission: "cargo.read",
    format: (m) => ({
      valor: entero.format(m.merchandise_stored),
      detalle: `${decimal.format(m.merchandise_stored_weight_kg)} kg`,
    }),
  },
  {
    id: "merchandise_in_scanner",
    cluster: "Mercadería",
    label: "En escáner",
    permission: "scanner.read",
    format: (m) => ({ valor: entero.format(m.merchandise_in_scanner), detalle: "unidades" }),
  },
  {
    id: "merchandise_in_scale",
    cluster: "Mercadería",
    label: "En balanza",
    permission: "scale.read",
    format: (m) => ({ valor: entero.format(m.merchandise_in_scale), detalle: "unidades" }),
  },
  {
    id: "merchandise_in_quarantine",
    cluster: "Mercadería",
    label: "En rezago",
    permission: "quarantine.read",
    format: (m) => ({ valor: entero.format(m.merchandise_in_quarantine), detalle: "unidades" }),
  },
  {
    id: "merchandise_seized",
    cluster: "Mercadería",
    label: "Secuestrada",
    permission: "seizure.read",
    format: (m) => ({ valor: entero.format(m.merchandise_seized), detalle: "unidades" }),
  },
  // --- Sectores (read: warehouse.read = same as the base read) ---
  {
    id: "sectors_occupied",
    cluster: "Sectores",
    label: "Sectores ocupados",
    permission: "warehouse.read",
    format: (m) => ({
      valor: entero.format(m.sectors_occupied),
      detalle: `de ${entero.format(m.sectors_occupied + m.sectors_free)}`,
    }),
  },
  {
    id: "sectors_free",
    cluster: "Sectores",
    label: "Sectores libres",
    permission: "warehouse.read",
    format: (m) => ({
      valor: entero.format(m.sectors_free),
      detalle: `de ${entero.format(m.sectors_occupied + m.sectors_free)}`,
    }),
  },
]

/**
 * Cards the session can read: dashboard base read + the card's module code.
 * Pure predicate form so the page (hasPermission) and the verification
 * script (explicit sets) share one implementation.
 */
export function kpisVisibles(
  has: (code: PermissionCode) => boolean,
): KpiCardDef[] {
  return KPI_CARDS.filter((c) => has("warehouse.read") && has(c.permission))
}