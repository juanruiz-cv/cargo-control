import { Eye, Grid3X3, Magnet, Redo2, Ruler, Undo2 } from "lucide-react"
import { editorStore, useEditor } from "@/components/editor/editorStore"
import { ZoomControls } from "@/components/map/shared/ZoomControls"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface FloorPlanToolbarProps {
  preview: boolean
  onPreviewChange: (preview: boolean) => void
  onFit: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  zoom: number
  atMinZoom: boolean
  atMaxZoom: boolean
  /** Layout scale in cm per doc unit (layouts.scale), for the units display. */
  escalaCmPorUnidad: number
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            variant={active ? "secondary" : "ghost"}
            disabled={disabled}
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Editor toolbar (docs/ux/floor-plan-editor.md §7): undo/redo, grid, snap,
 * units, preview and zoom commands.
 */
export function FloorPlanToolbar({
  preview,
  onPreviewChange,
  onFit,
  onZoomIn,
  onZoomOut,
  zoom,
  atMinZoom,
  atMaxZoom,
  escalaCmPorUnidad,
}: FloorPlanToolbarProps) {
  useEditor((s) => s.historyVersion)
  const snapEnabled = useEditor((s) => s.snapEnabled)
  const gridVisible = useEditor((s) => s.gridVisible)
  const metricUnits = useEditor((s) => s.metricUnits)
  const canUndo = editorStore.canUndo()
  const canRedo = editorStore.canRedo()

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-background p-1 shadow-sm">
      <ToolbarButton label="Deshacer (Ctrl+Z)" disabled={!canUndo} onClick={() => editorStore.undo()}>
        <Undo2 />
      </ToolbarButton>
      <ToolbarButton label="Rehacer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={() => editorStore.redo()}>
        <Redo2 />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <ToolbarButton
        label="Cuadrícula (G)"
        active={gridVisible}
        onClick={() => editorStore.setGrid(!gridVisible)}
      >
        <Grid3X3 />
      </ToolbarButton>
      <ToolbarButton
        label="Ajuste a cuadrícula (S)"
        active={snapEnabled}
        onClick={() => editorStore.setSnap(!snapEnabled)}
      >
        <Magnet />
      </ToolbarButton>
      <ToolbarButton
        label="Unidades m/cm (M)"
        active={metricUnits}
        onClick={() => editorStore.setMetric(!metricUnits)}
      >
        <Ruler />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <ToolbarButton
        label="Vista previa (solo lectura)"
        active={preview}
        onClick={() => onPreviewChange(!preview)}
      >
        <Eye />
      </ToolbarButton>

      <div className="mx-1 h-5 w-px bg-border" />

      <span className="px-1.5 text-xs text-muted-foreground whitespace-nowrap">
        Escala: 1 unidad = {escalaCmPorUnidad} cm
      </span>

      <div className="ml-auto">
        <ZoomControls
          zoom={zoom}
          atMinZoom={atMinZoom}
          atMaxZoom={atMaxZoom}
          onZoomIn={onZoomIn}
          onZoomOut={onZoomOut}
          onFit={onFit}
        />
      </div>
    </div>
  )
}