import { useCallback, useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Copy, Eye, GitCompare, Layers, Map as MapIcon, PencilRuler, Plus, RotateCcw, Send } from "lucide-react"
import { getServices } from "@/services"
import type { LayoutDiff, LayoutVersionRow } from "@/services/layoutService"
import { LayoutDiffTable } from "@/components/editor/LayoutDiffTable"
import { useFacilityId } from "@/hooks/useFacilityId"
import { useAuth } from "@/integrations/auth/useAuth"
import { PageHeader } from "@/components/shared/PageHeader"
import { LoadingState } from "@/components/shared/LoadingState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"

const ESTADO_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft: { label: "Borrador", variant: "secondary" },
  published: { label: "Publicado", variant: "default" },
  archived: { label: "Histórico", variant: "outline" },
}

interface ConfirmAccion {
  kind: "publicar" | "restaurar"
  layoutId: string
  nombre: string
}

interface CompararAccion {
  name: string
  from: number
  to: number
}

/** change counts from the persisted `changes` jsonb (floor-plan-versioning.md). */
function countsDeCambios(changes: unknown): { added: number; removed: number; changed: number } | null {
  if (!changes || typeof changes !== "object") return null
  const counts = (changes as { counts?: unknown }).counts
  if (!counts || typeof counts !== "object") return null
  const { added, removed, changed } = counts as { added?: unknown; removed?: unknown; changed?: unknown }
  if (typeof added !== "number" || typeof removed !== "number" || typeof changed !== "number") return null
  return { added, removed, changed }
}

