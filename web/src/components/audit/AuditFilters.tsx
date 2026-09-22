import { useEffect, useState } from "react"

import { getServices } from "@/services"
import { AUDIT_ENTITY_TYPES, type ActionCode, type ActorOption } from "@/services/auditService"
import type { AuditLogFiltros } from "@/services/shared"
import type { TruckRow } from "@/types"

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

/** Entity type → filter label (audit.md §Query design). */
const ENTIDAD_LABELS: Record<string, string> = {
  truck: "Camión",
  cargo_item: "Mercadería (ítem)",
  item_lot: "Mercadería (lote)",
  cargo_manifest: "Cargamento",
  movement: "Movimiento",
  user: "Usuario",
  location: "Ubicación",
  layout: "Plano",
  layout_element: "Plano (elemento)",
}

/**
 * Date input ("YYYY-MM-DD") → UTC day bucket bounds (audit.md §Query
 * design / AU-43): `since` = start of day, `until` = start of the NEXT
 * day (exclusive upper edge). The facility-timezone variant is the ADR
 * 0013 server helper — the client sends UTC-bound instants.
 */
function diaDesde(dia: string): string | undefined {
  if (!dia) return undefined
  return `${dia}T00:00:00.000Z`
}

function diaHasta(dia: string): string | undefined {
  if (!dia) return undefined
  const fin = new Date(`${dia}T00:00:00.000Z`)
  fin.setUTCDate(fin.getUTCDate() + 1)
  return fin.toISOString()
}

interface AuditFiltersProps {
  filtros: AuditLogFiltros
  onCambio: (filtros: AuditLogFiltros) => void
  acciones: ActionCode[]
  actores: ActorOption[]
}

/**
 * Audit list filters (audit.md §Query design): Usuario (actor_id =
 * $1), Acción (catalog code), Entidad (entity_type), Fecha (day bucket)
 * + Camión (id or plate, resolved server-side) and Mercadería (id over
 * cargo_item/item_lot/cargo_manifest). Every control maps 1:1 to a
 * server-side predicate (AU-48); nothing is filtered client-side.
 */
export function AuditFilters({ filtros, onCambio, acciones, actores }: AuditFiltersProps) {
  const [camiones, setCamiones] = useState<TruckRow[]>([])

  useEffect(() => {
    let activo = true
    getServices()
      .trucks.listar({ limit: 100 })
      .then((rows) => {
        if (activo) setCamiones(rows)
      })
      .catch(() => {
        if (activo) setCamiones([])
      })
    return () => {
      activo = false
    }
  }, [])

  const setFiltro = (patch: Partial<AuditLogFiltros>) => {
    onCambio({ ...filtros, ...patch })
  }

  const activo =
    filtros.actorId !== undefined ||
    filtros.action !== undefined ||
    filtros.entityType !== undefined ||
    filtros.since !== undefined ||
    filtros.until !== undefined ||
    filtros.truckId !== undefined ||
    filtros.mercaderiaId !== undefined

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-44">
        <Label htmlFor="aud-filtro-actor" className="mb-1 block text-xs text-muted-foreground">
          Usuario
        </Label>
        <Select
          value={filtros.actorId ?? "todos"}
          onValueChange={(v) => setFiltro({ actorId: v && v !== "todos" ? v : undefined })}
        >
          <SelectTrigger id="aud-filtro-actor" aria-label="Filtrar por usuario">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {actores.map((actor) => (
              <SelectItem key={actor.id} value={actor.id}>
                {actor.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-52">
        <Label htmlFor="aud-filtro-accion" className="mb-1 block text-xs text-muted-foreground">
          Acción
        </Label>
        <Select
          value={filtros.action ?? "todos"}
          onValueChange={(v) => setFiltro({ action: v && v !== "todos" ? v : undefined })}
        >
          <SelectTrigger id="aud-filtro-accion" aria-label="Filtrar por acción">
            <SelectValue placeholder="Todos" />
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

      <div className="min-w-44">
        <Label htmlFor="aud-filtro-entidad" className="mb-1 block text-xs text-muted-foreground">
          Entidad
        </Label>
        <Select
          value={filtros.entityType ?? "todos"}
          onValueChange={(v) => setFiltro({ entityType: v && v !== "todos" ? v : undefined })}
        >
          <SelectTrigger id="aud-filtro-entidad" aria-label="Filtrar por entidad">
            <SelectValue placeholder="Todas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas</SelectItem>
            {AUDIT_ENTITY_TYPES.map((tipo) => (
              <SelectItem key={tipo} value={tipo}>
                {ENTIDAD_LABELS[tipo] ?? tipo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="aud-filtro-desde" className="mb-1 block text-xs text-muted-foreground">
          Desde
        </Label>
        <Input
          id="aud-filtro-desde"
          type="date"
          className="h-9"
          value={filtros.since?.slice(0, 10) ?? ""}
          onChange={(event) => setFiltro({ since: diaDesde(event.target.value) })}
        />
      </div>

      <div>
        <Label htmlFor="aud-filtro-hasta" className="mb-1 block text-xs text-muted-foreground">
          Hasta
        </Label>
        <Input
          id="aud-filtro-hasta"
          type="date"
          className="h-9"
          value={filtros.until?.slice(0, 10) ?? ""}
          onChange={(event) => setFiltro({ until: diaHasta(event.target.value) })}
        />
      </div>

      <div className="min-w-40">
        <Label htmlFor="aud-filtro-camion" className="mb-1 block text-xs text-muted-foreground">
          Camión
        </Label>
        <Select
          value={filtros.truckId ?? "todos"}
          onValueChange={(v) => setFiltro({ truckId: v && v !== "todos" ? v : undefined })}
        >
          <SelectTrigger id="aud-filtro-camion" aria-label="Filtrar por camión">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos</SelectItem>
            {camiones.map((camion) => (
              <SelectItem key={camion.id} value={camion.id}>
                {camion.plate}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="min-w-44">
        <Label htmlFor="aud-filtro-mercaderia" className="mb-1 block text-xs text-muted-foreground">
          Mercadería (ID)
        </Label>
        <Input
          id="aud-filtro-mercaderia"
          className="h-9 font-mono text-xs"
          placeholder="lote / ítem / manifiesto"
          value={filtros.mercaderiaId ?? ""}
          onChange={(event) => setFiltro({ mercaderiaId: event.target.value || undefined })}
        />
      </div>

      {activo ? (
        <Button variant="ghost" onClick={() => onCambio({})}>
          Limpiar
        </Button>
      ) : null}
    </div>
  )
}