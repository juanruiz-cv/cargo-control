import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowLeftIcon, LogOutIcon, PencilIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import { emptySignals } from "@/services/truckService"
import type { TruckSignals } from "@/services/truckService"
import type { TransportCompanyRow, TruckRow } from "@/types"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { PageHeader } from "@/components/shared/PageHeader"
import { TruckFormDialog } from "@/components/trucks/TruckFormDialog"
import { TruckStatusBadge } from "@/components/trucks/TruckStatusBadge"
import { TruckTimeline } from "@/components/trucks/TruckTimeline"
import { TRUCK_BASE_STATUS_LABELS, formatFecha, formatKg } from "@/components/trucks/truckStatus"

/**
 * Truck details (trucks-module.md §Details; T-50..T-53). Header + read-only
 * derived fields (ingreso/egreso NEVER editable — T-34/T-35), observaciones
 * sourced from the open manifests (Cargamentos owns them, T-53), timeline
 * below. Salida is a movement (T-31) and requires truck.exit (T-46/T-47).
 */
export function TruckDetailsPage({ truckId }: { truckId: string }) {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const puedeEditar = hasPermission("truck.update")
  const puedeEgresar = hasPermission("truck.exit")

  const [camion, setCamion] = useState<TruckRow | null>(null)
  const [señales, setSeñales] = useState<TruckSignals | null>(null)
  const [companias, setCompanias] = useState<TransportCompanyRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [egresoAbierto, setEgresoAbierto] = useState(false)
  const [edicionAbierta, setEdicionAbierta] = useState(false)
  const [reintento, setReintento] = useState(0)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)
    const cargar = async () => {
      try {
        const [camionRow, señalesRow, companiasRow] = await Promise.all([
          getServices().trucks.obtener(truckId),
          getServices().trucks.obtenerSeñales([truckId]),
          getServices().trucks.listarCompanias(),
        ])
        if (!activo) return
        setCamion(camionRow)
        setSeñales(señalesRow[0] ?? emptySignals(truckId))
        setCompanias(companiasRow)
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
  }, [truckId, version, reintento])

  const bloqueadoMotivo: string | null = useMemo(() => {
    if (!señales) return null
    if (señales.openQuarantine || señales.openSeizure) {
      return "La salida está bloqueada: hay lotes retenidos (rezago o secuestro)."
    }
    if (!señales.egressibleManifestId) {
      return "Sin manifiesto listo para egresar (requiere ingreso registrado y sin retenciones)."
    }
    return null
  }, [señales])

  if (cargando) return <LoadingState rows={6} label="Cargando camión" />

  if (error && !camion) {
    return (
      <ErrorState
        title="No se pudo cargar el camión"
        description={error}
        action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
      />
    )
  }

  if (!camion) {
    return (
      <ErrorState
        title="Camión no encontrado"
        description="El camión no existe o no tenés acceso a él."
        action={<Button variant="outline" onClick={() => navigate("/trucks")}>Volver a Camiones</Button>}
      />
    )
  }

  const compania = companias.find((c) => c.id === camion.transport_company_id)

  return (
    <div className="space-y-4">
      <PageHeader
        title={camion.plate}
        description={compania ? `Transportista: ${compania.name}` : undefined}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/trucks")}>
              <ArrowLeftIcon data-icon="inline-start" />
              Volver
            </Button>
            {puedeEditar ? (
              <Button variant="outline" onClick={() => setEdicionAbierta(true)}>
                <PencilIcon data-icon="inline-start" />
                Editar
              </Button>
            ) : null}
            {puedeEgresar ? (
              bloqueadoMotivo ? (
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button disabled onClick={() => setEgresoAbierto(true)}>
                        <LogOutIcon data-icon="inline-start" />
                        Salida
                      </Button>
                    }
                  />
                  <TooltipContent>{bloqueadoMotivo}</TooltipContent>
                </Tooltip>
              ) : (
                <Button onClick={() => setEgresoAbierto(true)}>
                  <LogOutIcon data-icon="inline-start" />
                  Salida
                </Button>
              )
            ) : null}
          </>
        }
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Campo label="Transportista" valor={compania?.name ?? "—"} />
            <Campo label="Capacidad" valor={formatKg(camion.capacity_kg)} />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">Estado</span>
              {señales ? <TruckStatusBadge base={camion.status} señales={señales} /> : null}
            </div>
            {señales && señales.latestMovementKind !== null ? (
              <p className="text-xs text-muted-foreground">
                Base: {TRUCK_BASE_STATUS_LABELS[camion.status]} · badge derivado de movimientos y retenciones
                (ADR 0008).
              </p>
            ) : null}
            <Campo label="Ingreso" valor={formatFecha(señales?.firstArrivalAt ?? null)} />
            <Campo label="Egreso" valor={formatFecha(señales?.lastEgressAt ?? null)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observaciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {señales?.openManifests.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin observaciones.</p>
            ) : (
              señales?.openManifests.map((m) => (
                <div key={m.id} className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{m.code}</p>
                  <p className="text-sm text-muted-foreground">{m.notes?.trim() ? m.notes : "Sin notas."}</p>
                </div>
              ))
            )}
            <p className="text-xs text-muted-foreground">
              Las observaciones viven en los manifiestos (módulo Cargamentos): los camiones no tienen notas.
            </p>
          </CardContent>
        </Card>
      </div>

      <TruckTimeline camionId={camion.id} />

      <TruckFormDialog
        abierto={edicionAbierta}
        onAbiertoChange={setEdicionAbierta}
        camion={camion}
        companias={companias}
        onGuardado={() => setVersion((v) => v + 1)}
      />

      {señales ? (
        <EgresoDialog
          abierto={egresoAbierto}
          onAbiertoChange={setEgresoAbierto}
          señales={señales}
          onEgresado={() => setVersion((v) => v + 1)}
        />
      ) : null}
    </div>
  )
}

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{valor}</span>
    </div>
  )
}

