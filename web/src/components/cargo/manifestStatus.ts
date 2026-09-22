import type { CargoItemStatus, CargoManifestStatus, ItemLotStatus } from "@/types"

/**
 * Display maps for the cargo module (cargo-module.md; flows.md rollup).
 * Status values are NEVER edited here: manifest/item status is a rollup of
 * lot states, owned by the movement engine; the UI only renders it.
 */

export const MANIFEST_STATUS_LABELS: Record<CargoManifestStatus, string> = {
  received: "Recibido",
  in_playon: "En playa",
  in_control: "En control",
  discharging: "En descarga",
  discharged: "Descargado",
  distributed: "Distribuido",
  closed: "Cerrado",
}

/** Semantic + border color per rollup status (colors.md §Semantic). */
export const MANIFEST_STATUS_CLASS: Record<CargoManifestStatus, string> = {
  received: "border-transparent bg-muted text-muted-foreground",
  in_playon: "border-transparent bg-info/10 text-info",
  in_control: "border-transparent bg-info/10 text-info",
  discharging: "border-transparent bg-warning/10 text-warning",
  discharged: "border-transparent bg-success/10 text-success",
  distributed: "border-transparent bg-success/10 text-success",
  closed: "border-transparent bg-secondary text-secondary-foreground",
}

export const ITEM_STATUS_LABELS: Record<CargoItemStatus, string> = {
  pending: "Pendiente",
  on_truck: "En camión",
  discharged: "Descargado",
  distributed: "Distribuido",
  closed: "Cerrado",
}

export const ITEM_STATUS_CLASS: Record<CargoItemStatus, string> = {
  pending: "border-transparent bg-muted text-muted-foreground",
  on_truck: "border-transparent bg-info/10 text-info",
  discharged: "border-transparent bg-warning/10 text-warning",
  distributed: "border-transparent bg-success/10 text-success",
  closed: "border-transparent bg-secondary text-secondary-foreground",
}

export const LOT_STATUS_LABELS: Record<ItemLotStatus, string> = {
  on_truck: "En camión",
  discharged: "En playón",
  checked: "Verificado",
  in_warehouse: "En depósito",
  in_quarantine: "En rezago",
  seized: "Secuestrado",
  released: "Liberado",
  loaded_out: "En camión (salida)",
}

export const LOT_STATUS_CLASS: Record<ItemLotStatus, string> = {
  on_truck: "border-transparent bg-info/10 text-info",
  discharged: "border-transparent bg-warning/10 text-warning",
  checked: "border-transparent bg-success/10 text-success",
  in_warehouse: "border-transparent bg-success/10 text-success",
  in_quarantine: "border-transparent bg-warning/10 text-warning",
  seized: "border-transparent bg-danger/10 text-danger",
  released: "border-transparent bg-secondary text-secondary-foreground",
  loaded_out: "border-transparent bg-secondary text-secondary-foreground",
}

const FECHA_DIA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
})

/**
 * Format a DATE column (YYYY-MM-DD) without timezone drift. `formatFecha`
 * (truckStatus) treats inputs as instants — a bare date would render the
 * previous day in UTC-x. Date columns must use this formatter.
 */
export function formatFechaDia(iso: string | null | undefined): string {
  if (!iso) return "—"
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return FECHA_DIA.format(new Date(`${iso}T00:00:00Z`))
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return FECHA_DIA.format(d)
}

const M3_FORMAT = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 })

export function formatM3(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "—"
  return `${M3_FORMAT.format(valor)} m³`
}