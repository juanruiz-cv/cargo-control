import { ArchiveIcon } from "lucide-react"

import type { ActionCode, ActorOption, AuditPageResult, PaginaAudit } from "@/services/auditService"
import type { AuditLogRow } from "@/types"

import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { formatFecha } from "@/components/trucks/truckStatus"
import { Badge } from "@/components/ui/badge"
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

interface AuditTableProps {
  resultado: AuditPageResult | null
  cargando: boolean
  error: string | null
  actores: ActorOption[]
  acciones: ActionCode[]
  pagina: PaginaAudit
  totalPaginas: number
  onReintentar: () => void
  onAbrirDetalle: (id: number) => void
  onCambiarPagina: (page: number) => void
}

/**
 * Audit list (audit.md; AU-50): newest-first bounded table with NO row
 * actions — read-only by design. Clicking a row opens the detail drawer;
 * pagination is a real server-side offset window (AU-71).
 */
export function AuditTable({
  resultado,
  cargando,
  error,
  actores,
  acciones,
  pagina,
  totalPaginas,
  onReintentar,
  onAbrirDetalle,
  onCambiarPagina,
}: AuditTableProps) {
  if (cargando) return <LoadingState rows={6} label="Cargando eventos de auditoría" />
  if (error) {
    return (
      <ErrorState
        title="No se pudieron cargar los eventos de auditoría"
        description={error}
        action={<Button onClick={onReintentar}>Reintentar</Button>}
      />
    )
  }

  const filas = resultado?.filas ?? []
  const total = resultado?.total ?? 0
  const accionLabel = new Map(acciones.map(({ code, label }) => [code, label]))
  const actorNombre = new Map(actores.map((actor) => [actor.id, actor.nombre]))

  if (filas.length === 0) {
    return (
      <EmptyState
        title="Sin eventos de auditoría"
        description={total === 0 ? "No hay registros que coincidan con los filtros." : "No hay más registros en esta página."}
        icon={<ArchiveIcon className="size-6" />}
      />
    )
  }

  const anterior = pagina.page > 1
  const siguiente = pagina.page < totalPaginas

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">ID</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Entidad</TableHead>
              <TableHead className="max-w-32">Razón</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <AuditRow
                key={fila.id}
                fila={fila}
                accionLabel={accionLabel}
                actorNombre={actorNombre}
                onAbrirDetalle={onAbrirDetalle}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {total} registro{total === 1 ? "" : "s"} · página {pagina.page} de {totalPaginas}
        </span>
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
                    onCambiarPagina(pagina.page - 1)
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
                    onCambiarPagina(pagina.page + 1)
                  }
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  )
}

function AuditRow({
  fila,
  accionLabel,
  actorNombre,
  onAbrirDetalle,
}: {
  fila: AuditLogRow
  accionLabel: Map<string, string>
  actorNombre: Map<string, string>
  onAbrirDetalle: (id: number) => void
}) {
  const etiquetaAccion = accionLabel.get(fila.action)
  const nombreActor = fila.actor_id ? (actorNombre.get(fila.actor_id) ?? fila.actor_id) : "sistema"

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => onAbrirDetalle(fila.id)}
      aria-label={`Ver detalle del evento de auditoría #${fila.id}`}
    >
      <TableCell className="font-mono text-xs text-muted-foreground">#{fila.id}</TableCell>
      <TableCell className="whitespace-nowrap">{formatFecha(fila.created_at)}</TableCell>
      <TableCell className="max-w-40">
        <span className="truncate" title={nombreActor}>
          {nombreActor}
        </span>
      </TableCell>
      <TableCell>
        {etiquetaAccion ? (
          <Tooltip>
            <TooltipTrigger render={<span />}>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {fila.action}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>{etiquetaAccion}</TooltipContent>
          </Tooltip>
        ) : (
          <Badge variant="secondary" className="font-mono text-[11px]">
            {fila.action}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="outline" className="font-mono text-[11px]">
            {fila.entity_type ?? "—"}
          </Badge>
          <code className="truncate text-xs text-muted-foreground">{fila.entity_id ?? "—"}</code>
        </div>
      </TableCell>
      <TableCell className="max-w-32">
        {fila.reason ? (
          <Tooltip>
            <TooltipTrigger render={<span className="block truncate" />}>
              {fila.reason}
            </TooltipTrigger>
            <TooltipContent>{fila.reason}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
  )
}