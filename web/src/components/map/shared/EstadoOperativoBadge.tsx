import { cn } from "cn"
import { ESTADO_META, type EstadoOperativo } from "@/components/map/shared/estadoOperativo"

interface EstadoOperativoBadgeProps {
  estado: EstadoOperativo
  className?: string
}

/** Small status dot + label, colored with the brand palette state hue. */
export function EstadoOperativoBadge({ estado, className }: EstadoOperativoBadgeProps) {
  const meta = ESTADO_META[estado]
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl border border-transparent bg-muted/70 px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        className,
      )}
      style={{ color: meta.color }}
    >
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ backgroundColor: meta.color }}
      />
      {meta.labelEs}
    </span>
  )
}