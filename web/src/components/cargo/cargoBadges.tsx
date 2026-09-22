import { cn } from "cn"
import type { CargoItemStatus, CargoManifestStatus, ItemLotStatus } from "@/types"

import {
  ITEM_STATUS_CLASS,
  ITEM_STATUS_LABELS,
  LOT_STATUS_CLASS,
  LOT_STATUS_LABELS,
  MANIFEST_STATUS_CLASS,
  MANIFEST_STATUS_LABELS,
} from "@/components/cargo/manifestStatus"

/**
 * Plain-status badges for the cargo module. Same contract as
 * TruckStatusBadge: custom span on purpose — Badge variants carry
 * competing bg/text/border utilities, and the semantic class is the sole
 * color source (border-transparent included), merged via `cn`.
 */

function BadgeBase({
  className,
  label,
  title,
}: {
  className: string
  label: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
    >
      {label}
    </span>
  )
}

export function ManifestStatusBadge({
  status,
  className,
}: {
  status: CargoManifestStatus
  className?: string
}) {
  return (
    <BadgeBase
      className={cn(MANIFEST_STATUS_CLASS[status], className)}
      label={MANIFEST_STATUS_LABELS[status]}
      title={`Estado rollup: ${MANIFEST_STATUS_LABELS[status]}`}
    />
  )
}

export function ItemStatusBadge({
  status,
  className,
}: {
  status: CargoItemStatus
  className?: string
}) {
  return (
    <BadgeBase
      className={cn(ITEM_STATUS_CLASS[status], className)}
      label={ITEM_STATUS_LABELS[status]}
      title={`Estado: ${ITEM_STATUS_LABELS[status]}`}
    />
  )
}

export function LotStatusBadge({
  status,
  className,
  title,
}: {
  status: ItemLotStatus
  className?: string
  title?: string
}) {
  return (
    <BadgeBase
      className={cn(LOT_STATUS_CLASS[status], className)}
      label={LOT_STATUS_LABELS[status]}
      title={title ?? `Lote: ${LOT_STATUS_LABELS[status]}`}
    />
  )
}