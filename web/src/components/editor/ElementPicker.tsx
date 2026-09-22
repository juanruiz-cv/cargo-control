import { editorStore, useEditor } from "@/components/editor/editorStore"
import { ELEMENT_TYPE_LABELS, ELEMENT_TYPE_META, ELEMENT_TYPE_ORDER } from "@/components/map/shared/elementMeta"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

/**
 * Palette of element types (docs/ux/floor-plan-editor.md §5): click an
 * entry to enter placement mode; the next canvas click drops the element.
 */
export function ElementPicker() {
  const mode = useEditor((s) => s.mode)
  const placingType = useEditor((s) => s.placingType)

  return (
    <section aria-label="Paleta de elementos" className="rounded-lg border bg-background p-2">
      <h3 className="px-1 pb-2 text-xs font-medium text-muted-foreground">Elementos</h3>
      <div className="grid grid-cols-2 gap-1">
        {ELEMENT_TYPE_ORDER.map((type) => {
          const meta = ELEMENT_TYPE_META[type]
          const active = mode === "place" && placingType === type
          const Icon = meta.icon
          return (
            <Button
              key={type}
              variant="ghost"
              size="sm"
              className={cn("justify-start gap-2 px-2", active && "bg-secondary")}
              aria-pressed={active}
              onClick={() => (active ? editorStore.cancelPlacement() : editorStore.startPlacement(type))}
            >
              <Icon className="size-4 text-muted-foreground" />
              <span className="truncate">{ELEMENT_TYPE_LABELS[type]}</span>
            </Button>
          )
        })}
      </div>
    </section>
  )
}