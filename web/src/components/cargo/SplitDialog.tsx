import { useEffect, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { ItemLotRow } from "@/types"

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
import { LocationSelect } from "@/components/cargo/LocationSelect"
import { LotStatusBadge } from "@/components/cargo/cargoBadges"
import { formatKg } from "@/components/trucks/truckStatus"

interface SplitDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Source lot — splitting reduces it and creates a child lot (ADR 0003). */
  lote: ItemLotRow
  onDividido: () => void
}

/**
 * Split dialog (cargo-module.md §SplitDialog; cargo.update). Validates
 * 0 < cantidad < source quantity inline — a rejected split NEVER creates a
 * movement. Destination is optional: without it the child lot stays where
 * the source is (truck remnant / same location).
 *
 * Supabase mode: splitItem is server-engine-only (deferred Σ trigger, ADR
 * 0003); the service validates the request and reports the engine
 * dependency, which this dialog surfaces verbatim. The DEMO adapter
 * executes the full split in memory (dev only).
 */
export function SplitDialog({
  abierto,
  onAbiertoChange,
  lote,
  onDividido,
}: SplitDialogProps) {
  const { user } = useAuth()

  const [cantidad, setCantidad] = useState("")
  const [destino, setDestino] = useState<string | null>(lote.current_location_id)
  const [motivo, setMotivo] = useState("")
  const [errorCantidad, setErrorCantidad] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setCantidad("")
      setDestino(lote.current_location_id)
      setMotivo("")
      setErrorCantidad(null)
    }
  }, [abierto, lote])

  const congelado = lote.status === "in_quarantine" || lote.status === "seized"

  const dividir = async () => {
    const parsed = Number(cantidad)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setErrorCantidad("La cantidad del split debe ser mayor a 0.")
      return
    }
    if (parsed >= lote.quantity) {
      setErrorCantidad(
        `La cantidad (${parsed}) debe ser menor al lote actual (${lote.quantity}). El remanente tiene que ser mayor a 0.`,
      )
      return
    }
    setGuardando(true)
    try {
      await getServices().cargo.splitItem({
        itemLotId: lote.id,
        cantidad: parsed,
        destinoLocationId: destino,
        notas: motivo.trim() || null,
        operatorId: user?.id ?? null,
      })
      toast.success(`Lote ${lote.id} dividido: ${parsed} ${lote.uom} separados.`)
      onAbiertoChange(false)
      onDividido()
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause)
      if (/cantidad del split|mayor a 0|menor al lote/i.test(mensaje)) {
        setErrorCantidad(mensaje)
      } else {
        // Engine-dependency errors (supabase) and permission errors surface
        // as toasts — no movement was created.
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
          <DialogTitle>Dividir lote</DialogTitle>
          <DialogDescription>
            Separa una porción del lote en un lote hijo (trazabilidad por
            movimiento). El remanente queda en el lote original.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="min-w-0">
              <span className="text-sm font-medium text-foreground">{lote.id}</span>
              <span className="ml-2 text-sm text-muted-foreground">
                {lote.quantity} {lote.uom}
                {lote.unit_weight_kg != null ? ` · ${formatKg(lote.unit_weight_kg * lote.quantity)}` : ""}
              </span>
            </div>
            <LotStatusBadge status={lote.status} />
          </div>
          <div>
            <Label htmlFor="split-cantidad">Cantidad a dividir</Label>
            <Input
              id="split-cantidad"
              type="number"
              min={1}
              step="any"
              className="mt-1"
              value={cantidad}
              onChange={(event) => {
                setCantidad(event.target.value)
                setErrorCantidad(null)
              }}
              placeholder={`Menor a ${lote.quantity}`}
              aria-invalid={errorCantidad !== null}
              autoFocus
            />
            {errorCantidad ? (
              <p role="alert" className="mt-1 text-sm text-destructive">{errorCantidad}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="split-destino">Destino (opcional)</Label>
            <LocationSelect
              id="split-destino"
              value={destino}
              onValueChange={setDestino}
              permitirSinDestino
              disabled={congelado}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Sin destino: el lote hijo permanece donde está (remanente en camión o en la misma ubicación).
            </p>
          </div>
          <div>
            <Label htmlFor="split-motivo">Motivo (opcional)</Label>
            <textarea
              id="split-motivo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Ej: separar mercadería para scanner"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void dividir()} disabled={guardando || congelado}>
              {guardando ? "Dividiendo…" : "Dividir lote"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}