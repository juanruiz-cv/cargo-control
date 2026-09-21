import { useMemo } from "react"
import { Minus, MoveRight, Plus } from "lucide-react"

import { ELEMENT_TYPE_LABELS } from "@/components/map/shared/elementMeta"
import type {
  LayoutDiff,
  LayoutDiffElementoRef,
  LayoutDiffField,
  LayoutDiffValue,
} from "@/services/layoutService"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

const CAMPO_LABELS: Record<LayoutDiffField, string> = {
  x: "Posición X",
  y: "Posición Y",
  width: "Ancho",
  height: "Alto",
  rotation: "Rotación",
  color: "Color",
  icon: "Icono",
  label: "Etiqueta",
  is_visible: "Visible",
  location_id: "Ubicación",
}

function formatoValor(valor: LayoutDiffValue): string {
  if (valor === null) return "—"
  if (typeof valor === "boolean") return valor ? "sí" : "no"
  return String(valor)
}

/**
 * Read-only diff renderer (floor-plan-versioning.md §Visual history /
 * §Compare versions). Used by the compare dialog and by the publish
 * confirmation preview. Same file as the editor because the diff is
 * layout-editor matter; it never fetches anything — the service returns
 * the already-computed diff.
 */
export function LayoutDiffTable({ diff }: { diff: LayoutDiff }) {
  const refPorId = useMemo(() => new Map(diff.elementos.map((r) => [r.element_id, r])), [diff])
  const etiqueta = (ref: LayoutDiffElementoRef | undefined, elementId: string): string =>
    ref ? (ref.nombre ?? ELEMENT_TYPE_LABELS[ref.element_type]) : elementId

  const sinDiferencias = diff.counts.added === 0 && diff.counts.removed === 0 && diff.counts.changed === 0

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          v{diff.from_version} → v{diff.to_version}
        </span>
        {diff.counts.added > 0 ? (
          <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
            +{diff.counts.added} agregado{diff.counts.added === 1 ? "" : "s"}
          </Badge>
        ) : null}
        {diff.counts.removed > 0 ? (
          <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700">
            −{diff.counts.removed} eliminado{diff.counts.removed === 1 ? "" : "s"}
          </Badge>
        ) : null}
        {diff.counts.changed > 0 ? (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700">
            {diff.counts.changed} campo{diff.counts.changed === 1 ? "" : "s"} modificado{diff.counts.changed === 1 ? "" : "s"}
          </Badge>
        ) : null}
      </div>

      {sinDiferencias ? (
        <p className="text-sm text-muted-foreground">Sin diferencias entre v{diff.from_version} y v{diff.to_version}.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Elemento</TableHead>
              <TableHead>Cambio</TableHead>
              <TableHead>Detalle</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {diff.added.map((item) => {
              const ref = refPorId.get(item.element_id)
              return (
                <TableRow key={`added-${item.element_id}`}>
                  <TableCell className="font-medium">{etiqueta(ref, item.element_id)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700">
                      <Plus className="size-3" />
                      Agregado
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                </TableRow>
              )
            })}
            {diff.removed.map((item) => {
              const ref = refPorId.get(item.element_id)
              return (
                <TableRow key={`removed-${item.element_id}`}>
                  <TableCell className="font-medium">{etiqueta(ref, item.element_id)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-700">
                      <Minus className="size-3" />
                      Eliminado
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">—</TableCell>
                </TableRow>
              )
            })}
            {diff.changed.map((item) => {
              const ref = refPorId.get(item.element_id)
              return (
                <TableRow key={`changed-${item.element_id}-${item.field}`}>
                  <TableCell className="font-medium">{etiqueta(ref, item.element_id)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-700">
                      <MoveRight className="size-3" />
                      {CAMPO_LABELS[item.field]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {formatoValor(item.before)} → {formatoValor(item.after)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}