import { fallosDe } from "@/lib/movement-guards"
import type { GuardResult } from "@/lib/movement-guards"

/**
 * Aggregate guard-failure list (movement-engine.md §Command contract): the
 * engine NEVER first-fails — every broken guard of the verdict renders
 * inline (I2..I7 messages). Same rendering as RegistrarMovimientoDialog.
 */
export function FallosEngine({ fallos }: { fallos: GuardResult[] }) {
  const bloqueantes = fallosDe(fallos)
  if (bloqueantes.length === 0) return null
  return (
    <ul className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
      {bloqueantes.map((f) => (
        <li key={`${f.guard}-${f.code}`} className="flex gap-2 text-sm">
          <span className="shrink-0 rounded bg-destructive/10 px-1.5 font-mono text-xs font-medium text-destructive">
            {f.guard} {f.code}
          </span>
          <span className="text-muted-foreground">{f.message}</span>
        </li>
      ))}
    </ul>
  )
}