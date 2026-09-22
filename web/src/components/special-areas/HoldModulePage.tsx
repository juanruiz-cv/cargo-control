import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { HoldOpenRow, QuarantineOperationRow, SeizureOperationRow, StationQueueRow } from "@/types"

import { AbrirCasoDialog } from "@/components/special-areas/AbrirCasoDialog"
import { ResolverCasoDialog } from "@/components/special-areas/ResolverCasoDialog"
import {
  HoldStatusBadge,
  HoldTypeBadge,
} from "@/components/special-areas/ResultadoBadge"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatFecha } from "@/components/trucks/truckStatus"

interface HoldModulePageProps {
  kind: "quarantine" | "seizure"
}

/**
 * Resumen del módulo de retenciones (special-areas.md §REZAGO/§SECUESTRO):
 * casos abiertos (hold_open view) + historial append-only. Abrir un caso usa
 * los candidatos de las colas de estación; resolver es flujo de supervisor
 * (server-side en Supabase; completo en demo).
 */
export function HoldModulePage({ kind }: HoldModulePageProps) {
  const { hasPermission, hasRole } = useAuth()
  const esRezago = kind === "quarantine"
  const puedeAbrir = hasPermission(esRezago ? "quarantine.create" : "seizure.create")
  const puedeResolver = hasRole("admin") || hasRole("supervisor")
  const puedeVer = hasPermission(esRezago ? "quarantine.read" : "seizure.read")

  const [abiertos, setAbiertos] = useState<HoldOpenRow[]>([])
  const [historial, setHistorial] = useState<(QuarantineOperationRow | SeizureOperationRow)[]>([])
  const [candidatos, setCandidatos] = useState<StationQueueRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  const [abrirAbierto, setAbrirAbierto] = useState(false)
  const [casoAResolver, setCasoAResolver] = useState<HoldOpenRow | null>(null)

  const recargar = useCallback(async () => {
    if (!puedeVer) {
      setCargando(false)
      setAbiertos([])
      setHistorial([])
      return
    }
    setCargando(true)
    setError(null)
    try {
      const [abiertosNuevos, historialNuevo] = await Promise.all([
        getServices().holds.obtenerAbiertos(kind),
        esRezago
          ? getServices().holds.quarantine.listar({ limit: 10 })
          : getServices().holds.seizure.listar({ limit: 10 }),
      ])
      setAbiertos(abiertosNuevos)
      setHistorial(historialNuevo)
      setCargando(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setCargando(false)
    }
  }, [puedeVer, kind, esRezago])

  useEffect(() => {
    void recargar()
  }, [recargar, reintento])

  // Candidates for opening a case: pending lots at ANY station checkpoint.
  useEffect(() => {
    if (!abrirAbierto || !puedeAbrir) return
    let activo = true
    getServices()
      .stations.obtenerColaPendiente()
      .then((rows) => {
        if (activo) setCandidatos(rows)
      })
      .catch((cause) => {
        if (!activo) return
        setCandidatos([])
        toast.error(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      activo = false
    }
  }, [abrirAbierto, puedeAbrir])

  const titulo = esRezago ? "Rezago" : "Secuestro"
  const descripcion = esRezago
    ? "Retenciones por motivo operativo: abrir congela el lote (in_quarantine); resolver lo libera vía movimiento `release` (supervisor)."
    : "Retenciones legales: abrir bloquea el lote (seized) con referencia legal; resolver lo libera vía movimiento `release` (supervisor)."

  if (!puedeVer) {
    return (
      <div className="space-y-4">
        <PageHeader title={titulo} description={descripcion} />
        <ErrorState
          title={`Sin permiso para ver ${titulo.toLowerCase()}`}
          description={`El permiso ${esRezago ? "quarantine.read" : "seizure.read"} es necesario para consultar ${esRezago ? "rezagos" : "secuestros"}.`}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={titulo}
        description={descripcion}
        actions={
          puedeAbrir ? (
            <Button onClick={() => setAbrirAbierto(true)}>
              {esRezago ? "Abrir rezago" : "Abrir secuestro"}
            </Button>
          ) : undefined
        }
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Casos abiertos</CardTitle>
          <CardDescription>
            Vista `hold_open`: solo casos abiertos con contexto de lote/ítem/manifiesto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {cargando && abiertos.length === 0 ? (
            <LoadingState rows={3} label={`Cargando ${titulo.toLowerCase()} abiertos`} />
          ) : error && abiertos.length === 0 ? (
            <ErrorState
              title="No se pudieron cargar los casos"
              description={error}
              action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
            />
          ) : abiertos.length === 0 ? (
            <EmptyState
              title="Sin casos abiertos"
              description={`No hay ${esRezago ? "rezagos" : "secuestros"} abiertos en este momento.`}
              action={
                puedeAbrir ? (
                  <Button variant="outline" onClick={() => setAbrirAbierto(true)}>
                    {esRezago ? "Abrir rezago" : "Abrir secuestro"}
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caso</TableHead>
                  <TableHead>Manifiesto</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>{esRezago ? "Motivo" : "Referencia legal"}</TableHead>
                  <TableHead>Abierto</TableHead>
                  <TableHead>Ubicación</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abiertos.map((fila) => (
                  <TableRow key={fila.operation_id}>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs">{fila.operation_id}</span>
                        <HoldTypeBadge tipo={fila.hold_type} />
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">{fila.manifest_code}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{fila.item_lot_id}</span>
                        <span className="text-xs text-muted-foreground">{fila.sku ?? fila.item_description}</span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate" title={esRezago ? (fila.reason ?? undefined) : (fila.legal_ref ?? undefined)}>
                        {esRezago ? fila.reason : fila.legal_ref}
                      </span>
                    </TableCell>
                    <TableCell>{formatFecha(fila.opened_at)}</TableCell>
                    <TableCell className="text-muted-foreground">{fila.current_location_id}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!puedeResolver}
                        title={puedeResolver ? "Resolver (supervisor)" : "Requiere rol admin o supervisor"}
                        onClick={() => setCasoAResolver(fila)}
                      >
                        Resolver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>
            Operaciones append-only — los casos nunca se borran (ADR 0011); resuelto indica cierre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historial.length === 0 ? (
            <EmptyState title={`Sin ${esRezago ? "rezagos" : "secuestros"} registrados`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Caso</TableHead>
                  <TableHead>Lote</TableHead>
                  <TableHead>{esRezago ? "Motivo" : "Referencia legal"}</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Abierto</TableHead>
                  <TableHead>Resuelto</TableHead>
                  <TableHead>Nota de resolución</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historial.map((op) => (
                  <TableRow key={op.id}>
                    <TableCell className="font-mono text-xs">{op.id}</TableCell>
                    <TableCell className="font-medium">{op.item_lot_id}</TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate" title={esRezago ? ((op as QuarantineOperationRow).reason ?? undefined) : ((op as SeizureOperationRow).legal_ref ?? undefined)}>
                        {esRezago ? (op as QuarantineOperationRow).reason : (op as SeizureOperationRow).legal_ref}
                      </span>
                    </TableCell>
                    <TableCell><HoldStatusBadge status={op.status} /></TableCell>
                    <TableCell>{formatFecha(op.opened_at)}</TableCell>
                    <TableCell>{formatFecha(op.resolved_at)}</TableCell>
                    <TableCell className="max-w-48">
                      <span className="block truncate" title={op.resolution_note ?? undefined}>
                        {op.resolution_note ?? "—"}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AbrirCasoDialog
        kind={kind}
        abierto={abrirAbierto}
        onAbiertoChange={setAbrirAbierto}
        candidatos={candidatos}
        onCasoAbierto={() => {
          setCandidatos([])
          void recargar()
        }}
      />
      <ResolverCasoDialog
        kind={kind}
        caso={casoAResolver}
        abierto={casoAResolver !== null}
        onAbiertoChange={(abierto) => {
          if (!abierto) setCasoAResolver(null)
        }}
        onResuelto={() => {
          setCasoAResolver(null)
          void recargar()
        }}
      />
    </div>
  )
}