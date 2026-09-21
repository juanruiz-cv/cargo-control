import { useEffect, useState } from "react"
import { toast } from "sonner"

import { getServices } from "@/services"
import type { MovementRow } from "@/types"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { MOVEMENT_KIND_LABELS, formatFecha } from "@/components/trucks/truckStatus"

const PAGINA_TIMELINE = 50

/**
 * Truck movement timeline (T-51): latest 50 first, "Ver más" loads older.
 * Manifest codes come from a single bounded read (never per-row queries).
 */
export function TruckTimeline({ camionId }: { camionId: string }) {
  const [movimientos, setMovimientos] = useState<MovementRow[]>([])
  const [codigos, setCodigos] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [reintento, setReintento] = useState(0)

  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)
    const cargar = async () => {
      try {
        const [movs, manifests] = await Promise.all([
          getServices().movements.listarMovimientos({ camionId, limit: PAGINA_TIMELINE }),
          getServices().cargo.listarManifests({ camionId, limit: 100 }),
        ])
        if (!activo) return
        setMovimientos(movs)
        setCodigos(new Map(manifests.map((m) => [m.id, m.code])))
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
  }, [camionId, reintento])

  const verMas = async () => {
    setCargandoMas(true)
    try {
      const mas = await getServices().movements.listarMovimientos({
        camionId,
        limit: PAGINA_TIMELINE,
        offset: movimientos.length,
      })
      setMovimientos((prev) => [...prev, ...mas])
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setCargandoMas(false)
    }
  }

  if (cargando) return <LoadingState rows={4} label="Cargando movimientos" />
  if (error) {
    return (
      <ErrorState
        title="No se pudieron cargar los movimientos"
        description={error}
        action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
      />
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Movimientos</CardTitle>
      </CardHeader>
      <CardContent>
        {movimientos.length === 0 ? (
          <EmptyState
            title="Sin movimientos"
            description="Todavía no hay ingreso, descargas ni egresos registrados para este camión."
          />
        ) : (
          <div className="space-y-3">
            <ul className="divide-y divide-border">
              {movimientos.map((mov) => (
                <li key={mov.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">{MOVEMENT_KIND_LABELS[mov.kind]}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {codigos.get(mov.manifest_id ?? "") ?? mov.manifest_id ?? "—"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{formatFecha(mov.occurred_at)}</span>
                    {mov.operator_id ? <span>Operador {mov.operator_id}</span> : null}
                  </div>
                  {mov.reason ? (
                    <p className="w-full text-sm text-muted-foreground">Motivo: {mov.reason}</p>
                  ) : null}
                </li>
              ))}
            </ul>
            {movimientos.length % PAGINA_TIMELINE === 0 ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={() => void verMas()} disabled={cargandoMas}>
                  {cargandoMas ? "Cargando…" : "Ver más"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  )
}