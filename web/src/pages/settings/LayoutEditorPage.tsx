import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom"
import { ArrowLeft, RotateCcw, Save, Send } from "lucide-react"
import { getServices } from "@/services"
import type { LayoutConElementos, LayoutElementDraft } from "@/services/layoutService"
import { useAuth } from "@/integrations/auth/useAuth"
import { editorStore, useEditor } from "@/components/editor/editorStore"
import { calcularBounds, FloorPlanCanvas } from "@/components/editor/FloorPlanCanvas"
import { FloorPlanToolbar } from "@/components/editor/FloorPlanToolbar"
import { ElementPicker } from "@/components/editor/ElementPicker"
import { LayerPanel } from "@/components/editor/LayerPanel"
import { PropertiesPanel } from "@/components/editor/PropertiesPanel"
import { MiniMap } from "@/components/editor/MiniMap"
import { useViewport } from "@/hooks/useViewport"
import { LoadingState } from "@/components/shared/LoadingState"
import { ErrorState } from "@/components/shared/ErrorState"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"

const AUTOSAVE_MS = 2500
const NUDGE = 5

interface BloqueoDirty {
  guardar?: boolean
  descartar?: boolean
}

export function LayoutEditorPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, hasPermission } = useAuth()

  const [layout, setLayout] = useState<LayoutConElementos | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [estadoGuardado, setEstadoGuardado] = useState<string | null>(null)
  const [confirmPublicar, setConfirmPublicar] = useState(false)
  const [confirmRestaurar, setConfirmRestaurar] = useState(false)
  const [bloqueo, setBloqueo] = useState<BloqueoDirty | null>(null)

  const elements = useEditor((s) => s.elements)
  const dirty = useEditor((s) => s.dirty)
  const mode = useEditor((s) => s.mode)

  const esBorrador = layout?.layout.status === "draft"
  const editable = !!esBorrador && !preview && hasPermission("warehouse.configure")
  const escalaCmPorUnidad = layout?.layout.scale ?? 20

  const bounds = useMemo(() => calcularBounds(elements), [elements])
  const viewport = useViewport({ docWidth: bounds.width, docHeight: bounds.height, initial: { zoom: 1, x: 40, y: 40 } })

  // Load draft into the store.
  useEffect(() => {
    if (!id) return
    let cancelled = false
    const cargar = async () => {
      setLoading(true)
      setError(null)
      try {
        const datos = await getServices().layouts.obtenerLayoutConElementos(id)
        if (cancelled) return
        if (!datos) {
          setError("El layout no existe o fue eliminado.")
          return
        }
        setLayout(datos)
        editorStore.load(datos.elementos)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void cargar()
    return () => {
      cancelled = true
    }
  }, [id])

  const aBorrador = useCallback((): LayoutElementDraft[] => {
    return editorStore
      .getSnapshot()
      .elements.map((el) => ({
        id: el.id,
        location_id: el.location_id,
        element_type: el.element_type,
        code: el.code,
        name: el.name,
        description: el.description,
        x: el.x,
        y: el.y,
        visual_width: el.visual_width,
        visual_height: el.visual_height,
        rotation: el.rotation ?? 0,
        color: el.color,
        icon: el.icon,
        z_index: el.z_index ?? 0,
        label: el.label,
        is_locked: el.is_locked ?? false,
        is_visible: el.is_visible ?? true,
      }))
  }, [])

  const guardar = useCallback(async (): Promise<boolean> => {
    if (!layout) return false
    const snapshot = editorStore.getSnapshot()
    if (!snapshot.dirty) return true
    setGuardando(true)
    try {
      await getServices().layouts.guardarBorrador({
        layoutId: layout.layout.id,
        elementos: aBorrador(),
        actorId: user?.id,
      })
      editorStore.markClean()
      setEstadoGuardado(new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }))
      return true
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
      return false
    } finally {
      setGuardando(false)
    }
  }, [layout, aBorrador, user?.id])

  // Autosave: only drafts (docs: 2.5 s trailing), never in preview.
  const autosaveTimer = useRef<number | null>(null)
  useEffect(() => {
    if (!editable || !dirty) return
    if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current)
    autosaveTimer.current = window.setTimeout(() => {
      setGuardando(true)
      void guardar()
    }, AUTOSAVE_MS)
    return () => {
      if (autosaveTimer.current !== null) window.clearTimeout(autosaveTimer.current)
    }
  }, [editable, dirty, guardar])

  const bloquear = useBlocker(useCallback(() => dirty && esBorrador && !guardando, [dirty, esBorrador, guardando]))

  useEffect(() => {
    if (bloquear.state === "blocked") setBloqueo({})
  }, [bloquear.state])

  const salirConGuardado = async () => {
    setBloqueo({ ...bloqueo, guardar: true })
    const ok = await guardar()
    if (ok) {
      bloquear.proceed?.()
      setBloqueo(null)
    } else {
      setBloqueo(null)
    }
  }

  const salirDescartando = () => {
    editorStore.markClean()
    bloquear.proceed?.()
    setBloqueo(null)
  }

  const publicar = async () => {
    if (!layout) return
    try {
      const snapshot = editorStore.getSnapshot()
      const total = snapshot.elements.length
      const added = snapshot.elements.filter((el) => el.id.startsWith("editor-new-")).length
      await getServices().layouts.publicarVersion(layout.layout.id, {
        from_version: 0,
        elements: [],
        counts: { added, removed: 0, changed: Math.max(total - added, 0) },
      }, user?.id)
      toast.success("Versión publicada — ya es el plano operativo.")
      editorStore.markClean()
      setConfirmPublicar(false)
      navigate("/settings/layouts")
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const restaurar = async () => {
    if (!layout) return
    try {
      const creada = await getServices().layouts.restaurarVersion(layout.layout.id, user?.id)
      toast.success(`Borrador v${creada.layout.version} creado desde el histórico.`)
      setConfirmRestaurar(false)
      navigate(`/settings/layouts/${creada.layout.id}/edit`)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : String(cause))
    }
  }

  // Keyboard shortcuts (docs/ux/floor-plan-editor.md).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return
      if (!editable) return

      const ctrl = event.ctrlKey || event.metaKey
      if (ctrl && event.key.toLowerCase() === "z") {
        event.preventDefault()
        if (event.shiftKey) editorStore.redo()
        else editorStore.undo()
        return
      }
      if (ctrl && event.key.toLowerCase() === "y") {
        event.preventDefault()
        editorStore.redo()
        return
      }
      if (ctrl && event.key.toLowerCase() === "d") {
        event.preventDefault()
        editorStore.duplicateSelection()
        return
      }
      if (ctrl && event.key.toLowerCase() === "s") {
        event.preventDefault()
        void guardar()
        return
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        editorStore.deleteSelection()
        return
      }
      if (event.key === "Escape") {
        if (mode === "place") editorStore.cancelPlacement()
        else editorStore.select([])
        return
      }
      const step = event.shiftKey ? 1 : NUDGE
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault()
          editorStore.moveSelected(-step, 0)
          break
        case "ArrowRight":
          event.preventDefault()
          editorStore.moveSelected(step, 0)
          break
        case "ArrowUp":
          event.preventDefault()
          editorStore.moveSelected(0, -step)
          break
        case "ArrowDown":
          event.preventDefault()
          editorStore.moveSelected(0, step)
          break
        case "g":
        case "G":
          editorStore.setGrid(!editorStore.getSnapshot().gridVisible)
          break
        case "s":
        case "S":
          editorStore.setSnap(!editorStore.getSnapshot().snapEnabled)
          break
        case "m":
        case "M":
          editorStore.setMetric(!editorStore.getSnapshot().metricUnits)
          break
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [editable, mode, guardar])

  if (loading) {
    return (
      <div className="space-y-4">
        <LoadingState rows={5} label="Cargando editor de layout" />
      </div>
    )
  }

  if (error || !layout) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" render={<Link to="/settings/layouts" />}>
          <ArrowLeft className="size-4" /> Volver a planos
        </Button>
        <ErrorState description={error ?? "Layout no encontrado."} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" render={<Link to="/settings/layouts" />}>
          <ArrowLeft className="size-4" /> Planos
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">
          {layout.layout.name}{" "}
          <span className="text-muted-foreground">v{layout.layout.version}</span>
        </h1>
        <Badge variant={esBorrador ? "secondary" : "outline"}>
          {esBorrador ? "Borrador" : layout.layout.status === "published" ? "Publicado" : "Histórico"}
        </Badge>
        {layout.layout.description ? (
          <span className="max-w-xs truncate text-sm text-muted-foreground">{layout.layout.description}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {esBorrador ? (
            <>
              <Button size="sm" variant="outline" disabled={guardando || !dirty} onClick={() => void guardar()}>
                <Save className="size-4" />
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
              <Button size="sm" disabled={!editable} onClick={() => setConfirmPublicar(true)}>
                <Send className="size-4" />
                Publicar
              </Button>
            </>
          ) : (
            <Button size="sm" variant="secondary" onClick={() => setConfirmRestaurar(true)}>
              <RotateCcw className="size-4" />
              Restaurar como borrador
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <FloorPlanToolbar
          preview={preview}
          onPreviewChange={setPreview}
          zoom={viewport.viewport.zoom}
          atMinZoom={viewport.atMinZoom}
          atMaxZoom={viewport.atMaxZoom}
          onZoomIn={() => viewport.zoomIn({ x: 400, y: 300 })}
          onZoomOut={() => viewport.zoomOut({ x: 400, y: 300 })}
          onFit={() => viewport.fit()}
          escalaCmPorUnidad={escalaCmPorUnidad}
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {dirty ? (guardando ? "Guardando…" : "Sin guardar") : estadoGuardado ? `Guardado ${estadoGuardado}` : ""}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <main className="relative min-w-0 flex-1 overflow-hidden rounded-xl border bg-muted/20">
          <FloorPlanCanvas
            readOnly={!editable}
            viewport={viewport.viewport}
            setViewport={viewport.setViewport}
            fit={viewport.fit}
            containerRef={viewport.containerRef}
          />
          <MiniMap viewport={viewport.viewport} docWidth={bounds.width} docHeight={bounds.height} />
        </main>
        {!preview ? (
          <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto">
            {esBorrador ? <ElementPicker /> : null}
            <LayerPanel />
            <PropertiesPanel escalaCmPorUnidad={escalaCmPorUnidad} />
          </aside>
        ) : null}
      </div>

      {preview ? (
        <p className="text-xs text-muted-foreground">
          Vista previa de solo lectura — guardá el borrador para aplicar cambios.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmPublicar}
        onOpenChange={setConfirmPublicar}
        title="Publicar versión"
        description={`"${layout.layout.name}" v${layout.layout.version} pasará a ser el plano operativo. Las versiones publicadas anteriores quedan archivadas.`}
        confirmLabel="Publicar"
        onConfirm={publicar}
      />

      <ConfirmDialog
        open={confirmRestaurar}
        onOpenChange={setConfirmRestaurar}
        title="Restaurar versión"
        description={`Se creará una nueva versión borrador de "${layout.layout.name}" copiando los elementos de v${layout.layout.version}.`}
        confirmLabel="Restaurar"
        onConfirm={restaurar}
      />

      <AlertDialog open={bloqueo !== null} onOpenChange={(open) => { if (!open) setBloqueo(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              El borrador tiene modificaciones. ¿Guardar antes de salir, descartarlas o volver al editor?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setBloqueo(null)}>Seguir editando</Button>
            <Button variant="ghost" disabled={bloqueo?.descartar} onClick={salirDescartando}>
              {bloqueo?.descartar ? "Saliendo…" : "Descartar cambios"}
            </Button>
            <Button disabled={bloqueo?.guardar || guardando} onClick={() => void salirConGuardado()}>
              {bloqueo?.guardar ? "Guardando…" : "Guardar y salir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}