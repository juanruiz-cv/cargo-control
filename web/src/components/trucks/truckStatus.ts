import type { TruckSignals } from "@/services/truckService"
import type { MovementKind, TruckRow } from "@/types"

/**
 * Derived display status for the truck badge (ADR 0008 §2, states.md
 * §truck_status display map). These 13 display codes + 4 pass-throughs
 * are NEVER stored — `trucks.status` stays one of the 5 fleet codes.
 */
export type TruckDisplayStatus =
  | "retained"
  | "seized"
  | "in_scanner"
  | "in_scale"
  | "partially_unloaded"
  | "unloaded"
  | "in_process"
  | "ready_to_exit"
  | "waiting"
  | "expected"
  | "arrived"
  | "in_playon"
  | "exited"
  | "in_route"
  | "out_of_service"
  | "inspection"
  | "available"

export const TRUCK_BASE_STATUS_LABELS: Record<TruckRow["status"], string> = {
  available: "Disponible",
  in_playon: "En playa",
  in_route: "En ruta",
  out_of_service: "Fuera de servicio",
  inspection: "Inspección",
}

export const TRUCK_DISPLAY_STATUS_LABELS: Record<TruckDisplayStatus, string> = {
  retained: "Retenido (rezago)",
  seized: "Secuestrado",
  in_scanner: "En scanner",
  in_scale: "En balanza",
  partially_unloaded: "Descarga parcial",
  unloaded: "Descargado",
  in_process: "En proceso",
  ready_to_exit: "Listo para salir",
  waiting: "En espera",
  expected: "Esperado",
  arrived: "Arribado",
  in_playon: "En playa",
  exited: "Egresado",
  in_route: "En ruta",
  out_of_service: "Fuera de servicio",
  inspection: "Inspección",
  available: "Disponible",
}

/**
 * Semantic + border color per display status (colors.md §Semantic).
 * Kept as plain class strings — merged with `cn` so the last conflicting
 * class wins deterministically (shadcn `cn` is a tailwind-merge drop-in).
 */
export const TRUCK_DISPLAY_STATUS_CLASS: Record<TruckDisplayStatus, string> = {
  retained: "border-transparent bg-warning/15 text-warning",
  seized: "border-transparent bg-danger/15 text-danger",
  in_scanner: "border-transparent bg-info/10 text-info",
  in_scale: "border-transparent bg-info/10 text-info",
  partially_unloaded: "border-transparent bg-warning/10 text-warning",
  unloaded: "border-transparent bg-warning/10 text-warning",
  in_process: "border-transparent bg-info/10 text-info",
  ready_to_exit: "border-transparent bg-success/10 text-success",
  waiting: "border-transparent bg-muted text-muted-foreground",
  expected: "border-transparent bg-muted text-muted-foreground",
  arrived: "border-transparent bg-info/10 text-info",
  in_playon: "border-transparent bg-secondary text-secondary-foreground",
  exited: "border-transparent bg-secondary text-secondary-foreground",
  in_route: "border-transparent bg-muted text-muted-foreground",
  out_of_service: "border-transparent bg-muted text-muted-foreground",
  inspection: "border-transparent bg-muted text-muted-foreground",
  available: "border-transparent bg-success/10 text-success",
}

/** movements.kind — the 15 operation labels (movement-engine.md §Type map). */
export const MOVEMENT_KIND_LABELS: Record<MovementKind, string> = {
  arrival: "Ingreso",
  discharge: "Descarga",
  split: "División",
  transfer: "Transferencia",
  scan_in: "Escaneo entrada",
  scan_out: "Escaneo salida",
  scale: "Pesaje",
  store: "Almacenamiento",
  load_out: "Salida de carga",
  quarantine: "Rezago",
  seizure: "Secuestro",
  release: "Liberación",
  egress: "Egreso",
  correction: "Corrección",
  return_to_truck: "Retorno a camión",
}

/** Work kinds that render as IN_PROCESS while their manifest stays open (states.md #7). */
export const MOVIMIENTOS_DE_TRABAJO: ReadonlySet<MovementKind> = new Set(["discharge", "split", "transfer", "store"])

/**
 * Badge derivation — first match wins (states.md §truck_status display map
 * + truck-module-tests.md §B). Order matters; T-14 forces IN_PLAYON ahead
 * of the generic ARRIVED, and T-16 forces "discharge (open), no on-truck
 * lots" → IN_PROCESS (UNLOADED requires closed manifests: discharge
 * complete). Open holds beat open station ops (T-20).
 */
export function derivarEstadoCamion(
  truck: Pick<TruckRow, "status">,
  señales: TruckSignals,
): TruckDisplayStatus {
  if (señales.openQuarantine) return "retained"
  if (señales.openSeizure) return "seized"
  if (señales.openScanner) return "in_scanner"
  if (señales.openScale) return "in_scale"
  if (señales.hasDischargeOrSplit && señales.onTruckLots > 0) return "partially_unloaded"
  if (
    señales.latestMovementKind !== null &&
    MOVIMIENTOS_DE_TRABAJO.has(señales.latestMovementKind) &&
    señales.openManifests.length > 0
  ) {
    return "in_process"
  }
  if (señales.hasDischargeOrSplit && señales.onTruckLots === 0 && señales.openManifests.length === 0) {
    return "unloaded"
  }
  if (señales.latestMovementKind === "egress") return "exited"
  if (truck.status === "in_playon") return "in_playon"
  if (truck.status === "available") {
    if (señales.latestMovementKind === "arrival") return "waiting"
    if (
      señales.arrivalCount > 0 &&
      señales.egressCount === 0 &&
      señales.onTruckLots === 0 &&
      señales.openManifests.length === 0
    ) {
      return "ready_to_exit"
    }
    if (señales.manifestCount > 0 && señales.arrivalCount === 0) return "expected"
    return "available"
  }
  if (señales.latestMovementKind === "arrival") return "arrived"
  if (truck.status === "in_route") return "in_route"
  if (truck.status === "out_of_service") return "out_of_service"
  if (truck.status === "inspection") return "inspection"
  return "available"
}

const FECHA_FORMAT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function formatFecha(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return FECHA_FORMAT.format(d)
}

const KG_FORMAT = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })

export function formatKg(valor: number | null): string {
  if (valor === null || valor === undefined) return "—"
  return `${KG_FORMAT.format(valor)} kg`
}