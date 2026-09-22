import { cn } from "cn"
import type { TruckSignals } from "@/services/truckService"
import type { TruckRow } from "@/types"

import {
  TRUCK_DISPLAY_STATUS_CLASS,
  TRUCK_DISPLAY_STATUS_LABELS,
  derivarEstadoCamion,
  type TruckDisplayStatus,
} from "@/components/trucks/truckStatus"

/**
 * Truck status badge — DERIVED display status (ADR 0008), never the stored
 * base `trucks.status` alone. Custom span on purpose: Badge variants carry
 * competing bg/text/border utilities; here the semantic class is the sole
 * color source (border-transparent included), merged via tw-merge-safe `cn`.
 */
export function TruckStatusBadge({
  base,
  señales,
  className,
  title,
}: {
  base: TruckRow["status"]
  señales: TruckSignals
  className?: string
  /** Extra tooltip context, e.g. the base status when they differ. */
  title?: string
}) {
  const display: TruckDisplayStatus = derivarEstadoCamion({ status: base }, señales)
  return (
    <span
      title={
        title ??
        (display !== base ? `${TRUCK_DISPLAY_STATUS_LABELS[display]} (base: ${base})` : undefined)
      }
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TRUCK_DISPLAY_STATUS_CLASS[display],
        className,
      )}
    >
      {TRUCK_DISPLAY_STATUS_LABELS[display]}
    </span>
  )
}