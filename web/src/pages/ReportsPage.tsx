import { useCallback, useEffect, useMemo, useState } from "react"

import { DownloadIcon, FileBarChartIcon } from "lucide-react"

import { useAuth } from "@/integrations/auth/useAuth"
import { descargarCsv, exportarCsv, nombreArchivoReporte } from "@/lib/csv"
import { getServices } from "@/services"
import type { ActionCode } from "@/services/auditService"
import {
  REPORTE_POR_ID,
  REPORTES,
  type FiltrosReporte,
  type ReporteId,
  type ResultadoReporte,
} from "@/services/reportService"

import { ReportsFilters } from "@/components/reports/ReportsFilters"
import { ReportsTable } from "@/components/reports/ReportsTable"
import { EmptyState } from "@/components/shared/EmptyState"
import { PageHeader } from "@/components/shared/PageHeader"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const PAGE_SIZE = 25

/**
 * Reports module (T14, E10-2) — 10 read-only reports, each gated by its own
 * read permission (rbac.md): tabs the caller cannot read are HIDDEN, so a
 * partial page never leaks (tabs ocultos, nunca leak parcial). The route
 * guard (/reports = warehouse.read) guarantees at least the Ocupación tab
 * is visible once the user reaches this screen.
 *
 * Every filter maps 1:1 to a server-side predicate (same contract as the
 * audit module, AU-48); the CSV export writes EXACTLY the visible table
 * (same columnas[i].formato, same page) via csv.ts — there is no second
 * formatting path.
 */
export function ReportsPage() {
  const { hasPermission } = useAuth()

  const visibles = useMemo(() => REPORTES.filter((reporte) => hasPermission(reporte.permiso)), [hasPermission])

  const [activo, setActivo] = useState<ReporteId>(visibles[0]?.id ?? "ocupacion")
  const config = REPORTE_POR_ID.get(activo)

  const [filtros, setFiltros] = useState<FiltrosReporte>({})
  const [pagina, setPagina] = useState(1)
  const [resultado, setResultado] = useState<ResultadoReporte | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reintento, setReintento] = useState(0)
  const [acciones, setAcciones] = useState<ActionCode[]>([])

  // Auditoría action catalog loads once; failures degrade to an empty
  // select — the report itself still works (same as AuditPage, AU-41/40).
  useEffect(() => {
    let activo = true
    getServices()
      .audit.obtenerCatalogoAcciones()
      .then((catalogo) => {
        if (activo) setAcciones(catalogo)
      })
      .catch(() => {
        if (activo) setAcciones([])
      })
    return () => {
      activo = false
    }
  }, [])

  // Every filter/tab/page change re-queries the bounded server window —
  // the client never filters loaded rows and never pulls unbounded history.
  useEffect(() => {
    if (!config) return
    let activo = true
    setCargando(true)
    setError(null)
    getServices()
      .reportes.generar(
        config.id,
        filtros,
        { limit: PAGE_SIZE, offset: (pagina - 1) * PAGE_SIZE },
      )
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
  }, [config, filtros, pagina, reintento])

  const cambiarReporte = useCallback((nuevo: ReporteId) => {
    setActivo(nuevo)
    setFiltros({})
    setPagina(1)
  }, [])

  const cambiarFiltros = useCallback((nuevos: FiltrosReporte) => {
    setFiltros(nuevos)
    setPagina(1)
  }, [])

  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / PAGE_SIZE)) : 1
  const irAPagina = useCallback((nueva: number) => setPagina(nueva), [])

  const descargar = () => {
    if (!resultado || resultado.filas.length === 0) return
    descargarCsv(nombreArchivoReporte(activo), exportarCsv(resultado.columnas, resultado.filas))
  }

  if (visibles.length === 0 || !config) {
    return (
      <EmptyState
        title="Reportes no disponibles"
        description="Tu rol no tiene permisos para ver ningún reporte."
        icon={<FileBarChartIcon className="size-6" />}
      />
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reportes"
        description="Reportes operativos con filtros, agregados del servidor y exportación CSV."
        actions={
          resultado && resultado.filas.length > 0 && !cargando ? (
            <Button variant="outline" onClick={descargar} aria-label={`Exportar ${config.titulo} a CSV`}>
              <DownloadIcon data-icon="inline-start" />
              Exportar CSV
            </Button>
          ) : undefined
        }
      />
      <Tabs
        orientation="vertical"
        value={activo}
        onValueChange={(value) => {
          if (value && value !== activo) cambiarReporte(value as ReporteId)
        }}
      >
        <TabsList variant="line" className="items-stretch">
          {visibles.map((reporte) => (
            <TabsTrigger key={reporte.id} value={reporte.id} className="justify-start px-3">
              {reporte.titulo}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={activo} className="min-w-0">
          <div className="space-y-4">
            <ReportsFilters reporte={config} filtros={filtros} onCambio={cambiarFiltros} acciones={acciones} />
            <ReportsTable
              resultado={resultado}
              cargando={cargando}
              error={error}
              pagina={pagina}
              totalPaginas={totalPaginas}
              onReintentar={() => setReintento((r) => r + 1)}
              onCambiarPagina={irAPagina}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}