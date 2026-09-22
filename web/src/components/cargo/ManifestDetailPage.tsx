import { useEffect, useMemo, useState } from "react"
import { ArrowDownUpIcon, ArrowLeftIcon, ArrowRightLeftIcon, PlusIcon, Truck } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { CargoItemDetail, ManifestDetail } from "@/services/cargoService"
import type { ItemLotRow, LocationRow, TruckRow } from "@/types"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { PageHeader } from "@/components/shared/PageHeader"
import { DischargeDialog } from "@/components/cargo/DischargeDialog"
import { ItemFormDialog } from "@/components/cargo/ItemFormDialog"
import { MovementsTimeline } from "@/components/cargo/MovementsTimeline"
import { SplitDialog } from "@/components/cargo/SplitDialog"
import { TransferDialog } from "@/components/cargo/TransferDialog"
import { ItemStatusBadge, LotStatusBadge, ManifestStatusBadge } from "@/components/cargo/cargoBadges"
import { formatFechaDia } from "@/components/cargo/manifestStatus"
import { formatKg } from "@/components/trucks/truckStatus"

const ESTADOS_DESCARGABLES = new Set(["received", "in_playon", "in_control"])

/**
 * Manifest detail (cargo-module.md §ManifestDetail; /cargo/:id). Header +
 * read-only manifest fields, items table with lot placements inline and
 * Split/Transfer per lot, and the manifest timeline below (served by
 * obtenerManifest — no second fetch). Driver/parties are omitted: there is
 * no service to resolve their names yet (documented).
 */
