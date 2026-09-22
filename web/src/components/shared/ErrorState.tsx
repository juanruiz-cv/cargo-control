import type { ReactNode } from "react"
import { CircleAlertIcon } from "lucide-react"

interface ErrorStateProps {
  title?: string
  description?: string
  /** Retry action; errors are always recoverable in the shell. */
  action?: ReactNode
}

/**
 * Error state block with icon + text (never color alone,
 * professional-ux.md §7). Used for global failures not tied to a field.
 */
export function ErrorState({
  title = "No se pudo completar la operación",
  description = "Revisá la conexión e intentá de nuevo. Si el problema persiste, contactá al administrador del sistema.",
  action,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <CircleAlertIcon className="size-6" />
      </div>
      <h3 className="text-md font-medium text-foreground">{title}</h3>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}