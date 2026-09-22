import { useCallback, useEffect, useState } from "react"
import { ScaleIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { ScaleOpInput } from "@/services/stationService"
import type { ScaleOperationRow, StationQueueRow } from "@/types"

import { StationQueueTable } from "@/components/special-areas/StationQueueTable"
import { ToleranceBadge } from "@/components/special-areas/ResultadoBadge"
import { numeroDe } from "@/components/special-areas/specialAreaStatus"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatFecha, formatKg } from "@/components/trucks/truckStatus"

/**
 * Balanza station (special-areas.md §BALANZA, SBF-06..SBF-08). Pending queue
 * (station_queue: lots with no completed weigh `within_tolerance` FOR THE
 * PLACEMENT) + append-only scale operations. The dialog registers gross/tare
 * (+ net est., expected/tolerance handled server-side in production) and
 * computes `within_tolerance` here for the demo path.
 */
export function ScalePage() {
  const { hasPermission } = useAuth()
  const puedePesar = hasPermission("scale.create")

  const [cola, setCola] = useState<StationQueueRow[]>([])
  const [operaciones, setOperaciones] = useState<ScaleOperationRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [colaNueva, opsNuevas] = await Promise.all([
        getServices().stations.obtenerColaPendiente("scale"),
        getServices().stations.escala.listarOperaciones({ limit: 10 }),
      ])
      setCola(colaNueva)
      setOperaciones(opsNuevas)
      setCargando(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void recargar()
  }, [recargar, reintento])

  return (
    <div className="space-y-4">
      <PageHeader
        title="Balanza"
        description="Pesaje en checkpoint: bruto, tara y neto con tolerancias. Pesar un lote a tiempo lo saca de la cola (SBF-07)."
        actions={
          puedePesar ? (
            <Button onClick={() => setDialogoAbierto(true)}>
              <ScaleIcon data-icon="inline-start" />
              Registrar pesaje
            </Button>
          ) : undefined
        }
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Cola pendiente</CardTitle>
          <CardDescription>
            Lotes colocados en balanza sin pesaje dentro de tolerancia del placement (SBF-06): el
            pesaje fuera de tolerancia registra la operación pero el lote sigue pendiente (SBF-08).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && cola.length === 0 ? (
            <LoadingState rows={3} label="Cargando cola de balanza" />
          ) : error && cola.length === 0 ? (
            <ErrorState
              title="No se pudo cargar la cola"
              description={error}
              action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
            />
          ) : (
            <StationQueueTable
              rows={cola}
              filaAccion={(_row) => (
                <Button size="sm" variant="outline" onClick={() => setDialogoAbierto(true)} disabled={!puedePesar}>
                  Pesar
                </Button>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Pesajes recientes</CardTitle>
          <CardDescription>Últimos 10 registros (movimiento + fila append-only por pesaje, ADR 0011).</CardDescription>
        </CardHeader>
        <CardContent>
          {operaciones.length === 0 ? (
            <EmptyState
              title="Sin pesajes todavía"
              description="Los registros de balanza aparecen acá apenas se registren."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Bruto</TableHead>
                  <TableHead>Tara</TableHead>
                  <TableHead>Neto</TableHead>
                  <TableHead>Esperado</TableHead>
                  <TableHead>Tolerancia</TableHead>
                  <TableHead>Movimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operaciones.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell>{formatFecha(op.weighed_at)}</TableCell>
                    <TableCell className="font-medium">{op.item_lot_id}</TableCell>
                    <TableCell>{formatKg(op.gross_kg)}</TableCell>
                    <TableCell>{formatKg(op.tare_kg)}</TableCell>
                    <TableCell>{formatKg(op.net_kg)}</TableCell>
                    <TableCell>{formatKg(op.expected_kg)}</TableCell>
                    <TableCell><ToleranceBadge dentro={op.within_tolerance} /></TableCell>
                    <TableCell className="text-muted-foreground">#{op.movement_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PesarDialog
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
        cola={cola}
        onPesado={() => void recargar()}
      />
    </div>
  )
}

function PesarDialog({
  abierto,
  onAbiertoChange,
  cola,
  onPesado,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  cola: StationQueueRow[]
  onPesado: () => void
}) {
  const { user } = useAuth()
  const [lotId, setLotId] = useState("")
  const [gross, setGross] = useState("")
  const [tare, setTare] = useState("")
  const [neto, setNeto] = useState("")
  const [esperado, setEsperado] = useState("")
  const [tolerancia, setTolerancia] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setLotId(cola[0]?.item_lot_id ?? "")
    setGross("")
    setTare("")
    setNeto("")
    setEsperado("")
    setTolerancia("")
    setGuardando(false)
  }, [abierto, cola])

  const dentroTolerancia = (() => {
    const netoNum = netoValido() ?? numeroDe(neto)
    const esperadoNum = numeroDe(esperado)
    const toleranciaNum = numeroDe(tolerancia)
    if (netoNum === undefined || esperadoNum === undefined || toleranciaNum === undefined) return true
    return Math.abs(netoNum - esperadoNum) <= toleranciaNum
  })()

  function netoValido(): number | undefined {
    const grossNum = numeroDe(gross)
    const tareNum = numeroDe(tare)
    if (grossNum !== undefined && tareNum !== undefined) return grossNum - tareNum
    return undefined
  }

  const registrar = async () => {
    if (!lotId) return
    const netoNum = netoValido() ?? numeroDe(neto)
    setGuardando(true)
    try {
      const input: ScaleOpInput = {
        itemLotId: lotId,
        grossKg: numeroDe(gross) ?? null,
        tareKg: numeroDe(tare) ?? null,
        netKg: netoNum ?? null,
        expectedKg: numeroDe(esperado) ?? null,
        toleranceKg: numeroDe(tolerancia) ?? null,
        withinTolerance: dentroTolerancia,
        operatorId: user?.id ?? null,
        operationKey: getServices().movements.generarOperationKey("scale"),
      }
      const op = await getServices().stations.escala.crearOperacionEscala(input)
      if (op.within_tolerance) {
        toast.success(`Lote ${lotId} pesado dentro de tolerancia (movimiento #${op.movement_id}).`)
      } else {
        toast.info(
          `Pesaje fuera de tolerancia registrado — el lote sigue pendiente en la cola (SBF-08).`,
        )
      }
      onAbiertoChange(false)
      onPesado()
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
          <DialogTitle>Registrar pesaje</DialogTitle>
          <DialogDescription>
            Bruto y tara (el neto se computa). Con esperado + tolerancia cargados, dentro-tolerancia
            se calcula automáticamente; sin ellos se registra como dentro de tolerancia.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="pesar-lote">Lote</Label>
            <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
              <SelectTrigger id="pesar-lote" className="mt-1 w-full">
                <SelectValue placeholder="Elegí el lote de la cola" />
              </SelectTrigger>
              <SelectContent>
                {cola.map((c) => (
                  <SelectItem key={c.item_lot_id} value={c.item_lot_id}>
                    {c.item_lot_id} · {c.sku ?? c.item_description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pesar-bruto">Bruto (kg)</Label>
              <Input
                id="pesar-bruto"
                type="number"
                min={0}
                step="any"
                value={gross}
                onChange={(e) => setGross(e.target.value)}
                className="mt-1"
                placeholder="Ej: 1250"
              />
            </div>
            <div>
              <Label htmlFor="pesar-tara">Tara (kg)</Label>
              <Input
                id="pesar-tara"
                type="number"
                min={0}
                step="any"
                value={tare}
                onChange={(e) => setTare(e.target.value)}
                className="mt-1"
                placeholder="Ej: 250"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="pesar-neto">
              Neto (kg){netoValido() !== undefined ? ` — computado: ${netoValido()}` : ""}
            </Label>
            <Input
              id="pesar-neto"
              type="number"
              min={0}
              step="any"
              value={neto}
              onChange={(e) => setNeto(e.target.value)}
              className="mt-1"
              placeholder={netoValido() !== undefined ? "Se computa de bruto − tara" : "Ej: 1000"}
              disabled={netoValido() !== undefined}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pesar-esperado">Esperado (kg)</Label>
              <Input
                id="pesar-esperado"
                type="number"
                min={0}
                step="any"
                value={esperado}
                onChange={(e) => setEsperado(e.target.value)}
                className="mt-1"
                placeholder="Opicional"
              />
            </div>
            <div>
              <Label htmlFor="pesar-tolerancia">Tolerancia (±kg)</Label>
              <Input
                id="pesar-tolerancia"
                type="number"
                min={0}
                step="any"
                value={tolerancia}
                onChange={(e) => setTolerancia(e.target.value)}
                className="mt-1"
                placeholder="Opicional"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={guardando || !lotId}>
              {guardando ? "Pesando…" : "Registrar pesaje"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}