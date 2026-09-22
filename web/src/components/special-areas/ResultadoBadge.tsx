import { cn } from "cn"
import type { QuarantineStatus, ScannerResult, SeizureStatus } from "@/types"

import {
  dentroToleranciaClass,
  dentroToleranciaLabel,
  HOLD_STATUS_CLASS,
  HOLD_STATUS_LABELS,
  HOLD_TYPE_LABELS,
  SCAN_RESULT_CLASS,
  SCAN_RESULT_LABELS,
} from "@/components/special-areas/specialAreaStatus"

/**
 * Semantic badges for the special-areas module. Same contract as
 * cargoBadges: custom span — Badge variants carry competing bg/text/border
 * utilities, and the semantic class is the sole color source.
 */
function BadgeBase({ className, label, title }: { className: string; label: string; title?: string }) {
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

export function ScanResultBadge({ result }: { result: ScannerResult }) {
  return (
    <BadgeBase
      className={cn(SCAN_RESULT_CLASS[result])}
      label={SCAN_RESULT_LABELS[result]}
      title={`Resultado de escaneo: ${SCAN_RESULT_LABELS[result]}`}
    />
  )
}

export function ToleranceBadge({ dentro }: { dentro: boolean }) {
  const label = dentroToleranciaLabel(dentro)
  return (
    <BadgeBase
      className={cn(dentroToleranciaClass(dentro))}
      label={label}
      title={label}
    />
  )
}

export function HoldStatusBadge({ status }: { status: QuarantineStatus | SeizureStatus }) {
  return (
    <BadgeBase
      className={cn(HOLD_STATUS_CLASS[status])}
      label={HOLD_STATUS_LABELS[status]}
      title={`Caso: ${HOLD_STATUS_LABELS[status]}`}
    />
  )
}

export function HoldTypeBadge({ tipo }: { tipo: "quarantine" | "seizure" }) {
  return (
    <BadgeBase
      className="border-transparent bg-secondary text-secondary-foreground"
      label={HOLD_TYPE_LABELS[tipo]}
      title={`Tipo de caso: ${HOLD_TYPE_LABELS[tipo]}`}
    />
  )
}