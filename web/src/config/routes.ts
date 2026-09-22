import {
  AlertTriangleIcon,
  ArchiveIcon,
  ArrowRightLeftIcon,
  ClipboardListIcon,
  FileBarChartIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MapIcon,
  ScaleIcon,
  ScanLineIcon,
  SettingsIcon,
  ShieldCheckIcon,
  TruckIcon,
  type LucideIcon,
} from "lucide-react"

import type { PermissionCode } from "@/types"

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
  forgotPassword: "/auth/forgot-password",
  resetPassword: "/auth/reset-password",
  forbidden: "/403",
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
  layouts: "/settings/layouts",
  layoutEditor: "/settings/layouts/:id/edit",
  notFound: "*",
} as const

/**
 * Route → permission gate (UX only), from the shell guard table in
 * authentication.md §6. Security is ALWAYS re-enforced by RLS and Edge
 * Functions (authorization.md §3); this map only renders/hides.
 *
 * Decisions recorded (where the doc is explicit, the doc wins):
 * - dashboard → any authenticated session (doc: `any authenticated session`);
 *   the Fase 12 card rows are gated by their own read codes inside the page.
 * - /movements → cargo.read (movements belong to the cargo module; the doc
 *   gates Cargo screens with cargo.read).
 * - /scanner → scanner.create and /scale → scale.create per the doc's
 *   guard table ("Scanner station | scanner.create"; "Scale station |
 *   scale.create") — the stations are operation screens, not read-only
 *   lists. scanner.read/scale.read remain available for actions inside
 *   other modules.
 * - /reports → warehouse.read: the doc defines no report module gate yet;
 *   report screens compose operational reads, and warehouse.read is the
 *   lowest common denominator of the role matrix.
 * - /settings → any authenticated session (own profile); the doc gates
 *   `/settings/users` + RBAC screens with `has_role('admin')`, which the
 *   future admin screens will enforce individually inside the page.
 * - /settings/layouts (+ editor) → warehouse.read for browsing/viewing;
 *   writing (crear/publicar/restaurar/guardar) is gated INSIDE the pages
 *   with warehouse.configure (RLS: layouts INSERT/UPDATE). floor-plan
 *   versioning.md declares /planta; Fase 4/14 + the existing Settings
 *   flat-page shell win (documented tension, resolved at implementation).
 */
export const ROUTE_PERMISSIONS: Record<string, PermissionCode | undefined> = {
  [ROUTES.map]: "warehouse.read",
  [ROUTES.trucks]: "truck.read",
  [ROUTES.cargo]: "cargo.read",
  [ROUTES.warehouse]: "warehouse.read",
  [ROUTES.scanner]: "scanner.create",
  [ROUTES.scale]: "scale.create",
  [ROUTES.quarantine]: "quarantine.read",
  [ROUTES.seizure]: "seizure.read",
  [ROUTES.movements]: "cargo.read",
  [ROUTES.reports]: "warehouse.read",
  [ROUTES.audit]: "audit.read",
  [ROUTES.layouts]: "warehouse.read",
  [ROUTES.layoutEditor]: "warehouse.read",
}

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  /**
   * Exact match for the NavLink active state. Use when this path is a
   * prefix of another registered route (e.g. Configuración `/settings`
   * vs Planos `/settings/layouts`) so the parent is not highlighted
   * while a child route is active.
   */
  end?: boolean
  /** Documented in professional-ux.md §1 (global keyboard navigation). */
  keyshortcut?: string
  /**
   * UX gate (authentication.md §6). The sidebar hides items the user
   * cannot use — cosmetic only, RLS stays the authority.
   */
  permission?: PermissionCode
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
        permission: ROUTE_PERMISSIONS[ROUTES.map],
      },
      {
        label: "Camiones",
        path: ROUTES.trucks,
        icon: TruckIcon,
        keyshortcut: "Alt+Shift+2",
        permission: ROUTE_PERMISSIONS[ROUTES.trucks],
      },
      {
        label: "Cargamentos",
        path: ROUTES.cargo,
        icon: ClipboardListIcon,
        keyshortcut: "Alt+Shift+3",
        permission: ROUTE_PERMISSIONS[ROUTES.cargo],
      },
      {
        label: "Movimientos",
        path: ROUTES.movements,
        icon: ArrowRightLeftIcon,
        keyshortcut: "Alt+Shift+4",
        permission: ROUTE_PERMISSIONS[ROUTES.movements],
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
        permission: ROUTE_PERMISSIONS[ROUTES.scanner],
      },
      {
        label: "Balanza",
        path: ROUTES.scale,
        icon: ScaleIcon,
        permission: ROUTE_PERMISSIONS[ROUTES.scale],
      },
      {
        label: "Rezago",
        path: ROUTES.quarantine,
        icon: AlertTriangleIcon,
        permission: ROUTE_PERMISSIONS[ROUTES.quarantine],
      },
      {
        label: "Secuestro",
        path: ROUTES.seizure,
        icon: ShieldCheckIcon,
        permission: ROUTE_PERMISSIONS[ROUTES.seizure],
      },
      {
        label: "Reportes",
        path: ROUTES.reports,
        icon: FileBarChartIcon,
        permission: ROUTE_PERMISSIONS[ROUTES.reports],
      },
      {
        label: "Auditoría",
        path: ROUTES.audit,
        icon: ArchiveIcon,
        keyshortcut: "Alt+Shift+7",
        permission: ROUTE_PERMISSIONS[ROUTES.audit],
      },
      {
        label: "Planos",
        path: ROUTES.layouts,
        icon: LayersIcon,
        keyshortcut: "Alt+Shift+9",
        permission: ROUTE_PERMISSIONS[ROUTES.layouts],
      },
      {
        label: "Configuración",
        path: ROUTES.settings,
        icon: SettingsIcon,
        end: true,
      },
    ],
  },
]