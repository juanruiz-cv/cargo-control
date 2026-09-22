import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { StationQueueRow } from "@/types"

import { FallosEngine } from "@/components/special-areas/FallosEngine"
import { HoldLocationSelect } from "@/components/special-areas/HoldLocationSelect"
import { errorDe } from "@/components/special-areas/caseError"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface AbrirCasoDialogProps {
  kind: "quarantine" | "seizure"
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  candidatos: StationQueueRow[]
  onCasoAbierto: () => void
}

/**
 * Open a hold case (special-areas.md §REZAGO/§SECUESTRO, SBF-09/SBF-11).
 * Candidates come from the station queues (pending lots); the destination
 * picker lists ACTIVE allows_hold areas. Submitting IS the engine command
 * (`quarantine`/`seizure` kind): guards I1..I7 run server-side, the lot is
 * frozen/blocked and the append-only op row is created by the engine.
 */
export function AbrirCasoDialog({
  kind,
  abierto,
  onAbiertoChange,
  candidatos,
  onCasoAbierto,
}: AbrirCasoDialogProps) {
  const { user } = useAuth()
  const esRezago = kind === "quarantine"

  const [lotId, setLotId] = useState("")
  const [motivo, setMotivo] = useState("")
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [fallos, setFallos] = useState<ReturnType<typeof errorDe>["fallos"]>([])
  const [mensajeError, setMensajeError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setLotId(candidatos[0]?.item_lot_id ?? "")
    setMotivo("")
    setDestinoId(null)
    setFallos([])
    setMensajeError(null)
    setGuardando(false)
  }, [abierto, kind, candidatos])

  const motivoValido = esRezago ? motivo.trim().length > 0 : motivo.trim().length > 0

  const abrir = async () => {
    if (!lotId || !motivoValido) return
    setGuardando(true)
    setFallos([])
    setMensajeError(null)
    try {
      if (esRezago) {
        await getServices().holds.quarantine.crear({
          itemLotId: lotId,
          reason: motivo.trim(),
          locationId: destinoId ?? undefined,
          operatorId: user?.id ?? null,
          operationKey: getServices().movements.generarOperationKey("quarantine"),
        })
        toast.success(`Rezago abierto sobre ${lotId} (movimiento + caso registrados por el engine).`)
      } else {
        await getServices().holds.seizure.crear({
          itemLotId: lotId,
          legalRef: motivo.trim(),
          locationId: destinoId ?? undefined,
          operatorId: user?.id ?? null,
          operationKey: getServices().movements.generarOperationKey("seizure"),
        })
        toast.success(`Secuestro abierto sobre ${lotId} (movimiento + caso registrados por el engine).`)
      }
      onAbiertoChange(false)
      onCasoAbierto()
    } catch (cause) {
      const detalle = errorDe(cause)
      setFallos(detalle.fallos)
      setMensajeError(detalle.mensaje)
      if (detalle.fallos.length > 0) {
        toast.error(`${detalle.fallos.filter((f) => !f.ok).length} condición(es) del engine bloquean el caso.`)
      } else {
        toast.error(detalle.mensaje)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Abrir {esRezago ? "rezago" : "secuestro"}</DialogTitle>
          <DialogDescription>
            {esRezago
              ? "Congela el lote (in_quarantine): el engine valida guards I1..I7 y registra movimiento + operación en una sola superficie."
              : "Bloquea el lote (seized): el engine valida guards I1..I7 y registra movimiento + operación en una sola superficie."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="caso-lote">Lote (candidatos de las colas de estación)</Label>
            <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
              <SelectTrigger id="caso-lote" className="mt-1 w-full">
                <SelectValue placeholder="Elegí el lote a retener" />
              </SelectTrigger>
              <SelectContent>
                {candidatos.map((c) => (
                  <SelectItem key={c.item_lot_id} value={c.item_lot_id}>
                    {c.item_lot_id} · {c.sku ?? c.item_description} · {c.queue_kind}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="caso-motivo">
              {esRezago ? "Motivo (reason)" : "Referencia legal (legal_ref)"} — obligatorio
            </Label>
            <Input
              id="caso-motivo"
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                setFallos([])
                setMensajeError(null)
              }}
              className="mt-1"
              placeholder={esRezago ? "Ej: mercadería con vencimiento próximo" : "Ej: Expediente N° 1234/26"}
            />
          </div>
          <div>
            <Label htmlFor="caso-destino">Ubicación de retención</Label>
            <HoldLocationSelect
              id="caso-destino"
              value={destinoId}
              onValueChange={(v) => setDestinoId(v)}
              permitirUbicacionActual
            />
          </div>
          {fallos.length > 0 ? <FallosEngine fallos={fallos} /> : mensajeError ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {mensajeError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void abrir()} disabled={guardando || !lotId || !motivoValido}>
              {guardando ? "Validando…" : `Abrir ${esRezago ? "rezago" : "secuestro"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}