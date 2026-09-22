import { useEffect, useState } from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { CargoItemInsert, TransportCompanyRow, TruckRow } from "@/types"

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

/** UOM preset (schema default 'unit', no CHECK — free text accepted). */
export const UOM_OPTIONS = ["unit", "box", "pallet", "kg", "ton"] as const
export const UOM_LABELS: Record<string, string> = {
  unit: "Unidad",
  box: "Caja",
  pallet: "Pallet",
  kg: "Kilogramo",
  ton: "Tonelada",
}

interface ItemBorrador {
  description: string
  cantidad: string
  uom: string
  sku: string
  pesoUnitario: string
}

function nuevoItem(): ItemBorrador {
  return { description: "", cantidad: "", uom: "unit", sku: "", pesoUnitario: "" }
}

interface ManifestFormDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  facilityId: string | null
  onGuardado: (manifestId: string) => void
}

/**
 * Create manifest with its first item(s) (cargo-module.md §CargoCreateDialog,
 * "creates a cargo_manifest with first item(s)"; cargo.create). Creates the
 * manifest first, then each item as its own unit — the initial full-quantity
 * lot lands on the manifest truck when set (states.md §cargo_item).
 */
export function ManifestFormDialog({
  abierto,
  onAbiertoChange,
  facilityId,
  onGuardado,
}: ManifestFormDialogProps) {
  const { user } = useAuth()

  const [codigo, setCodigo] = useState("")
  const [camionId, setCamionId] = useState<string | "sin_camion">("sin_camion")
  const [companiaId, setCompaniaId] = useState<string | "sin_compania">("sin_compania")
  const [origen, setOrigen] = useState("")
  const [destino, setDestino] = useState("")
  const [peso, setPeso] = useState("")
  const [llegada, setLlegada] = useState("")
  const [notas, setNotas] = useState("")
  const [items, setItems] = useState<ItemBorrador[]>([nuevoItem()])
  const [camiones, setCamiones] = useState<TruckRow[]>([])
  const [companias, setCompanias] = useState<TransportCompanyRow[]>([])
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setCodigo("")
      setCamionId("sin_camion")
      setCompaniaId("sin_compania")
      setOrigen("")
      setDestino("")
      setPeso("")
      setLlegada("")
      setNotas("")
      setItems([nuevoItem()])
      setErrorCodigo(null)
    }
  }, [abierto])

  // Selects drive the create form; a failure only empties the control.
  useEffect(() => {
    let activo = true
    Promise.all([
      getServices().trucks.listar({ limit: 100 }).catch(() => [] as TruckRow[]),
      getServices().trucks.listarCompanias().catch(() => [] as TransportCompanyRow[]),
    ]).then(([trucks, companiasRows]) => {
      if (!activo) return
      setCamiones(trucks)
      setCompanias(companiasRows)
    })
    return () => {
      activo = false
    }
  }, [])

  const cambiarItem = (index: number, patch: Partial<ItemBorrador>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }

  const guardar = async () => {
    if (!facilityId) {
      toast.error("Sin facilidad activa: no se puede crear el manifiesto.")
      return
    }
    const code = codigo.trim()
    if (!code) {
      setErrorCodigo("El código del manifiesto es obligatorio.")
      return
    }
    const itemsValidos: CargoItemInsert[] = []
    for (const [index, it] of items.entries()) {
      const description = it.description.trim()
      if (!description) {
        toast.error(`El ítem ${index + 1} necesita una descripción.`)
        return
      }
      const cantidad = Number(it.cantidad)
      if (!Number.isFinite(cantidad) || cantidad <= 0) {
        toast.error(`El ítem ${index + 1} necesita una cantidad mayor a 0.`)
        return
      }
      const pesoUnitario = it.pesoUnitario.trim() === "" ? null : Number(it.pesoUnitario)
      if (pesoUnitario !== null && (!Number.isFinite(pesoUnitario) || pesoUnitario < 0)) {
        toast.error(`El peso unitario del ítem ${index + 1} debe ser un número ≥ 0.`)
        return
      }
      itemsValidos.push({
        line_number: index + 1,
        description,
        total_quantity: cantidad,
        uom: it.uom,
        sku: it.sku.trim() || null,
        unit_weight_kg: pesoUnitario,
      })
    }
    const pesoKg = peso.trim() === "" ? null : Number(peso)
    if (pesoKg !== null && (!Number.isFinite(pesoKg) || pesoKg < 0)) {
      toast.error("El peso esperado debe ser un número ≥ 0.")
      return
    }
    setGuardando(true)
    try {
      const services = getServices()
      const manifest = await services.cargo.crearManifest({
        facility_id: facilityId,
        code,
        truck_id: camionId === "sin_camion" ? null : camionId,
        transport_company_id: companiaId === "sin_compania" ? null : companiaId,
        origin: origen.trim() || null,
        destination: destino.trim() || null,
        expected_weight_kg: pesoKg,
        arrival_date: llegada || null,
        notes: notas.trim() || null,
        created_by: user?.id ?? null,
      })
      for (const item of itemsValidos) {
        await services.cargo.crearItem(manifest.id, item)
      }
      toast.success(`Manifiesto ${code} creado con ${itemsValidos.length} ítem(s).`)
      onAbiertoChange(false)
      onGuardado(manifest.id)
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause)
      if (/ya existe|duplicate|unique|conflicto/i.test(mensaje)) {
        setErrorCodigo(mensaje)
      } else {
        toast.error(mensaje)
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[min(90dvh,44rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo manifiesto</DialogTitle>
          <DialogDescription>
            Alta de carga con su primer ítem. El estado inicial es un rollup
            (recibido / en camión); los lotes se dividen y transfieren después
            con movimientos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="manifest-codigo">Código</Label>
            <Input
              id="manifest-codigo"
              className="mt-1"
              value={codigo}
              onChange={(event) => {
                setCodigo(event.target.value)
                setErrorCodigo(null)
              }}
              placeholder="MANIF-2026-0921-A"
              aria-invalid={errorCodigo !== null}
              autoFocus
            />
            {errorCodigo ? (
              <p role="alert" className="mt-1 text-sm text-destructive">{errorCodigo}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="manifest-camion">Camión (opcional)</Label>
            <Select value={camionId} onValueChange={(v) => setCamionId(v ?? "sin_camion")}>
              <SelectTrigger id="manifest-camion" className="mt-1 w-full">
                <SelectValue placeholder="Sin camión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sin_camion">Sin camión</SelectItem>
                {camiones.map((camion) => (
                  <SelectItem key={camion.id} value={camion.id}>
                    {camion.plate}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {companias.length > 0 ? (
            <div>
              <Label htmlFor="manifest-compania">Transportista (opcional)</Label>
              <Select value={companiaId} onValueChange={(v) => setCompaniaId(v ?? "sin_compania")}>
                <SelectTrigger id="manifest-compania" className="mt-1 w-full">
                  <SelectValue placeholder="Sin transportista" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sin_compania">Sin transportista</SelectItem>
                  {companias.map((compania) => (
                    <SelectItem key={compania.id} value={compania.id}>
                      {compania.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="manifest-origen">Origen (opcional)</Label>
              <Input
                id="manifest-origen"
                className="mt-1"
                value={origen}
                onChange={(event) => setOrigen(event.target.value)}
                placeholder="Ciudad de origen"
              />
            </div>
            <div>
              <Label htmlFor="manifest-destino">Destino (opcional)</Label>
              <Input
                id="manifest-destino"
                className="mt-1"
                value={destino}
                onChange={(event) => setDestino(event.target.value)}
                placeholder="Ciudad de destino"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="manifest-peso">Peso esperado (kg, opcional)</Label>
              <Input
                id="manifest-peso"
                type="number"
                min={0}
                className="mt-1"
                value={peso}
                onChange={(event) => setPeso(event.target.value)}
                placeholder="12400"
              />
            </div>
            <div>
              <Label htmlFor="manifest-llegada">Fecha de llegada (opcional)</Label>
              <Input
                id="manifest-llegada"
                type="date"
                className="mt-1"
                value={llegada}
                onChange={(event) => setLlegada(event.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="manifest-notas">Notas (opcional)</Label>
            <textarea
              id="manifest-notas"
              value={notas}
              onChange={(event) => setNotas(event.target.value)}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Observaciones generales del manifiesto"
            />
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Ítems</div>
            {items.map((item, index) => (
              <div key={index} className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`item-${index}-desc`}>Descripción</Label>
                    <Input
                      id={`item-${index}-desc`}
                      className="mt-1"
                      value={item.description}
                      onChange={(event) => cambiarItem(index, { description: event.target.value })}
                      placeholder="Ej: Repuestos línea industrial A"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Quitar ítem ${index + 1}`}
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    disabled={items.length === 1}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor={`item-${index}-cant`}>Cantidad</Label>
                    <Input
                      id={`item-${index}-cant`}
                      type="number"
                      min={1}
                      step="any"
                      className="mt-1"
                      value={item.cantidad}
                      onChange={(event) => cambiarItem(index, { cantidad: event.target.value })}
                      placeholder="100"
                    />
                  </div>
                  <div>
                    <Label>Unidad</Label>
                    <Select value={item.uom} onValueChange={(v) => cambiarItem(index, { uom: v ?? "unit" })}>
                      <SelectTrigger className="mt-1 w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UOM_OPTIONS.map((uom) => (
                          <SelectItem key={uom} value={uom}>
                            {UOM_LABELS[uom]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`item-${index}-peso`}>Peso unitario (kg, opcional)</Label>
                    <Input
                      id={`item-${index}-peso`}
                      type="number"
                      min={0}
                      step="any"
                      className="mt-1"
                      value={item.pesoUnitario}
                      onChange={(event) => cambiarItem(index, { pesoUnitario: event.target.value })}
                      placeholder="2.5"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor={`item-${index}-sku`}>Identificador (SKU, opcional)</Label>
                  <Input
                    id={`item-${index}-sku`}
                    className="mt-1"
                    value={item.sku}
                    onChange={(event) => cambiarItem(index, { sku: event.target.value })}
                    placeholder="REP-1001"
                  />
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              onClick={() => setItems((prev) => [...prev, nuevoItem()])}
            >
              <PlusIcon data-icon="inline-start" />
              Agregar ítem
            </Button>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Creando…" : "Crear manifiesto"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}