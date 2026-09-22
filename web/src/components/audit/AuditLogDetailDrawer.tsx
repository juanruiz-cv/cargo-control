import { useEffect, useState } from "react"
import { Link } from "react-router-dom"

import { getServices } from "@/services"
import { ACTION_CATALOG } from "@/services/auditService"
import { ROUTES } from "@/config/routes"
import type { AuditLogRow, Json } from "@/types"

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { formatFecha } from "@/components/trucks/truckStatus"
import { Badge } from "@/components/ui/badge"
import { Loader2Icon } from "lucide-react"

interface AuditLogDetailDrawerProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Loaded lazily while the drawer opens — one row per open (bounded). */
  registroId: number | null
}

const ACCION_LABEL = new Map(ACTION_CATALOG.map(({ code, label }) => [code, label]))

/** Known structured-context keys of `metadata` (audit.md §Registration doctrine, ADR 0014). */
const METADATA_KEYS = ["operation_key", "source", "session_id"] as const

/**
 * Audit event detail (AU-51): header, metadata chips and the before/after
 * snapshots rendered as pretty JSON (null side shows "—"). Strictly
 * read-only — no edit, no delete, no revert affordances (AU-33). The
 * timeline link reuses the existing truck/manifest timelines instead of
 * duplicating a movement projection (audit.md §Retention).
 */
export function AuditLogDetailDrawer({
  abierto,
  onAbiertoChange,
  registroId,
}: AuditLogDetailDrawerProps) {
  const [registro, setRegistro] = useState<AuditLogRow | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto || registroId === null) return
    let activo = true
    setCargando(true)
    setError(null)
    setRegistro(null)
    getServices()
      .audit.obtenerDetalle(registroId)
      .then((fila) => {
        if (!activo) return
        setRegistro(fila)
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
  }, [abierto, registroId])

  return (
    <Drawer open={abierto} onOpenChange={onAbiertoChange}>
      <DrawerContent className="max-h-[85dvh] overflow-y-auto">
        <DrawerHeader>
          <DrawerTitle>Evento de auditoría</DrawerTitle>
          <DrawerDescription>
            Registro append-only de la espina de auditoría: solo lectura.
          </DrawerDescription>
        </DrawerHeader>
        <div className="space-y-4 px-4 pb-6">
          {cargando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Cargando detalle…
            </div>
          ) : error ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              {error}
            </p>
          ) : registro ? (
            <DetalleRegistro registro={registro} />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

function DetalleRegistro({ registro }: { registro: AuditLogRow }) {
  const etiquetaAccion = ACCION_LABEL.get(registro.action)
  const nombreActor = registro.actor_id ?? "sistema"
  const chips = metadataChips(registro.metadata)
  const vinculoTimeline = enlaceTimeline(registro)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="font-mono">
          {registro.action}
        </Badge>
        {etiquetaAccion ? (
          <span className="text-sm text-muted-foreground">{etiquetaAccion}</span>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">ID</dt>
          <dd className="font-mono font-medium text-foreground">#{registro.id}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cuándo</dt>
          <dd className="font-medium text-foreground">{formatFecha(registro.created_at)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Usuario</dt>
          <dd className="font-medium text-foreground">
            {nombreActor === "sistema" ? (
              <span className="text-muted-foreground">sistema</span>
            ) : (
              nombreActor
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Organización</dt>
          <dd className="font-mono text-xs font-medium text-foreground">{registro.organization_id}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Entidad</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[11px]">
              {registro.entity_type ?? "—"}
            </Badge>
            <code className="text-xs text-foreground">{registro.entity_id ?? "—"}</code>
          </dd>
        </div>
      </dl>

      {registro.reason ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Razón: </span>
          {registro.reason}
        </p>
      ) : null}

      {chips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map(({ clave, valor }) => (
            <Badge key={clave} variant="ghost" className="font-mono text-[11px]">
              {clave}: {valor}
            </Badge>
          ))}
        </div>
      ) : null}

      {vinculoTimeline ? (
        <p className="text-sm">
          <Link
            to={vinculoTimeline.to}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            {vinculoTimeline.label}
          </Link>
        </p>
      ) : null}

      <div className="space-y-2">
        <BloqueJson titulo="Antes" valor={registro.before} />
        <BloqueJson titulo="Después" valor={registro.after} />
      </div>
    </div>
  )
}

/** metadata chips (operation_key/source/session_id) when present (AU-21). */
function metadataChips(metadata: Json | null): { clave: string; valor: string }[] {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return []
  const registro = metadata as Record<string, unknown>
  const chips: { clave: string; valor: string }[] = []
  for (const clave of METADATA_KEYS) {
    const valor = registro[clave]
    if (typeof valor === "string" || typeof valor === "number" || typeof valor === "boolean") {
      chips.push({ clave, valor: String(valor) })
    }
  }
  return chips
}

/**
 * Reuses the existing timelines instead of duplicating a movement
 * projection (movements-timeline.md; audit.md §Retention). item_lot rows
 * have no registered route (/cargo/items/:itemId stays pending per
 * CargoPage) — the manifest detail covers the lot history.
 */
function enlaceTimeline(registro: AuditLogRow): { to: string; label: string } | null {
  if (registro.entity_type === "truck" && registro.entity_id) {
    return { to: `${ROUTES.trucks}/${registro.entity_id}`, label: "Ver timeline del camión" }
  }
  if (registro.entity_type === "cargo_manifest" && registro.entity_id) {
    return { to: `${ROUTES.cargo}/${registro.entity_id}`, label: "Ver cargamento y su timeline" }
  }
  return null
}

/**
 * Pretty-JSON snapshot block; null renders "—" (AU-51). Wrapped in a
 * native <details> so the block stays open on desktop and collapses on
 * small screens.
 */
function BloqueJson({ titulo, valor }: { titulo: string; valor: Json | null }) {
  return (
    <details open className="rounded-lg border border-border bg-muted/30">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-foreground">
        {titulo}
      </summary>
      {valor === null ? (
        <p className="px-3 pb-3 text-sm text-muted-foreground">—</p>
      ) : (
        <pre className="max-h-64 overflow-auto px-3 pb-3 font-mono text-xs leading-relaxed text-foreground">
          {JSON.stringify(valor, null, 2)}
        </pre>
      )}
    </details>
  )
}