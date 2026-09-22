import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { HoldOpenRow } from "@/types"

import { FallosEngine } from "@/components/special-areas/FallosEngine"
import { errorDe } from "@/components/special-areas/caseError"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

interface ResolverCasoDialogProps {
  kind: "quarantine" | "seizure"
  caso: HoldOpenRow | null
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  onResuelto: () => void
}

/**
 * Resolve a hold case (special-areas.md §REZAGO/§SECUESTRO, SBF-10).
 * Supervisor/admin only (rbac.md §3; guard I1 re-validates the role). The
 * submit IS the engine `release` command: lot unfreeze + case status.
 * In Supabase the resolver reports ENGINE_DEPENDENCIA (server-side engine by
 * design, ADR 0011); the DEMO adapter executes the full flow in memory.
 */
export function ResolverCasoDialog({
  kind,
  caso,
  abierto,
  onAbiertoChange,
  onResuelto,
}: ResolverCasoDialogProps) {
  const { user, hasRole } = useAuth()
  const esRezago = kind === "quarantine"
  const puedeResolver = hasRole("admin") || hasRole("supervisor")

  const [nota, setNota] = useState("")
  const [fallos, setFallos] = useState<ReturnType<typeof errorDe>["fallos"]>([])
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setNota("")
    setFallos([])
    setMensajeError(null)
    setGuardando(false)
  }, [abierto, caso])

  const resolver = async () => {
    if (!caso || !nota.trim()) return
    setGuardando(true)
    setFallos([])
    setMensajeError(null)
    try {
      const input = {
        resolutionNote: nota.trim(),
        resolvedBy: user?.id ?? undefined,
        operationKey: getServices().movements.generarOperationKey("release"),
      }
      if (esRezago) {
        await getServices().holds.quarantine.resolver(caso.operation_id, input)
      } else {
        await getServices().holds.seizure.resolver(caso.operation_id, input)
      }
      toast.success(`${esRezago ? "Rezago" : "Secuestro"} ${caso.operation_id} resuelto; el lote queda liberado.`)
      onAbiertoChange(false)
      onResuelto()
    } catch (cause) {
      const detalle = errorDe(cause)
      setFallos(detalle.fallos)
      setMensajeError(detalle.mensaje)
      if (detalle.fallos.length > 0) {
        toast.error(`${detalle.fallos.filter((f) => !f.ok).length} condición(es) del engine bloquean la resolución.`)
      } else {
        toast.error(detalle.mensaje)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolver {esRezago ? "rezago" : "secuestro"} {caso?.operation_id ?? ""}</DialogTitle>
          <DialogDescription>
            Flujo de supervisor (rol admin o supervisor): movimiento `release` + liberación del lote.
            En Supabase la resolución es server-side (ENGINE_DEPENDENCIA); la demo la ejecuta completa.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {caso ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <p><span className="font-medium">Lote:</span> {caso.item_lot_id}</p>
              <p><span className="font-medium">Manifiesto:</span> {caso.manifest_code}</p>
              <p><span className="font-medium">{esRezago ? "Motivo" : "Referencia legal"}:</span> {esRezago ? caso.reason : caso.legal_ref}</p>
              <p><span className="font-medium">Ubicación actual:</span> {caso.current_location_id}</p>
            </div>
          ) : null}
          <div>
            <Label htmlFor="caso-nota">Nota de resolución — obligatoria</Label>
            <textarea
              id="caso-nota"
              value={nota}
              onChange={(e) => {
                setNota(e.target.value)
                setFallos([])
                setMensajeError(null)
              }}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Ej: mercadería verificada, se levanta la retención"
            />
          </div>
          {!puedeResolver ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              Resolver requiere rol admin o supervisor (rbac.md §3).
            </p>
          ) : null}
          {fallos.length > 0 ? <FallosEngine fallos={fallos} /> : mensajeError ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {mensajeError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void resolver()} disabled={guardando || !caso || !nota.trim() || !puedeResolver}>
              {guardando ? "Resolviendo…" : "Resolver caso"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}