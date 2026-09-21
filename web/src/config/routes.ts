import {
  AlertTriangleIcon,
  ArchiveIcon,
  ArrowRightLeftIcon,
  ClipboardListIcon,
  FileBarChartIcon,
  LayoutDashboardIcon,
  MapIcon,
  ScaleIcon,
  ScanLineIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react"

/**
 * Single source of truth for routes and navigation.
 *
 * Route paths follow docs/ux/routes-and-components.md. Detail routes
 * (/:id) are registered for the documented param shapes and will be
 * completed by their module phases.
 *
 * Known doc tensions (recorded, not silently resolved):
 * - special-areas.md declares /areas/scanner|balanza|rezago|secuestro;
 *   routes-and-components.md (the canonical route home) declares
 *   /scanner|scale|quarantine|seizure. The canonical list wins for the
 *   shell nav; revisit when the special-areas phase lands.
 * - /warehouse (galpón) stays registered per the route map but is not in
 *   the sidebar scaffold list; its phase decides placement.
 */
export const ROUTES = {
  login: "/login",
  dashboard: "/dashboard",
  map: "/map",
  trucks: "/trucks",
  cargo: "/cargo",
  warehouse: "/warehouse",
  scanner: "/scanner",
  scale: "/scale",
  quarantine: "/quarantine",
  seizure: "/seizure",
  movements: "/movements",
  reports: "/reports",
  audit: "/audit",
  settings: "/settings",
  notFound: "*",
} as const

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /** Documented in professional-ux.md §1 (global keyboard navigation). */
  keyshortcut?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

/**
 * Sidebar composition (professional-ux.md §1: Operación / Control groups).
 * Item list as ordered by the scaffold brief.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operación",
    items: [
      {
        label: "Dashboard",
        path: ROUTES.dashboard,
        icon: LayoutDashboardIcon,
        keyshortcut: "Alt+Shift+1",
      },
      {
        label: "Mapa Operativo",
        path: ROUTES.map,
        icon: MapIcon,
        keyshortcut: "Alt+Shift+6",
      },
      {
        label: "Camiones",
        path: ROUTES.trucks,
        icon: TruckIcon,
        keyshortcut: "Alt+Shift+2",
      },
      {
        label: "Cargamentos",
        path: ROUTES.cargo,
        icon: ClipboardListIcon,
        keyshortcut: "Alt+Shift+3",
      },
      {
        label: "Movimientos",
        path: ROUTES.movements,
        icon: ArrowRightLeftIcon,
        keyshortcut: "Alt+Shift+4",
      },
    ],
  },
  {
    label: "Control",
    items: [
      {
        label: "Scanner",
        path: ROUTES.scanner,
        icon: ScanLineIcon,
        keyshortcut: "Alt+Shift+8",
      },
      {
        label: "Balanza",
        path: ROUTES.scale,
        icon: ScaleIcon,
      },
      {
        label: "Rezago",
        path: ROUTES.quarantine,
        icon: AlertTriangleIcon,
      },
      {
        label: "Secuestro",
        path: ROUTES.seizure,
        icon: ShieldCheckIcon,
      },
      {
        label: "Reportes",
        path: ROUTES.reports,
        icon: FileBarChartIcon,
      },
      {
        label: "Auditoría",
        path: ROUTES.audit,
        icon: ArchiveIcon,
        keyshortcut: "Alt+Shift+7",
      },
      {
        label: "Configuración",
        path: ROUTES.settings,
        icon: SettingsIcon,
      },
    ],
  },
]