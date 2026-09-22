import { useEffect, useState } from "react"
import { toast } from "sonner"

import { getServices } from "@/services"
import type { CargoItemInsert } from "@/types"

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
import { UOM_LABELS, UOM_OPTIONS } from "@/components/cargo/ManifestFormDialog"

interface ItemFormDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  manifestId: string
  /** Next line number (already computed by the caller: max + 1). */
  proximoLineNumber: number
  onGuardado: () => void
}

/**
 * Add an item to an existing manifest (cargo-module.md §CargoCreateDialog;
 * item create is gated `cargo.update` — matches the demo adapter + RLS
 * intent, which the SQL-side cargo_items INSERT policy enforces).
 */
export function ItemFormDialog({
  abierto,
  onAbiertoChange,
  manifestId,
  proximoLineNumber,
  onGuardado,
}: ItemFormDialogProps) {
  const [description, setDescription] = useState("")
  const [cantidad, setCantidad] = useState("")
  const [uom, setUom] = useState("unit")
  const [sku, setSku] = useState("")
  const [categoria, setCategoria] = useState("")
  const [pesoUnitario, setPesoUnitario] = useState("")
  const [volumenUnitario, setVolumenUnitario] = useState("")
  const [observaciones, setObservaciones] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setDescription("")
      setCantidad("")
      setUom("unit")
      setSku("")
      setCategoria("")
      setPesoUnitario("")
      setVolumenUnitario("")
      setObservaciones("")
    }
  }, [abierto])

  const guardar = async () => {
    const datos: CargoItemInsert = {
      line_number: proximoLineNumber,
      description: description.trim(),
      total_quantity: Number(cantidad),
      uom,
      sku: sku.trim() || null,
      category: categoria.trim() || null,
      unit_weight_kg: pesoUnitario.trim() === "" ? null : Number(pesoUnitario),
      unit_volume_m3: volumenUnitario.trim() === "" ? null : Number(volumenUnitario),
      observations: observaciones.trim() || null,
    }
    if (!datos.description) {
      toast.error("La descripción es obligatoria.")
      return
    }
    if (!Number.isFinite(datos.total_quantity) || datos.total_quantity <= 0) {
      toast.error("La cantidad debe ser mayor a 0.")
      return
    }
    if (datos.unit_weight_kg != null && (!Number.isFinite(datos.unit_weight_kg) || datos.unit_weight_kg < 0)) {
      toast.error("El peso unitario debe ser un número ≥ 0.")
      return
    }
    if (datos.unit_volume_m3 != null && (!Number.isFinite(datos.unit_volume_m3) || datos.unit_volume_m3 <= 0)) {
      toast.error("El volumen unitario debe ser mayor a 0.")
      return
    }
    setGuardando(true)
    try {
      await getServices().cargo.crearItem(manifestId, datos)
      toast.success(`Ítem ${datos.line_number} agregado al manifiesto.`)
      onAbiertoChange(false)
      onGuardado()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo ítem</DialogTitle>
          <DialogDescription>
            Agrega mercadería al manifiesto. El lote inicial lleva la cantidad
            completa (Σ = total, ADR 0003) y queda donde corresponda según el
            camión del manifiesto.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="item-descripcion">Descripción</Label>
            <Input
              id="item-descripcion"
              className="mt-1"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ej: Repuestos línea industrial B"
              autoFocus
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="item-cantidad">Cantidad</Label>
              <Input
                id="item-cantidad"
                type="number"
                min={1}
                step="any"
                className="mt-1"
                value={cantidad}
                onChange={(event) => setCantidad(event.target.value)}
                placeholder="50"
              />
            </div>
            <div>
              <Label htmlFor="item-uom">Unidad</Label>
              <Select value={uom} onValueChange={(v) => setUom(v ?? "unit")}>
                <SelectTrigger id="item-uom" className="mt-1 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UOM_OPTIONS.map((opcion) => (
                    <SelectItem key={opcion} value={opcion}>
                      {UOM_LABELS[opcion]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="item-peso">Peso unit. (kg, opcional)</Label>
              <Input
                id="item-peso"
                type="number"
                min={0}
                step="any"
                className="mt-1"
                value={pesoUnitario}
                onChange={(event) => setPesoUnitario(event.target.value)}
                placeholder="18"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="item-sku">Identificador (SKU, opcional)</Label>
              <Input
                id="item-sku"
                className="mt-1"
                value={sku}
                onChange={(event) => setSku(event.target.value)}
                placeholder="REP-2002"
              />
            </div>
            <div>
              <Label htmlFor="item-categoria">Categoría (opcional)</Label>
              <Input
                id="item-categoria"
                className="mt-1"
                value={categoria}
                onChange={(event) => setCategoria(event.target.value)}
                placeholder="Repuestos"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="item-volumen">Volumen unit. (m³, opcional)</Label>
              <Input
                id="item-volumen"
                type="number"
                min={0}
                step="any"
                className="mt-1"
                value={volumenUnitario}
                onChange={(event) => setVolumenUnitario(event.target.value)}
                placeholder="0.06"
              />
            </div>
            <div>
              <Label htmlFor="item-referencia">Nro. de línea</Label>
              <Input id="item-referencia" className="mt-1" value={String(proximoLineNumber)} disabled />
            </div>
          </div>
          <div>
            <Label htmlFor="item-observaciones">Observaciones (opcional)</Label>
            <textarea
              id="item-observaciones"
              value={observaciones}
              onChange={(event) => setObservaciones(event.target.value)}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Notas a nivel ítem (ej: embalaje con daños)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando…" : "Agregar ítem"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}