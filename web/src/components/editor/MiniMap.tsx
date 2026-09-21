import type { Viewport } from "@/lib/viewport"
import { useEditor } from "@/components/editor/editorStore"
import { ELEMENT_TYPE_META } from "@/components/map/shared/elementMeta"

/**
 * Mini overview of the floor plan (docs/ux/floor-plan-editor.md §6):
 * full-document thumbnails with the current viewport rectangle.
 */
export function MiniMap({ viewport, docWidth, docHeight }: { viewport: Viewport; docWidth: number; docHeight: number }) {
  const elements = useEditor((s) => s.elements)
  const selection = useEditor((s) => s.selection)

  const scale = Math.min(160 / Math.max(docWidth, 1), 110 / Math.max(docHeight, 1))
  const vw = docWidth * scale
  const vh = docHeight * scale

  const vpLeft = -viewport.x / viewport.zoom * scale
  const vpTop = -viewport.y / viewport.zoom * scale
  const vpWidth = (docWidth / viewport.zoom) * scale
  const vpHeight = (docHeight / viewport.zoom) * scale

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute right-3 bottom-3 overflow-hidden rounded-lg border bg-background/95 shadow-sm"
      style={{ width: vw + 8, height: vh + 8, padding: 4 }}
    >
      <svg width={vw} height={vh} role="presentation">
        {elements
          .filter((el) => el.is_visible)
          .map((el) => {
            const meta = ELEMENT_TYPE_META[el.element_type]
            const selected = selection.includes(el.id)
            return (
              <rect
                key={el.id}
                x={el.x * scale}
                y={el.y * scale}
                width={Math.max((el.visual_width ?? meta.defaultWidth) * scale, 1.5)}
                height={Math.max((el.visual_height ?? meta.defaultHeight) * scale, 1.5)}
                fill={el.color ?? meta.color}
                stroke={selected ? "#1F4E5F" : "rgb(100 116 139 / 0.7)"}
                strokeWidth={selected ? 1 : 0.5}
              />
            )
          })}
        <rect
          x={vpLeft}
          y={vpTop}
          width={Math.max(vpWidth, 4)}
          height={Math.max(vpHeight, 4)}
          fill="rgb(31 78 95 / 0.08)"
          stroke="#1F4E5F"
          strokeWidth={1}
          strokeDasharray="3 2"
        />
      </svg>
    </div>
  )
}