import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Copy, Lock, Trash2 } from "lucide-react"
import { editorStore, useEditor } from "@/components/editor/editorStore"
import { ELEMENT_TYPE_LABELS, ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "cn"

/**
 * Layer list (docs/ux/floor-plan-editor.md §8): selectable, ordered by
 * z-index with reordering, duplicate and soft-delete actions.
 */
export function LayerPanel() {
  const elements = useEditor((s) => s.elements)
  const selection = useEditor((s) => s.selection)

  const visibles = elements
    .filter((el) => el.is_visible)
    .slice()
    .sort((a, b) => (a.z_index ?? 0) - (b.z_index ?? 0))

  return (
    <section aria-label="Capas" className="rounded-lg border bg-background p-2">
      <div className="flex items-center justify-between px-1 pb-2">
        <h3 className="text-xs font-medium text-muted-foreground">Capas</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{visibles.length}</span>
      </div>

      <ul className="max-h-64 space-y-0.5 overflow-y-auto pr-0.5">
        {visibles.map((el) => {
          const meta = ELEMENT_TYPE_META[el.element_type]
          const selected = selection.includes(el.id)
          const Icon = meta.icon
          return (
            <li
              key={el.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring",
                selected && "bg-secondary text-secondary-foreground",
              )}
              onClick={(event) => editorStore.select([el.id], event.shiftKey)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") editorStore.select([el.id])
              }}
            >
              <Icon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {el.name ?? el.code ?? ELEMENT_TYPE_LABELS[el.element_type]}
              </span>
              {el.is_locked ? (
                <Lock className="size-3 shrink-0 text-muted-foreground" aria-label="Bloqueado" />
              ) : null}
            </li>
          )
        })}
        {visibles.length === 0 ? (
          <li className="px-2 py-3 text-xs text-muted-foreground">Sin elementos visibles.</li>
        ) : null}
      </ul>

      <div className="mt-2 flex items-center gap-1 border-t pt-2">
        <LayerButton label="Traer al frente" disabled={selection.length === 0} onClick={() => editorStore.orderSelection("front")}>
          <ChevronsUp />
        </LayerButton>
        <LayerButton label="Traer adelante" disabled={selection.length === 0} onClick={() => editorStore.orderSelection("forward")}>
          <ArrowUp />
        </LayerButton>
        <LayerButton label="Enviar atrás" disabled={selection.length === 0} onClick={() => editorStore.orderSelection("backward")}>
          <ArrowDown />
        </LayerButton>
        <LayerButton label="Enviar al fondo" disabled={selection.length === 0} onClick={() => editorStore.orderSelection("back")}>
          <ChevronsDown />
        </LayerButton>
        <div className="mx-0.5 h-5 w-px bg-border" />
        <LayerButton label="Duplicar (Ctrl+D)" disabled={selection.length === 0} onClick={() => editorStore.duplicateSelection()}>
          <Copy />
        </LayerButton>
        <LayerButton label="Eliminar (Supr)" disabled={selection.length === 0} onClick={() => editorStore.deleteSelection()}>
          <Trash2 />
        </LayerButton>
      </div>
    </section>
  )
}

function LayerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button size="icon" variant="ghost" className="size-7" disabled={disabled} onClick={onClick} aria-label={label} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}