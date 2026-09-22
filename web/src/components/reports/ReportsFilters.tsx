import { MANIFEST_STATUS_LABELS } from "@/components/cargo/manifestStatus"
import { HOLD_STATUS_LABELS, SCAN_RESULT_LABELS } from "@/components/special-areas/specialAreaStatus"
import { MOVEMENT_KIND_LABELS, TRUCK_BASE_STATUS_LABELS } from "@/components/trucks/truckStatus"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ActionCode } from "@/services/auditService"
import type { FiltrosReporte, ReporteConfig, ReporteId } from "@/services/reportService"

interface ReportsFiltersProps {
  /** Active report — controls which filter flags render (reportService REPORTES). */
  reporte: ReporteConfig
  filtros: FiltrosReporte
  onCambio: (filtros: FiltrosReporte) => void
  /** Auditoría action catalog (loaded once by ReportsPage). */
  acciones: ActionCode[]
}

/** Date input ("YYYY-MM-DD") → UTC day bucket: `since` = start of day. */
function diaDesde(dia: string): string | undefined {
  if (!dia) return undefined
  return `${dia}T00:00:00.000Z`
}

/** `until` = start of the NEXT day (exclusive upper edge, same as audit.md §Query design). */
function diaHasta(dia: string): string | undefined {
  if (!dia) return undefined
  const fin = new Date(`${dia}T00:00:00.000Z`)
  fin.setUTCDate(fin.getUTCDate() + 1)
  return fin.toISOString()
}

/** Estado filter options per report — the SAME label maps the formatters use. */
function opcionesEstado(reporte: ReporteId): { valor: string; etiqueta: string }[] {
  switch (reporte) {
    case "camiones":
      return Object.entries(TRUCK_BASE_STATUS_LABELS).map(([valor, etiqueta]) => ({ valor, etiqueta }))
    case "carga":
      return Object.entries(MANIFEST_STATUS_LABELS).map(([valor, etiqueta]) => ({ valor, etiqueta }))
    case "rezago":
    case "secuestro":
      return Object.entries(HOLD_STATUS_LABELS).map(([valor, etiqueta]) => ({ valor, etiqueta }))
    default:
      return []
  }
}

/**
 * Report filter bar (T14, E10-2). Every control maps 1:1 to a server-side
 * predicate in FiltrosReporte (reportService.ts) — nothing is filtered
 * client-side, mirroring the audit module contract (AU-48). Date inputs
 * use the UTC day bucket convention shared with AuditFilters.
 */
