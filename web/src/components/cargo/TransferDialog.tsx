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
import { Label } from "@/components/ui/label"
import { LocationSelect } from "@/components/cargo/LocationSelect"
import { LotStatusBadge } from "@/components/cargo/cargoBadges"
import { formatKg } from "@/components/trucks/truckStatus"

interface TransferDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Source lot — quantity unchanged; only the placement moves (cargo-module.md §Transfer). */
  lote: ItemLotRow
  onTransferido: () => void
}

/**
 * Transfer dialog (cargo-module.md §TransferDialog; cargo.transfer). Moves
 * an existing lot to another active location without quantity change —
 * placement changes ONLY via split/transfer movements. Frozen lots
 * (rezago/secuestro) cannot move: the source is blocked here and the
 * service re-validates server-side.
 */
export function TransferDialog({
  abierto,
  onAbiertoChange,
  lote,
  onTransferido,
}: TransferDialogProps) {
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
  }, [abierto, lote])

  const congelado = lote.status === "in_quarantine" || lote.status === "seized"

  const transferir = async () => {
    if (!destino) {
      setErrorDestino("Elegí la ubicación de destino.")
      return
    }
    setGuardando(true)
    try {
      await getServices().cargo.transferItem({
        itemLotId: lote.id,
        destinoLocationId: destino,
        notas: motivo.trim() || null,
        operatorId: user?.id ?? null,
      })
      toast.success(`Lote ${lote.id} transferido a la ubicación de destino.`)
      onAbiertoChange(false)
      onTransferido()
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause)
      if (/destino|destino/i.test(mensaje) && /no existe|inactivo/i.test(mensaje)) {
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
          <DialogTitle>Transferir lote</DialogTitle>
          <DialogDescription>
            Cambia el lugar físico del lote sin modificar la cantidad. Queda
            registrado como movimiento (trazable, append-only).
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
            <Label htmlFor="transfer-destino">Ubicación de destino</Label>
            <LocationSelect
              id="transfer-destino"
              value={destino}
              onValueChange={(v) => {
                setDestino(v)
                setErrorDestino(null)
              }}
              disabled={congelado}
            />
            {errorDestino ? (
              <p role="alert" className="mt-1 text-sm text-destructive">{errorDestino}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="transfer-motivo">Motivo (opcional)</Label>
            <textarea
              id="transfer-motivo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Ej: reorganización de depósito"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void transferir()} disabled={guardando || congelado}>
              {guardando ? "Transfiriendo…" : "Transferir lote"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}