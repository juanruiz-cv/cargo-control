import type { QuarantineStatus, ScannerResult, SeizureStatus } from "@/types"

/**
 * Display maps for the special-areas module (special-areas.md:
 * SCANNER / BALANZA / REZAGO / SECUESTRO). Same pattern as
 * cargo/manifestStatus.ts: labels in Spanish, semantic color classes from
 * colors.md §Semantic. Operation rows and statuses are append-only engine
 * data — the UI only renders them.
 */

export const SCAN_RESULT_LABELS: Record<ScannerResult, string> = {
  success: "OK",
  not_found: "No encontrado",
  ambiguous: "Ambiguo",
  error: "Error",
}

/** Semantic + border color per scan result. */
export const SCAN_RESULT_CLASS: Record<ScannerResult, string> = {
  success: "border-transparent bg-success/10 text-success",
  not_found: "border-transparent bg-warning/10 text-warning",
  ambiguous: "border-transparent bg-warning/10 text-warning",
  error: "border-transparent bg-danger/10 text-danger",
}

export function dentroToleranciaLabel(dentro: boolean): string {
  return dentro ? "Dentro de tolerancia" : "Fuera de tolerancia"
}

export function dentroToleranciaClass(dentro: boolean): string {
  return dentro
    ? "border-transparent bg-success/10 text-success"
    : "border-transparent bg-destructive/10 text-destructive"
}

export const HOLD_STATUS_LABELS: Record<QuarantineStatus | SeizureStatus, string> = {
  open: "Abierto",
  resolved: "Resuelto",
  released: "Liberado",
}

export const HOLD_STATUS_CLASS: Record<QuarantineStatus | SeizureStatus, string> = {
  open: "border-transparent bg-warning/10 text-warning",
  resolved: "border-transparent bg-success/10 text-success",
  released: "border-transparent bg-secondary text-secondary-foreground",
}

export const HOLD_TYPE_LABELS = {
  quarantine: "Rezago",
  seizure: "Secuestro",
} as const

/** Parse a number input safely; undefined for empty/NaN. */
export function numeroDe(texto: string): number | undefined {
  if (!texto.trim()) return undefined
  const n = Number(texto)
  return Number.isFinite(n) ? n : undefined
}