export function LayoutsPage() {
  const { facilityId, loading: facilityLoading } = useFacilityId()
  const { user, hasPermission } = useAuth()
  const navigate = useNavigate()

  const [versiones, setVersiones] = useState<LayoutVersionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmAccion | null>(null)
  const [nuevoAbierto, setNuevoAbierto] = useState(false)
  const [comparar, setComparar] = useState<CompararAccion | null>(null)

  const puedeEditar = hasPermission("warehouse.configure")

  const cargar = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    setError(null)
    try {
      const filas = await getServices().layouts.listarVersiones({ facilidadId: facilityId })
      setVersiones(filas)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [facilityId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const grupos = useMemo(() => {
    const map = new Map<string, LayoutVersionRow[]>()
    for (const v of versiones) {
      const lista = map.get(v.name) ?? []
      lista.push(v)
      map.set(v.name, lista)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [versiones])

  const publicar = async (layoutId: string) => {
    try {
      const actorId = user?.id
      await getServices().layouts.publicarVersion(layoutId, undefined, actorId)
      toast.success("Versión publicada — ya es el plano operativo del predio.")
      void cargar()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const restaurar = async (layoutId: string) => {
    try {
      await getServices().layouts.restaurarVersion(layoutId, user?.id)
      toast.success("Nueva versión borrador creada desde el histórico.")
      void cargar()
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    }
  }

  if (facilityLoading || (facilityId && loading)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Planos" description="Versiones del layout por facilidad." />
        <LoadingState rows={4} label="Cargando planos" />
      </div>
    )
  }

  if (!facilityId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Planos" description="Versiones del layout por facilidad." />
        <ErrorState description="No se encontró ninguna facilidad activa." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Planos" description="Versiones del layout por facilidad." />
        <ErrorState description={error} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Planos"
        description="Versiones del layout de la facilidad: borradores, publicado y histórico."
        actions={
          <Button disabled={!puedeEditar} onClick={() => setNuevoAbierto(true)}>
            <Plus className="size-4" />
            Nuevo layout
          </Button>
        }
      />

      {grupos.length === 0 ? (
        <EmptyLayouts
          puedeEditar={puedeEditar}
          onCrear={() => setNuevoAbierto(true)}
        />
      ) : (
        grupos.map(([nombre, filas]) => {
          const asc = [...filas].sort((a, b) => a.version - b.version)
          return (
          <Card key={nombre}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <Layers className="size-4 text-muted-foreground" />
                  {nombre}
                </span>
                <span className="text-xs font-normal text-muted-foreground">{filas.length} versión(es)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {filas.map((v) => {
                  const estado = ESTADO_LABELS[v.status]
                  const esBorrador = v.status === "draft"
                  const counts = countsDeCambios(v.changes)
                  const indice = asc.findIndex((x) => x.id === v.id)
                  const anterior = indice > 0 ? asc[indice - 1].version : 0
                  return (
                    <li key={v.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <Badge variant={estado.variant}>v{v.version}</Badge>
                      <Badge variant="outline">{estado.label}</Badge>
                      <span className="min-w-0 flex-1 text-sm text-muted-foreground">
                        <span className="block truncate">
                          {v.creador_nombre
                            ? `Por ${v.creador_nombre}`
                            : "Sin autor registrado"}
                          {" · "}
                          {formatFecha(v.created_at)}
                        </span>
                        {v.description ? (
                          <span className="block truncate text-xs">{v.description}</span>
                        ) : null}
                        {counts ? (
                          <span className="mt-0.5 block truncate text-xs">
                            <span className="text-emerald-700">+{counts.added}</span>
                            <span className="text-red-700"> −{counts.removed} </span>
                            <span className="text-amber-700">~{counts.changed}</span> campo(s)
                          </span>
                        ) : null}
                      </span>
                      <div className="flex items-center gap-1">
                        {esBorrador ? (
                          <Button size="sm" variant="secondary" onClick={() => navigate(`/settings/layouts/${v.id}/edit`)}>
                            <PencilRuler className="size-4" />
                            Editar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => navigate(`/settings/layouts/${v.id}/edit`)}>
                            <Eye className="size-4" />
                            Ver
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!puedeEditar}
                          onClick={async () => {
                            try {
                              const creada = await getServices().layouts.crearVersion({
                                facilityId,
                                name: v.name,
                                description: `Copia de v${v.version}`,
                                baseVersionId: v.id,
                                actorId: user?.id,
                              })
                              toast.success(`Borrador v${creada.layout.version} creado.`)
                              navigate(`/settings/layouts/${creada.layout.id}/edit`)
                            } catch (cause) {
                              toast.error(cause instanceof Error ? cause.message : String(cause))
                            }
                          }}
                        >
                          <Copy className="size-4" />
                          Nueva versión
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setComparar({ name: v.name, from: anterior, to: v.version })}>
                          <GitCompare className="size-4" />
                          Comparar
                        </Button>
                        {esBorrador ? (
                          <Button size="sm" variant="ghost" disabled={!puedeEditar} onClick={() => setConfirm({ kind: "publicar", layoutId: v.id, nombre: v.name })}>
                            <Send className="size-4" />
                            Publicar
                          </Button>
                        ) : null}
                        {v.status === "archived" ? (
                          <Button size="sm" variant="ghost" disabled={!puedeEditar} onClick={() => setConfirm({ kind: "restaurar", layoutId: v.id, nombre: v.name })}>
                            <RotateCcw className="size-4" />
                            Restaurar
                          </Button>
                        ) : null}
                        {v.status === "published" ? (
                          <Button size="sm" variant="ghost" render={<Link to="/map" />}>
                            <MapIcon className="size-4" />
                            Ver en mapa
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
          )
        })
      )}

      {confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirm(null)
          }}
          title={confirm.kind === "publicar" ? "Publicar versión" : "Restaurar versión"}
          description={
            confirm.kind === "publicar"
              ? `La versión borrador de "${confirm.nombre}" reemplazará al plano publicado. Las versiones publicadas anteriores quedan archivadas.`
              : `Se creará una nueva versión borrador de "${confirm.nombre}" copiando los elementos de esta versión histórica.`
          }
          confirmLabel={confirm.kind === "publicar" ? "Publicar" : "Restaurar"}
          onConfirm={() => {
            const accion = confirm.kind === "publicar" ? publicar(confirm.layoutId) : restaurar(confirm.layoutId)
            return accion
          }}
        />
      ) : null}

      <NuevoLayoutDialog
        open={nuevoAbierto}
        onOpenChange={setNuevoAbierto}
        facilityId={facilityId}
        versiones={versiones}
        onCreado={(id) => navigate(`/settings/layouts/${id}/edit`)}
      />

      {comparar ? (
        <CompareVersionesDialog
          open
          onOpenChange={(open) => {
            if (!open) setComparar(null)
          }}
          facilityId={facilityId}
          name={comparar.name}
          versiones={versiones.filter((v) => v.name === comparar.name)}
          inicial={comparar}
        />
      ) : null}
    </div>
  )
}

function EmptyLayouts({ puedeEditar, onCrear }: { puedeEditar: boolean; onCrear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MapIcon className="size-6" />
      </div>
      <h3 className="text-md font-medium">Sin planos todavía</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Creá el layout de la facilidad para poder editar y publicar versiones.
      </p>
      {puedeEditar ? (
        <Button size="sm" className="mt-2" onClick={onCrear}>
          <Plus className="size-4" />
          Crear layout
        </Button>
      ) : null}
    </div>
  )
}

function NuevoLayoutDialog({
  open,
  onOpenChange,
  facilityId,
  versiones,
  onCreado,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilityId: string
  versiones: LayoutVersionRow[]
  onCreado: (layoutId: string) => void
}) {
  const { user } = useAuth()
  const [nombre, setNombre] = useState("")
  const [base, setBase] = useState<string>("")
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (open) {
      setNombre("")
      setBase("")
    }
  }, [open])

  const nombresExistentes = useMemo(() => Array.from(new Set(versiones.map((v) => v.name))).sort(), [versiones])

  const crear = async () => {
    const name = nombre.trim()
    if (!name) {
      toast.error("El nombre del layout es obligatorio.")
      return
    }
    setGuardando(true)
    try {
      const creado = await getServices().layouts.crearVersion({
        facilityId,
        name,
        baseVersionId: base || undefined,
        actorId: user?.id,
      })
      toast.success(`Layout "${name}" v${creado.layout.version} creado.`)
      onOpenChange(false)
      onCreado(creado.layout.id)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo layout</DialogTitle>
          <DialogDescription>
            Nombre del plano (ej. "Planta Principal"). Se crea como versión borrador v1.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="nuevo-nombre">Nombre</Label>
            <Input
              id="nuevo-nombre"
              className="mt-1"
              value={nombre}
              onChange={(event) => setNombre(event.target.value)}
              placeholder="Planta Principal"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="nuevo-base">Copiar elementos desde (opcional)</Label>
            <Select value={base} onValueChange={(value) => setBase(value ?? "")}>
              <SelectTrigger id="nuevo-base" className="mt-1">
                <SelectValue placeholder="Empezar vacío" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__vacío__">Empezar vacío</SelectItem>
                {nombresExistentes.map((name) => {
                  const mejor = [...versiones]
                    .filter((v) => v.name === name)
                    .sort((a, b) => b.version - a.version)[0]
                  return (
                    <SelectItem key={name} value={mejor.id}>
                      {name} (v{mejor.version} · {ESTADO_LABELS[mejor.status].label})
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={guardando} onClick={() => void crear()}>
              {guardando ? "Creando…" : "Crear layout"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function formatFecha(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString("es-AR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
}

/**
 * Read-only version comparison (floor-plan-versioning.md §Compare
 * versions): two selectors + the server-side diff table. warehouse.read —
 * no mutation happens here.
 */
function CompareVersionesDialog({
  open,
  onOpenChange,
  facilityId,
  name,
  versiones,
  inicial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  facilityId: string
  name: string
  versiones: LayoutVersionRow[]
  inicial: CompararAccion
}) {
  const ordenadas = useMemo(() => [...versiones].sort((a, b) => a.version - b.version), [versiones])
  const [from, setFrom] = useState(inicial.from)
  const [to, setTo] = useState(inicial.to)
  const [resultado, setResultado] = useState<
    | { estado: "cargando" }
    | { estado: "error"; mensaje: string }
    | { estado: "listo"; diff: LayoutDiff }
  >({ estado: "cargando" })

  useEffect(() => {
    if (!open) return
    let cancelled = false
    getServices()
      .layouts.obtenerComparacionLayout(facilityId, name, from, to)
      .then((d) => {
        if (!cancelled) setResultado({ estado: "listo", diff: d })
      })
      .catch((cause) => {
        if (!cancelled) setResultado({ estado: "error", mensaje: cause instanceof Error ? cause.message : String(cause) })
      })
    return () => {
      cancelled = true
    }
  }, [open, facilityId, name, from, to])

  const cambiarDesde = (value: string | null) => {
    if (value === null) return
    setFrom(Number(value))
    setResultado({ estado: "cargando" })
  }
  const cambiarHacia = (value: string | null) => {
    if (value === null) return
    setTo(Number(value))
    setResultado({ estado: "cargando" })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Comparar versiones</DialogTitle>
          <DialogDescription>
            Diff calculado server-side entre dos versiones de "{name}" — solo lectura.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-40">
            <Label>Desde</Label>
            <Select value={String(from)} onValueChange={cambiarDesde}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar versión" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Línea base (plano vacío)</SelectItem>
                {ordenadas.map((v) => (
                  <SelectItem key={v.id} value={String(v.version)}>
                    v{v.version} · {ESTADO_LABELS[v.status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-40">
            <Label>Hacia</Label>
            <Select value={String(to)} onValueChange={cambiarHacia}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Seleccionar versión" />
              </SelectTrigger>
              <SelectContent>
                {ordenadas.map((v) => (
                  <SelectItem key={v.id} value={String(v.version)}>
                    v{v.version} · {ESTADO_LABELS[v.status].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto rounded-lg border bg-muted/20">
          {resultado.estado === "cargando" ? (
            <p className="p-4 text-center text-sm text-muted-foreground">Calculando diff…</p>
          ) : resultado.estado === "error" ? (
            <p className="p-4 text-center text-sm text-destructive">{resultado.mensaje}</p>
          ) : (
            <div className="p-3">
              <LayoutDiffTable diff={resultado.diff} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}