export function ReportsFilters({ reporte, filtros, onCambio, acciones }: ReportsFiltersProps) {
  const setFiltro = (patch: Partial<FiltrosReporte>) => {
    onCambio({ ...filtros, ...patch })
  }

  const estados = opcionesEstado(reporte.id)

  const filtroActivo =
    filtros.desde !== undefined ||
    filtros.hasta !== undefined ||
    filtros.placa !== undefined ||
    filtros.estado !== undefined ||
    filtros.resultado !== undefined ||
    filtros.dentroTolerancia !== undefined ||
    filtros.kind !== undefined ||
    filtros.accion !== undefined

  return (
    <div className="flex flex-wrap items-end gap-2">
      {reporte.fecha ? (
        <>
          <div>
            <Label htmlFor="rep-filtro-desde" className="mb-1 block text-xs text-muted-foreground">
              Desde
            </Label>
            <Input
              id="rep-filtro-desde"
              type="date"
              className="h-9"
              value={filtros.desde?.slice(0, 10) ?? ""}
              onChange={(event) => setFiltro({ desde: diaDesde(event.target.value) })}
            />
          </div>
          <div>
            <Label htmlFor="rep-filtro-hasta" className="mb-1 block text-xs text-muted-foreground">
              Hasta
            </Label>
            <Input
              id="rep-filtro-hasta"
              type="date"
              className="h-9"
              value={filtros.hasta?.slice(0, 10) ?? ""}
              onChange={(event) => setFiltro({ hasta: diaHasta(event.target.value) })}
            />
          </div>
        </>
      ) : null}

      {reporte.placa ? (
        <div className="min-w-44">
          <Label htmlFor="rep-filtro-placa" className="mb-1 block text-xs text-muted-foreground">
            Patente
          </Label>
          <Input
            id="rep-filtro-placa"
            className="h-9 font-mono text-xs"
            placeholder="Ej.: AB123CD"
            value={filtros.placa ?? ""}
            onChange={(event) => setFiltro({ placa: event.target.value || undefined })}
          />
        </div>
      ) : null}

      {reporte.estado && estados.length > 0 ? (
        <div className="min-w-44">
          <Label htmlFor="rep-filtro-estado" className="mb-1 block text-xs text-muted-foreground">
            Estado
          </Label>
          <Select
            value={filtros.estado ?? "todos"}
            onValueChange={(v) => setFiltro({ estado: v && v !== "todos" ? v : undefined })}
          >
            <SelectTrigger id="rep-filtro-estado" aria-label="Filtrar por estado">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {estados.map(({ valor, etiqueta }) => (
                <SelectItem key={valor} value={valor}>
                  {etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {reporte.resultado ? (
        <div className="min-w-44">
          <Label htmlFor="rep-filtro-resultado" className="mb-1 block text-xs text-muted-foreground">
            Resultado
          </Label>
          <Select
            value={filtros.resultado ?? "todos"}
            onValueChange={(v) =>
              setFiltro({ resultado: v && v !== "todos" ? (v as FiltrosReporte["resultado"]) : undefined })
            }
          >
            <SelectTrigger id="rep-filtro-resultado" aria-label="Filtrar por resultado">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(Object.keys(SCAN_RESULT_LABELS) as (keyof typeof SCAN_RESULT_LABELS)[]).map((resultado) => (
                <SelectItem key={resultado} value={resultado}>
                  {SCAN_RESULT_LABELS[resultado]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {reporte.tolerancia ? (
        <div className="min-w-44">
          <Label htmlFor="rep-filtro-tolerancia" className="mb-1 block text-xs text-muted-foreground">
            Dentro de tolerancia
          </Label>
          <Select
            value={
              filtros.dentroTolerancia === undefined
                ? "todos"
                : filtros.dentroTolerancia
                  ? "si"
                  : "no"
            }
            onValueChange={(v) =>
              setFiltro({
                dentroTolerancia:
                  v === "si" ? true : v === "no" ? false : undefined,
              })
            }
          >
            <SelectTrigger id="rep-filtro-tolerancia" aria-label="Filtrar por tolerancia">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="si">Sí</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {reporte.kind ? (
        <div className="min-w-44">
          <Label htmlFor="rep-filtro-kind" className="mb-1 block text-xs text-muted-foreground">
            Tipo de movimiento
          </Label>
          <Select
            value={filtros.kind ?? "todos"}
            onValueChange={(v) => setFiltro({ kind: v && v !== "todos" ? (v as FiltrosReporte["kind"]) : undefined })}
          >
            <SelectTrigger id="rep-filtro-kind" aria-label="Filtrar por tipo de movimiento">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {(Object.keys(MOVEMENT_KIND_LABELS) as (keyof typeof MOVEMENT_KIND_LABELS)[]).map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {MOVEMENT_KIND_LABELS[kind]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {reporte.accion ? (
        <div className="min-w-52">
          <Label htmlFor="rep-filtro-accion" className="mb-1 block text-xs text-muted-foreground">
            Acción
          </Label>
          <Select
            value={filtros.accion ?? "todos"}
            onValueChange={(v) => setFiltro({ accion: v && v !== "todos" ? v : undefined })}
          >
            <SelectTrigger id="rep-filtro-accion" aria-label="Filtrar por acción">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {acciones.map(({ code, label }) => (
                <SelectItem key={code} value={code}>
                  {label} ({code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      {filtroActivo ? (
        <Button variant="ghost" onClick={() => onCambio({})}>
          Limpiar
        </Button>
      ) : null}
    </div>
  )
}