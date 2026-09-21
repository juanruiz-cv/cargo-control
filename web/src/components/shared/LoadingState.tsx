import { Skeleton } from "@/components/ui/skeleton"

interface LoadingStateProps {
  /** Number of skeleton rows to render (table cold-render pattern). */
  rows?: number
  label?: string
}

/**
 * Skeleton loading state — replaces spinners for cold render paths
 * (professional-ux.md §2). Renders skeleton rows matching the visible
 * count for tables, or a generic block for detail panels.
 */
export function LoadingState({ rows = 4, label }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-label={label ?? "Cargando"}
      className="flex flex-col gap-3"
    >
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-8 w-full" />
      ))}
      <span className="sr-only">{label ?? "Cargando contenido"}</span>
    </div>
  )
}