import { Lock, LockOpen } from "lucide-react"
import { editorStore, useEditor } from "@/components/editor/editorStore"
import { ELEMENT_TYPE_LABELS, ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"
import { formatDocUnit } from "@/lib/units"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface PropertiesPanelProps {
  escalaCmPorUnidad: number
}

/**
 * Properties of the selected element (docs/ux/floor-plan-editor.md §8):
 * identity, geometry (with unit-aware display), lock and soft-delete.
 */
export function PropertiesPanel({ escalaCmPorUnidad }: PropertiesPanelProps) {
  const elements = useEditor((s) => s.elements)
  const selection = useEditor((s) => s.selection)
  const metricUnits = useEditor((s) => s.metricUnits)
  const el = elements.find((e) => e.id === selection[0])
  const multi = selection.length > 1

  if (!el) {
    return (
      <section aria-label="Propiedades" className="rounded-lg border bg-background p-4 text-sm text-muted-foreground">
        Seleccioná un elemento para editar sus propiedades.
      </section>
    )
  }

  const meta = ELEMENT_TYPE_META[el.element_type]

  return (
    <section aria-label="Propiedades" className="rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between pb-3">
        <h3 className="text-xs font-medium text-muted-foreground">Propiedades</h3>
        {multi ? (
          <span className="text-xs text-muted-foreground">{selection.length} seleccionados</span>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label={el.is_locked ? "Desbloquear elemento" : "Bloquear elemento"}
            onClick={() => editorStore.setLock([el.id], !el.is_locked)}
          >
            {el.is_locked ? <Lock /> : <LockOpen />}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        <div>
          <Label htmlFor="el-tipo">Tipo</Label>
          <Select value={el.element_type} onValueChange={(t) => editorStore.updateElement(el.id, { element_type: t as typeof el.element_type })}>
            <SelectTrigger id="el-tipo" className="mt-1" disabled={el.is_locked}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ELEMENT_TYPE_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-xs text-muted-foreground">{ELEMENT_TYPE_META[el.element_type].labelEs}</p>
        </div>

        <div>
          <Label htmlFor="el-nombre">Nombre</Label>
          <Input
            id="el-nombre"
            className="mt-1"
            value={el.name ?? ""}
            disabled={el.is_locked}
            placeholder={meta.esLugar ? "Se genera desde la ubicación" : "Nombre visible"}
            onChange={(event) => editorStore.updateElement(el.id, { name: event.target.value || null })}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="el-x">X</Label>
            <Input id="el-x" className="mt-1" type="number" value={el.x} disabled={el.is_locked} onChange={(event) => editorStore.updateElement(el.id, { x: Number(event.target.value) })} />
          </div>
          <div>
            <Label htmlFor="el-y">Y</Label>
            <Input id="el-y" className="mt-1" type="number" value={el.y} disabled={el.is_locked} onChange={(event) => editorStore.updateElement(el.id, { y: Number(event.target.value) })} />
          </div>
          <div>
            <Label htmlFor="el-w">Ancho</Label>
            <Input id="el-w" className="mt-1" type="number" value={el.visual_width ?? meta.defaultWidth} disabled={el.is_locked} onChange={(event) => editorStore.updateElement(el.id, { visual_width: Number(event.target.value) })} />
          </div>
          <div>
            <Label htmlFor="el-h">Alto</Label>
            <Input id="el-h" className="mt-1" type="number" value={el.visual_height ?? meta.defaultHeight} disabled={el.is_locked} onChange={(event) => editorStore.updateElement(el.id, { visual_height: Number(event.target.value) })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="el-rot">Rotación</Label>
            <Input id="el-rot" className="mt-1" type="number" value={el.rotation ?? 0} disabled={el.is_locked} onChange={(event) => editorStore.updateElement(el.id, { rotation: Number(event.target.value) % 360 })} />
          </div>
          <div>
            <Label htmlFor="el-z">Capa (z)</Label>
            <Input id="el-z" className="mt-1" type="number" value={el.z_index ?? 0} disabled={el.is_locked} onChange={(event) => editorStore.updateElement(el.id, { z_index: Number(event.target.value) })} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Dimensión real: {formatDocUnit(el.visual_width ?? meta.defaultWidth, escalaCmPorUnidad, metricUnits)} ×{" "}
          {formatDocUnit(el.visual_height ?? meta.defaultHeight, escalaCmPorUnidad, metricUnits)}
          {!metricUnits ? " (imperial)" : ""}
        </p>
      </div>
    </section>
  )
}