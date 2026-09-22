import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { CargoManifestRow } from "@/types"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { LocationSelect } from "@/components/cargo/LocationSelect"

interface DischargeDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  manifest: CargoManifestRow
  /** Number of on_truck lots that will move (mirrors the service guard). */
  cantidadLotesOnTruck: number
  onDescargado: () => void
}

/**
 * Discharge dialog — sends ALL on_truck lots of the manifest to a
 * destination location (flows.md: DESCARGA TOTAL O PARCIAL; cargo.update).
 * The movement is only created on confirm; the demo adapter then marks the
 * manifest discharged (rollup approximation).
 */
export function DischargeDialog({
  abierto,
  onAbiertoChange,
  manifest,
  cantidadLotesOnTruck,
  onDescargado,
}: DischargeDialogProps) {
  const { user } = useAuth()

  const [destino, setDestino] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")
  const [errorDestino, setErrorDestino] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setDestino(null)
      setMotivo("")
      setErrorDestino(null)
    }
  }, [abierto, manifest])

  const descargar = async () => {
    if (!destino) {
      setErrorDestino("Elegí la ubicación donde baja la carga.")
      return
    }
    setGuardando(true)
    try {
      await getServices().cargo.descargar({
        manifestId: manifest.id,
        destinoLocationId: destino,
        notas: motivo.trim() || null,
        operatorId: user?.id ?? null,
      })
      toast.success(`Descarga registrada para ${manifest.code}.`)
      onAbiertoChange(false)
      onDescargado()
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause)
      if (/no tiene lotes on_truck/.test(mensaje)) {
        toast.error(mensaje)
      } else if (/no existe|inactivo/i.test(mensaje)) {
        setErrorDestino(mensaje)
      } else {
        toast.error(mensaje)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descargar manifiesto</DialogTitle>
          <DialogDescription>
            Baja toda la carga que sigue en camión a la ubicación elegida
            ({" "}
            {cantidadLotesOnTruck === 1
              ? "1 lote on_truck"
              : `${cantidadLotesOnTruck} lotes on_truck`}
            ). Se registra como movimiento `discharge`.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Manifiesto</span>
            <span className="text-sm font-medium text-foreground">{manifest.code}</span>
          </div>
          <div>
            <Label htmlFor="descarga-destino">Ubicación de descarga</Label>
            <LocationSelect
              id="descarga-destino"
              value={destino}
              onValueChange={(v) => {
                setDestino(v)
                setErrorDestino(null)
              }}
            />
            {errorDestino ? (
              <p role="alert" className="mt-1 text-sm text-destructive">{errorDestino}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="descarga-motivo">Motivo (opcional)</Label>
            <textarea
              id="descarga-motivo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Ej: descarga en playa de control"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void descargar()} disabled={guardando}>
              {guardando ? "Descargando…" : "Confirmar descarga"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}