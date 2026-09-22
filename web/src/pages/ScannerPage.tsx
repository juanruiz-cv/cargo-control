import { useCallback, useEffect, useState } from "react"
import { ScanLineIcon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { StationQueueRow } from "@/types"
import type { ScannerOperationRow, ScannerResult } from "@/types"

import { ScanResultBadge } from "@/components/special-areas/ResultadoBadge"
import { StationQueueTable } from "@/components/special-areas/StationQueueTable"
import { SCAN_RESULT_LABELS } from "@/components/special-areas/specialAreaStatus"
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
import { formatFecha } from "@/components/trucks/truckStatus"

const RESULTADOS: ScannerResult[] = ["success", "not_found", "ambiguous", "error"]

/**
 * Scanner station (special-areas.md §SCANNER, SBF-01..SBF-05). Pending queue
 * (station_queue: lots with no completed scan FOR THE PLACEMENT) + append-only
 * scan operations. Non-success results (SBF-05/06) keep the lot pending — the
 * queue re-shows it until a success scan advances it to `checked`.
 */
export function ScannerPage() {
  const { hasPermission } = useAuth()
  const puedeEscannear = hasPermission("scanner.create")

  const [cola, setCola] = useState<StationQueueRow[]>([])
  const [operaciones, setOperaciones] = useState<ScannerOperationRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [lotPreseleccionado, setLotPreseleccionado] = useState<string | null>(null)

  const recargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const [colaNueva, opsNuevas] = await Promise.all([
        getServices().stations.obtenerColaPendiente("scan"),
        getServices().stations.scanner.listarOperaciones({ limit: 10 }),
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

  const abrirScan = (row: StationQueueRow) => {
    setLotPreseleccionado(row.item_lot_id)
    setDialogoAbierto(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Scanner"
        description="Estación de escaneo: cola pendiente y operaciones append-only (escanear un lote lo marca 'checked')."
        actions={
          puedeEscannear ? (
            <Button onClick={() => {
              setLotPreseleccionado(null)
              setDialogoAbierto(true)
            }}>
              <ScanLineIcon data-icon="inline-start" />
              Registrar escaneo
            </Button>
          ) : undefined
        }
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Cola pendiente</CardTitle>
          <CardDescription>
            Lotes colocados en scanner sin escaneo exitoso del placement (SBF-05): resultados
            not_found/ambiguous/error registran la operación pero no avanzan el lote.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && cola.length === 0 ? (
            <LoadingState rows={3} label="Cargando cola de scanner" />
          ) : error && cola.length === 0 ? (
            <ErrorState
              title="No se pudo cargar la cola"
              description={error}
              action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
            />
          ) : (
            <StationQueueTable
              rows={cola}
              filaAccion={(row) => (
                <Button size="sm" variant="outline" onClick={() => abrirScan(row)} disabled={!puedeEscannear}>
                  Escaneado
                </Button>
              )}
            />
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Operaciones recientes</CardTitle>
          <CardDescription>Últimas 10 capturas (movimiento + fila append-only por captura, ADR 0011).</CardDescription>
        </CardHeader>
        <CardContent>
          {operaciones.length === 0 ? (
            <EmptyState
              title="Sin operaciones todavía"
              description="Las capturas aparecen acá apenas se registren."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>Código escaneado</TableHead>
                  <TableHead>Resultado</TableHead>
                  <TableHead>Movimiento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operaciones.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell>{formatFecha(op.scanned_at)}</TableCell>
                    <TableCell className="font-medium">{op.item_lot_id}</TableCell>
                    <TableCell className="font-mono text-xs">{op.scanned_code}</TableCell>
                    <TableCell><ScanResultBadge result={op.result} /></TableCell>
                    <TableCell className="text-muted-foreground">#{op.movement_id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ScanDialog
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
        cola={cola}
        lotPreseleccionado={lotPreseleccionado}
        onRegistrada={() => void recargar()}
      />
    </div>
  )
}

function ScanDialog({
  abierto,
  onAbiertoChange,
  cola,
  lotPreseleccionado,
  onRegistrada,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  cola: StationQueueRow[]
  lotPreseleccionado: string | null
  onRegistrada: () => void
}) {
  const { user } = useAuth()
  const [lotId, setLotId] = useState<string>("")
  const [scannedCode, setScannedCode] = useState("")
  const [resultado, setResultado] = useState<ScannerResult>("success")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (!abierto) return
    setLotId(lotPreseleccionado ?? (cola[0]?.item_lot_id ?? ""))
    setScannedCode("")
    setResultado("success")
    setGuardando(false)
  }, [abierto, lotPreseleccionado, cola])

  const lot = cola.find((c) => c.item_lot_id === lotId)

  const registrar = async () => {
    if (!lotId) return
    setGuardando(true)
    try {
      const op = await getServices().stations.scanner.crearOperacionScan({
        itemLotId: lotId,
        scannedCode: scannedCode.trim() || lotId,
        result: resultado,
        kind: "scan_in",
        operatorId: user?.id ?? null,
        operationKey: getServices().movements.generarOperationKey("scan_in"),
      })
      if (op.result === "success") {
        toast.success(`Lote ${lotId} verificado (movimiento #${op.movement_id}).`)
      } else {
        toast.info(
          `Captura '${SCAN_RESULT_LABELS[op.result]}' registrada — el lote sigue pendiente en la cola (SBF-05).`,
        )
      }
      onAbiertoChange(false)
      onRegistrada()
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
          <DialogTitle>Registrar escaneo</DialogTitle>
          <DialogDescription>
            Escaneo scan_in del lote en el checkpoint. Resultados distintos de success quedan
            registrados pero no avanzan el lote a 'checked'.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="scan-lote">Lote</Label>
            <Select value={lotId} onValueChange={(v) => setLotId(v ?? "")}>
              <SelectTrigger id="scan-lote" className="mt-1 w-full">
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
          <div>
            <Label htmlFor="scan-codigo">Código escaneado</Label>
            <Input
              id="scan-codigo"
              value={scannedCode}
              onChange={(e) => setScannedCode(e.target.value)}
              className="mt-1"
              placeholder={lot ? `Ej: ${lot.sku ?? lot.item_lot_id}` : "Código leído por el dispositivo"}
            />
          </div>
          <div>
            <Label htmlFor="scan-resultado">Resultado</Label>
            <Select value={resultado} onValueChange={(v) => setResultado(v as ScannerResult)}>
              <SelectTrigger id="scan-resultado" className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RESULTADOS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {SCAN_RESULT_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={guardando || !lotId}>
              {guardando ? "Registrando…" : "Registrar escaneo"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}