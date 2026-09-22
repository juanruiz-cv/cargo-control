import {
  Box,
  Boxes,
  DoorOpen,
  Lock,
  Route,
  Scale,
  ScanLine,
  ShieldAlert,
  Truck,
  Warehouse,
  type LucideIcon,
} from "lucide-react"
import type { LayoutElementType } from "@/types"

/** Labels in Spanish for the ADR 0005 taxonomy (single source for maps/editor). */
export const ELEMENT_TYPE_LABELS: Record<LayoutElementType, string> = {
  playon: "Playón",
  warehouse: "Galpón",
  storage: "Sector",
  scanner: "Scanner",
  scale: "Báscula",
  quarantine: "Rezago",
  seizure: "Secuestro",
  corridor: "Circulación",
  door: "Puerta",
  other: "Otro",
}

/**
 * Presentation metadata per layout element type.
 *
 * Colors come exclusively from the design-token palette (config/tokens.ts)
 * — never invented hues. Fills render at a soft alpha on canvas; the
 * operational status (estadoOperativo.ts) is layered on top as stroke +
 * badge, so a "secuestro" house stays distinguishable from a BLOQUEADO
 * state of any other place.
 */
export interface ElementTypeMeta {
  labelEs: string
  icon: LucideIcon
  defaultWidth: number
  defaultHeight: number
  color: string
  esLugar: boolean
}

const TOKENS = {
  warehouse: "#F5F0D6",
  warehouseArea: "#E1BA84",
  playon: "#D5D7D8",
  border: "#CBD5E1",
  blocked: "#7C3AED",
}

export const ELEMENT_TYPE_META: Record<LayoutElementType, ElementTypeMeta> = {
  playon: {
    labelEs: ELEMENT_TYPE_LABELS.playon,
    icon: Truck,
    defaultWidth: 420,
    defaultHeight: 40,
    color: TOKENS.playon,
    esLugar: true,
  },
  warehouse: {
    labelEs: ELEMENT_TYPE_LABELS.warehouse,
    icon: Warehouse,
    defaultWidth: 120,
    defaultHeight: 80,
    color: TOKENS.warehouse,
    esLugar: true,
  },
  storage: {
    labelEs: ELEMENT_TYPE_LABELS.storage,
    icon: Boxes,
    defaultWidth: 92,
    defaultHeight: 86,
    color: TOKENS.warehouse,
    esLugar: true,
  },
  scanner: {
    labelEs: ELEMENT_TYPE_LABELS.scanner,
    icon: ScanLine,
    defaultWidth: 56,
    defaultHeight: 56,
    color: TOKENS.warehouseArea,
    esLugar: true,
  },
  scale: {
    labelEs: ELEMENT_TYPE_LABELS.scale,
    icon: Scale,
    defaultWidth: 56,
    defaultHeight: 56,
    color: TOKENS.warehouseArea,
    esLugar: true,
  },
  quarantine: {
    labelEs: ELEMENT_TYPE_LABELS.quarantine,
    icon: ShieldAlert,
    defaultWidth: 92,
    defaultHeight: 86,
    color: TOKENS.warehouseArea,
    esLugar: true,
  },
  seizure: {
    labelEs: ELEMENT_TYPE_LABELS.seizure,
    icon: Lock,
    defaultWidth: 92,
    defaultHeight: 86,
    color: TOKENS.blocked,
    esLugar: true,
  },
  corridor: {
    labelEs: ELEMENT_TYPE_LABELS.corridor,
    icon: Route,
    defaultWidth: 60,
    defaultHeight: 20,
    color: TOKENS.border,
    esLugar: false,
  },
  door: {
    labelEs: ELEMENT_TYPE_LABELS.door,
    icon: DoorOpen,
    defaultWidth: 20,
    defaultHeight: 8,
    color: TOKENS.border,
    esLugar: false,
  },
  other: {
    labelEs: ELEMENT_TYPE_LABELS.other,
    icon: Box,
    defaultWidth: 48,
    defaultHeight: 48,
    color: TOKENS.playon,
    esLugar: false,
  },
}

/** Pick order for the element palette in the editor ("Otros" last). */
export const ELEMENT_TYPE_ORDER: LayoutElementType[] = [
  "playon",
  "warehouse",
  "storage",
  "scanner",
  "scale",
  "quarantine",
  "seizure",
  "corridor",
  "door",
  "other",
]