import { FileBarChartIcon } from "lucide-react"

import type { ResultadoReporte } from "@/services/reportService"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { Button } from "@/components/ui/button"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ReportsTableProps {
  resultado: ResultadoReporte | null
  cargando: boolean
  error: string | null
  /** 1-based current page (only meaningful for `paginable` reports). */
  pagina: number
  totalPaginas: number
  onReintentar: () => void
  onCambiarPagina: (pagina: number) => void
}

/**
 * Render one cell EXACTLY like the CSV export: `columnas[i].formato` is the
 * only formatting path (reportService.ts / csv.ts contract). Columns without
 * a formatter show the raw value with "—" for null/undefined.
 */
function renderCelda(columna: { clave: string; formato?: (valor: unknown) => string }, fila: Record<string, unknown>): string {
  const valor = fila[columna.clave]
  if (columna.formato) return columna.formato(valor)
  if (valor === null || valor === undefined || valor === "") return "—"
  return String(valor)
}

/** Plural helper for Spanish labels ("1 registro" / "3 registros"). */
function plural(n: number, singular: string, pluralLabel: string): string {
  return `${n} ${n === 1 ? singular : pluralLabel}`
}

/**
 * Report table (T14, E10-2) — plain read-only projection of the server
 * window. No row actions, no client-side aggregation; pagination is a real
 * server-side offset window ONLY when `resultado.paginable`. Aggregated
 * reports (`agregado: true`) and fixed snapshots (`paginable: false`) are
 * rendered whole by design.
 */
export function ReportsTable({
  resultado,
  cargando,
  error,
  pagina,
  totalPaginas,
  onReintentar,
  onCambiarPagina,
}: ReportsTableProps) {
  if (cargando) return <LoadingState rows={8} label="Cargando reporte" />
  if (error) {
    return (
      <ErrorState
        title="No se pudo cargar el reporte"
        description={error}
        action={<Button onClick={onReintentar}>Reintentar</Button>}
      />
    )
  }
  if (!resultado) return null

  const { columnas, filas, total, agregado, paginable } = resultado

  if (filas.length === 0) {
    return (
      <EmptyState
        title="Sin resultados"
        description={
          total === 0
            ? "No hay registros que coincidan con los filtros."
            : "No hay más registros en esta página."
        }
        icon={<FileBarChartIcon className="size-6" />}
      />
    )
  }

  const anterior = pagina > 1
  const siguiente = paginable && pagina < totalPaginas

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columnas.map((columna) => (
                <TableHead key={columna.clave} className="whitespace-nowrap">
                  {columna.titulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila, index) => (
              <TableRow key={index}>
                {columnas.map((columna) => (
                  <TableCell key={columna.clave} className="whitespace-nowrap">
                    {renderCelda(columna, fila)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {paginable
            ? `${plural(total, "registro", "registros")} · página ${pagina} de ${totalPaginas}`
            : agregado
              ? `${plural(total, "fila", "filas")} · resumen agregado del servidor (v8)`
              : `${plural(total, "fila", "filas")} · snapshot fijo (≤500)`}
        </span>
        {paginable ? (
          <Pagination className="w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  text="Anterior"
                  aria-disabled={!anterior}
                  className={anterior ? "" : "pointer-events-none opacity-50"}
                  onClick={(event) => {
                    if (anterior) {
                      event.preventDefault()
                      onCambiarPagina(pagina - 1)
                    }
                  }}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  text="Siguiente"
                  aria-disabled={!siguiente}
                  className={siguiente ? "" : "pointer-events-none opacity-50"}
                  onClick={(event) => {
                    if (siguiente) {
                      event.preventDefault()
                      onCambiarPagina(pagina + 1)
                    }
                  }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        ) : null}
      </div>
    </div>
  )
}