import { useEffect, useState } from "react"
import { toast } from "sonner"

import { getServices } from "@/services"
import type { TransportCompanyRow, TruckRow, TruckStatus } from "@/types"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TRUCK_BASE_STATUS_LABELS } from "@/components/trucks/truckStatus"

/** Local plate format: uppercase letters, digits and dashes (normalized on save anyway). */
const PLATE_PATTERN = /^[A-Z0-9-]{4,12}$/

interface TruckFormDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Null = create; otherwise edit of this truck. */
  camion: TruckRow | null
  companias: TransportCompanyRow[]
  onGuardado: (truckId: string) => void
}

/**
 * Create/edit truck dialog (trucks-module.md §Create/§Edit; T-35, T-45).
 * NEVER offers entry/exit date fields — ingreso/egreso are derived from
 * movements (T-35). Plate is normalized (trim + uppercase) by the service;
 * the 409 duplicate surfaces inline on the plate field (T-45).
 */
export function TruckFormDialog({
  abierto,
  onAbiertoChange,
  camion,
  companias,
  onGuardado,
}: TruckFormDialogProps) {
  const esEdicion = camion !== null

  const [patente, setPatente] = useState("")
  const [compania, setCompania] = useState<string>("__ninguna__")
  const [capacidad, setCapacidad] = useState("")
  const [estado, setEstado] = useState<TruckStatus>("available")
  const [errorPatente, setErrorPatente] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) {
      setPatente(camion?.plate ?? "")
      setCompania(camion?.transport_company_id ?? "__ninguna__")
      setCapacidad(camion?.capacity_kg != null ? String(camion.capacity_kg) : "")
      setEstado(camion?.status ?? "available")
      setErrorPatente(null)
    }
  }, [abierto, camion])

  const guardar = async () => {
    const plate = patente.trim().toUpperCase()
    if (!plate) {
      setErrorPatente("La patente es obligatoria.")
      return
    }
    if (!PLATE_PATTERN.test(plate)) {
      setErrorPatente("Patente inválida: 4 a 12 caracteres (letras, números o guiones).")
      return
    }
    let capacityKg: number | null = null
    if (capacidad.trim() !== "") {
      const parsed = Number(capacidad)
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("La capacidad debe ser un número mayor o igual a cero.")
        return
      }
      capacityKg = parsed
    }
    setGuardando(true)
    try {
      const datos = {
        transport_company_id: compania === "__ninguna__" ? null : compania,
        plate,
        capacity_kg: capacityKg,
        status: estado,
      }
      const truckId = camion
        ? (await getServices().trucks.actualizar(camion.id, datos)).id
        : (await getServices().trucks.crear(datos)).id
      toast.success(esEdicion ? `Camión ${plate} actualizado.` : `Camión ${plate} creado.`)
      onAbiertoChange(false)
      onGuardado(truckId)
    } catch (cause) {
      const mensaje = cause instanceof Error ? cause.message : String(cause)
      if (/ya existe|duplicate|unique|conflicto/i.test(mensaje)) {
        setErrorPatente(mensaje)
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
          <DialogTitle>{esEdicion ? `Editar camión ${camion.plate}` : "Nuevo camión"}</DialogTitle>
          <DialogDescription>
            {esEdicion
              ? "Actualizá los datos de la flota. El ingreso/egreso se deriva de los movimientos — no se edita aquí."
              : "Alta en la flota. El estado derivado (badge) se calcula desde los movimientos."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="camion-patente">Patente</Label>
            <Input
              id="camion-patente"
              className="mt-1"
              value={patente}
              onChange={(event) => {
                setPatente(event.target.value.toUpperCase())
                setErrorPatente(null)
              }}
              placeholder="AB-123-CD"
              maxLength={12}
              aria-invalid={errorPatente !== null}
              autoFocus
            />
            {errorPatente ? (
              <p role="alert" className="mt-1 text-sm text-destructive">
                {errorPatente}
              </p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="camion-transportista">Transportista</Label>
            <Select value={compania} onValueChange={(value) => setCompania(value ?? "__ninguna__")}>
              <SelectTrigger id="camion-transportista" className="mt-1 w-full">
                <SelectValue placeholder="Sin transportista" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__ninguna__">Sin transportista</SelectItem>
                {companias.map((companiaRow) => (
                  <SelectItem key={companiaRow.id} value={companiaRow.id}>
                    {companiaRow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="camion-capacidad">Capacidad (kg)</Label>
            <Input
              id="camion-capacidad"
              type="number"
              min={0}
              className="mt-1"
              value={capacidad}
              onChange={(event) => setCapacidad(event.target.value)}
              placeholder="18000"
            />
          </div>
          <div>
            <Label htmlFor="camion-estado">Estado (base)</Label>
            <Select value={estado} onValueChange={(value) => setEstado((value ?? "available") as TruckStatus)}>
              <SelectTrigger id="camion-estado" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TRUCK_BASE_STATUS_LABELS) as TruckStatus[]).map((estadoValue) => (
                  <SelectItem key={estadoValue} value={estadoValue}>
                    {TRUCK_BASE_STATUS_LABELS[estadoValue]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void guardar()} disabled={guardando}>
              {guardando ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear camión"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}