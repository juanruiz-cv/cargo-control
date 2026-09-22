import { Maximize, Minus, Plus } from "lucide-react"
import { formatZoomPercent } from "@/lib/viewport"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export interface ZoomControlsProps {
  zoom: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  atMinZoom?: boolean
  atMaxZoom?: boolean
}

function ZoomButton({
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
      <TooltipTrigger render={<Button size="icon" disabled={disabled} onClick={onClick} aria-label={label} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

/** Floating zoom control for canvas maps (docs/ux/operational-map.md §7). */
export function ZoomControls({
  zoom,
  onZoomIn,
  onZoomOut,
  onFit,
  atMinZoom,
  atMaxZoom,
}: ZoomControlsProps) {
  return (
    <div className="flex items-center overflow-hidden rounded-lg border bg-background shadow-sm">
      <ZoomButton label="Alejar" disabled={atMinZoom} onClick={onZoomOut}>
        <Minus />
      </ZoomButton>
      <div
        aria-live="polite"
        className="min-w-14 border-x px-2 py-2 text-center text-xs font-medium tabular-nums"
      >
        {formatZoomPercent(zoom)}
      </div>
      <ZoomButton label="Acercar" disabled={atMaxZoom} onClick={onZoomIn}>
        <Plus />
      </ZoomButton>
      <div className="mx-0.5 h-5 w-px bg-border" />
      <ZoomButton label="Ajustar a pantalla" onClick={onFit}>
        <Maximize />
      </ZoomButton>
    </div>
  )
}