/**
 * Exit dialog (T-47): the egressible manifest is derived (earliest arrival,
 * no egress, no frozen lots), shown read-only; the motivo is a free-text
 * reason (egress is a sensitive kind). Server-committed: the movement is
 * only created on confirm.
 */
function EgresoDialog({
  abierto,
  onAbiertoChange,
  señales,
  onEgresado,
}: {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  señales: TruckSignals
  onEgresado: () => void
}) {
  const { user } = useAuth()
  const manifiesto = señales.openManifests.find((m) => m.id === señales.egressibleManifestId)

  const [motivo, setMotivo] = useState("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (abierto) setMotivo("")
  }, [abierto])

  const registrar = async () => {
    if (!manifiesto) return
    setGuardando(true)
    try {
      await getServices().trucks.registrarSalida(manifiesto.id, {
        motivo: motivo.trim() || undefined,
        operatorId: user?.id,
      })
      toast.success(`Salida registrada para ${manifiesto.code}. El camión pasó a en ruta.`)
      onAbiertoChange(false)
      onEgresado()
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
          <DialogTitle>Registrar salida</DialogTitle>
          <DialogDescription>
            El egreso se registra como movimiento (trazable) y pasa el camión a en ruta
            (rollup provisional; el motor de movimientos manda).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm text-muted-foreground">Manifiesto</span>
            <span className="text-sm font-medium text-foreground">{manifiesto?.code ?? "—"}</span>
          </div>
          <div>
            <Label htmlFor="egreso-motivo">Motivo (opcional)</Label>
            <textarea
              id="egreso-motivo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              placeholder="Ej: salida autorizada del predio"
              className="mt-1 w-full min-h-24 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={guardando || !manifiesto}>
              {guardando ? "Registrando…" : "Confirmar salida"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}