export function ManifestDetailPage({ manifestId }: { manifestId: string }) {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const puedeCrearItem = hasPermission("cargo.update")
  const puedeTransferir = hasPermission("cargo.transfer")

  const [detalle, setDetalle] = useState<ManifestDetail | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  const [version, setVersion] = useState(0)

  const [ubicaciones, setUbicaciones] = useState<Map<string, LocationRow>>(new Map())
  const [camiones, setCamiones] = useState<Map<string, TruckRow>>(new Map())

  const [itemAbierto, setItemAbierto] = useState(false)
  const [descargaAbierta, setDescargaAbierta] = useState(false)
  const [splitLote, setSplitLote] = useState<ItemLotRow | null>(null)
  const [transferLote, setTransferLote] = useState<ItemLotRow | null>(null)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)
    const cargar = async () => {
      try {
        const [d, locRows, truckRows] = await Promise.all([
          getServices().cargo.obtenerManifest(manifestId),
          getServices().locations.listarLocations({ activo: true, limit: 100 }).catch(() => [] as LocationRow[]),
          getServices().trucks.listar({ limit: 100 }).catch(() => [] as TruckRow[]),
        ])
        if (!activo) return
        setUbicaciones(new Map(locRows.map((l) => [l.id, l])))
        setCamiones(new Map(truckRows.map((t) => [t.id, t])))
        setDetalle(d)
        setCargando(false)
      } catch (cause) {
        if (!activo) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setCargando(false)
      }
    }
    void cargar()
    return () => {
      activo = false
    }
  }, [manifestId, version, reintento])

  const lotes = useMemo(
    () => (detalle ? detalle.items.flatMap((det) => det.lots) : []),
    [detalle],
  )
  const lotesOnTruck = useMemo(
    () => lotes.filter((l) => l.status === "on_truck"),
    [lotes],
  )
  const proximoLineNumber = useMemo(
    () => (detalle ? Math.max(0, ...detalle.items.map((i) => i.item.line_number)) + 1 : 1),
    [detalle],
  )

  if (cargando) return <LoadingState rows={6} label="Cargando manifiesto" />

  if (error && !detalle) {
    return (
      <ErrorState
        title="No se pudo cargar el manifiesto"
        description={error}
        action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
      />
    )
  }

  if (!detalle) {
    return (
      <ErrorState
        title="Manifiesto no encontrado"
        description="El manifiesto no existe o no tenés acceso a él."
        action={<Button variant="outline" onClick={() => navigate("/cargo")}>Volver a Mercadería</Button>}
      />
    )
  }

  const { manifest } = detalle
  const camion = camiones.get(manifest.truck_id ?? "") ?? null
  const puedeDescargar =
    puedeCrearItem && ESTADOS_DESCARGABLES.has(manifest.status) && lotesOnTruck.length > 0

  const lugar = (lote: ItemLotRow): string => {
    if (lote.current_location_id) {
      return ubicaciones.get(lote.current_location_id)?.code ?? lote.current_location_id
    }
    if (lote.current_truck_id) {
      const t = camiones.get(lote.current_truck_id)
      return t ? `Camión ${t.plate}` : `Camión ${lote.current_truck_id}`
    }
    return "—"
  }

  const congelado = (lote: ItemLotRow) => lote.status === "in_quarantine" || lote.status === "seized"
  const pesoItem = (det: CargoItemDetail) =>
    det.item.unit_weight_kg != null ? formatKg(Math.round(det.item.unit_weight_kg * det.item.total_quantity * 10) / 10) : "—"
  const pesoLote = (det: CargoItemDetail, lote: ItemLotRow) =>
    (lote.unit_weight_kg ?? det.item.unit_weight_kg) != null
      ? formatKg(Math.round(((lote.unit_weight_kg ?? det.item.unit_weight_kg) as number) * lote.quantity * 10) / 10)
      : "—"

  return (
    <div className="space-y-6">
      <PageHeader
        title={manifest.code}
        description={`Llegada ${formatFechaDia(manifest.arrival_date ?? manifest.created_at)} · ${camion?.plate ?? "Sin camión"}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/cargo")}>
              <ArrowLeftIcon data-icon="inline-start" />
              Volver
            </Button>
            {puedeCrearItem ? (
              <Button onClick={() => setItemAbierto(true)}>
                <PlusIcon data-icon="inline-start" />
                Agregar ítem
              </Button>
            ) : null}
            {puedeDescargar ? (
              <Button onClick={() => setDescargaAbierta(true)}>
                <Truck data-icon="inline-start" />
                Descargar
              </Button>
            ) : null}
          </>
        }
      />

      {manifest.notes?.trim() ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">{manifest.notes}</CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Datos del manifiesto</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Estado</span>
            <ManifestStatusBadge status={manifest.status} />
          </div>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Camión</dt>
              <dd className="font-medium text-foreground">{camion?.plate ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Peso esperado</dt>
              <dd className="font-medium text-foreground">{formatKg(manifest.expected_weight_kg)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Llegada</dt>
              <dd className="font-medium text-foreground">{formatFechaDia(manifest.arrival_date)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Ruta</dt>
              <dd className="font-medium text-foreground">
                {manifest.origin ?? "—"} → {manifest.destination ?? "—"}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ítems ({detalle.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {detalle.items.length === 0 ? (
            <EmptyState
              title="Sin ítems"
              description="Agregá el primer ítem de este manifiesto."
              action={
                puedeCrearItem ? <Button onClick={() => setItemAbierto(true)}>+ Agregar ítem</Button> : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Línea</TableHead>
                  <TableHead>Ítem</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Peso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalle.items.map((det) => (
                  <ItemConLotes
                    key={det.item.id}
                    det={det}
                    lugar={lugar}
                    pesoItem={pesoItem}
                    pesoLote={pesoLote}
                    congelado={congelado}
                    puedeTransferir={puedeTransferir}
                    puedeCrearItem={puedeCrearItem}
                    onSplit={setSplitLote}
                    onTransfer={setTransferLote}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <MovementsTimeline movimientos={detalle.movements} titulo="Historial" />

      <ItemFormDialog
        abierto={itemAbierto}
        onAbiertoChange={setItemAbierto}
        manifestId={manifest.id}
        proximoLineNumber={proximoLineNumber}
        onGuardado={() => setVersion((v) => v + 1)}
      />

      <DischargeDialog
        abierto={descargaAbierta}
        onAbiertoChange={setDescargaAbierta}
        manifest={manifest}
        cantidadLotesOnTruck={lotesOnTruck.length}
        onDescargado={() => setVersion((v) => v + 1)}
      />

      {splitLote ? (
        <SplitDialog
          abierto
          onAbiertoChange={(a) => {
            if (!a) setSplitLote(null)
          }}
          lote={splitLote}
          onDividido={() => setVersion((v) => v + 1)}
        />
      ) : null}

      {transferLote ? (
        <TransferDialog
          abierto
          onAbiertoChange={(a) => {
            if (!a) setTransferLote(null)
          }}
          lote={transferLote}
          onTransferido={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </div>
  )
}

function ItemConLotes({
  det,
  lugar,
  pesoItem,
  pesoLote,
  congelado,
  puedeTransferir,
  puedeCrearItem,
  onSplit,
  onTransfer,
}: {
  det: CargoItemDetail
  lugar: (lote: ItemLotRow) => string
  pesoItem: (det: CargoItemDetail) => string
  pesoLote: (det: CargoItemDetail, lote: ItemLotRow) => string
  congelado: (lote: ItemLotRow) => boolean
  puedeTransferir: boolean
  puedeCrearItem: boolean
  onSplit: (lote: ItemLotRow) => void
  onTransfer: (lote: ItemLotRow) => void
}) {
  const { item, lots } = det
  return (
    <>
      <TableRow className="bg-muted/30">
        <TableCell className="align-middle font-medium">{item.line_number}</TableCell>
        <TableCell className="align-middle">
          {item.description}
          {item.sku ? <span className="ml-2 font-mono text-xs text-muted-foreground">{item.sku}</span> : null}
        </TableCell>
        <TableCell className="text-right align-middle">
          {item.total_quantity} {item.uom}
        </TableCell>
        <TableCell className="text-right align-middle">{pesoItem(det)}</TableCell>
        <TableCell className="align-middle">
          <ItemStatusBadge status={item.status} />
        </TableCell>
        <TableCell className="text-right align-middle" />
      </TableRow>
      {lots.map((lote) => (
        <TableRow key={lote.id} className="border-dashed">
          <TableCell />
          <TableCell className="pl-8 font-mono text-xs text-muted-foreground">↳ {lote.id}</TableCell>
          <TableCell className="text-right text-sm">
            {lote.quantity} {lote.uom}
          </TableCell>
          <TableCell className="text-right text-sm text-muted-foreground">{pesoLote(det, lote)}</TableCell>
          <TableCell>
            <LotStatusBadge status={lote.status} />
          </TableCell>
          <TableCell className="text-right">
            <span className="inline-flex items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">{lugar(lote)}</span>
              {puedeCrearItem ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title="Dividir lote"
                  aria-label={`Dividir lote ${lote.id}`}
                  disabled={congelado(lote)}
                  onClick={() => onSplit(lote)}
                >
                  <ArrowDownUpIcon className="size-4" />
                </Button>
              ) : null}
              {puedeTransferir ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={congelado(lote) ? "Lote retenido: no puede transferirse" : "Transferir lote"}
                  aria-label={`Transferir lote ${lote.id}`}
                  disabled={congelado(lote)}
                  onClick={() => onTransfer(lote)}
                >
                  <ArrowRightLeftIcon className="size-4" />
                </Button>
              ) : null}
            </span>
          </TableCell>
        </TableRow>
      ))}
    </>
  )
}