import { useCallback, useEffect, useState } from "react"

import { getServices } from "@/services"
import type {
  ActionCode,
  ActorOption,
  AuditPageResult,
  PaginaAudit,
} from "@/services/auditService"
import type { AuditLogFiltros } from "@/services/shared"

import { AuditFilters } from "@/components/audit/AuditFilters"
import { AuditLogDetailDrawer } from "@/components/audit/AuditLogDetailDrawer"
import { AuditTable } from "@/components/audit/AuditTable"
import { PageHeader } from "@/components/shared/PageHeader"

const PAGE_SIZE = 25

/**
 * Audit module (Fase 13, ADR 0014) — read-only projection of the
 * append-only audit_log spine (audit.md). Every filter is a server-side
 * predicate and every read is bounded (pageSize cap + window); there is
 * no edit, no delete and no revert affordance anywhere (AU-33). The route
 * guard (ROUTE_PERMISSIONS.audit = 'audit.read') keeps operators/viewers
 * off this screen (AU-62/63).
 */
export function AuditPage() {
  const [filtros, setFiltros] = useState<AuditLogFiltros>({})
  const [pagina, setPagina] = useState<PaginaAudit>({ page: 1, pageSize: PAGE_SIZE })
  const [resultado, setResultado] = useState<AuditPageResult | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  const [acciones, setAcciones] = useState<ActionCode[]>([])
  const [actores, setActores] = useState<ActorOption[]>([])
  const [detalleId, setDetalleId] = useState<number | null>(null)
  const [detalleAbierto, setDetalleAbierto] = useState(false)

  // Filter catalogs (actions + actors) load once; failures degrade to
  // empty selects — the list itself still works (AU-41/AU-40 filters).
  useEffect(() => {
    let activo = true
    Promise.all([
      getServices().audit.obtenerCatalogoAcciones(),
      getServices().audit.obtenerActores(),
    ])
      .then(([catalogo, actoresDisponibles]) => {
        if (!activo) return
        setAcciones(catalogo)
        setActores(actoresDisponibles)
      })
      .catch(() => {
        if (!activo) return
        setAcciones([])
        setActores([])
      })
    return () => {
      activo = false
    }
  }, [])

  // Every filter/datum change re-queries the server window — the client
  // never filters loaded rows (AU-48) and never pulls unbounded history.
  useEffect(() => {
    let activo = true
    setCargando(true)
    setError(null)
    getServices()
      .audit.listarAudit(filtros, pagina)
      .then((res) => {
        if (!activo) return
        setResultado(res)
        setCargando(false)
      })
      .catch((cause) => {
        if (!activo) return
        setError(cause instanceof Error ? cause.message : String(cause))
        setCargando(false)
      })
    return () => {
      activo = false
    }
  }, [filtros, pagina, reintento])

  // Any filter change resets to page 1: the window is re-scoped to the
  // new predicate set, never offset blindly into an old result set.
  const cambiarFiltros = useCallback((nuevos: AuditLogFiltros) => {
    setFiltros(nuevos)
    setPagina((prev) => ({ ...prev, page: 1 }))
  }, [])

  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / PAGE_SIZE)) : 1
  const irAPagina = useCallback((nueva: number) => {
    setPagina((prev) => ({ ...prev, page: nueva }))
  }, [])

  const abrirDetalle = (id: number) => {
    setDetalleId(id)
    setDetalleAbierto(true)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Auditoría"
        description="Traza de auditoría de solo lectura: sin edición ni borrado (ADR 0011)."
      />
      <AuditFilters
        filtros={filtros}
        onCambio={cambiarFiltros}
        acciones={acciones}
        actores={actores}
      />
      <AuditTable
        resultado={resultado}
        cargando={cargando}
        error={error}
        actores={actores}
        acciones={acciones}
        pagina={pagina}
        totalPaginas={totalPaginas}
        onReintentar={() => setReintento((r) => r + 1)}
        onAbrirDetalle={abrirDetalle}
        onCambiarPagina={irAPagina}
      />
      <AuditLogDetailDrawer
        abierto={detalleAbierto}
        onAbiertoChange={setDetalleAbierto}
        registroId={detalleId}
      />
    </div>
  )
}