import type { ReactNode } from "react"
import { createBrowserRouter, Navigate } from "react-router-dom"

import { RequireAuth } from "@/components/auth/RequireAuth"
import { RequirePermission } from "@/components/auth/RequirePermission"
import { AppShell } from "@/components/layout/AppShell"
import { ROUTES, ROUTE_PERMISSIONS } from "@/config/routes"
import { AuditPage } from "@/pages/AuditPage"
import { CargoPage } from "@/pages/CargoPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { ForbiddenPage } from "@/pages/ForbiddenPage"
import { ForgotPasswordPage } from "@/pages/ForgotPasswordPage"
import { LoginPage } from "@/pages/LoginPage"
import { MovementsPage } from "@/pages/MovementsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { OperationalMapPage } from "@/pages/OperationalMapPage"
import { QuarantinePage } from "@/pages/QuarantinePage"
import { ReportsPage } from "@/pages/ReportsPage"
import { ResetPasswordPage } from "@/pages/ResetPasswordPage"
import { ScalePage } from "@/pages/ScalePage"
import { ScannerPage } from "@/pages/ScannerPage"
import { SeizurePage } from "@/pages/SeizurePage"
import { SettingsPage } from "@/pages/SettingsPage"
import { LayoutsPage } from "@/pages/settings/LayoutsPage"
import { LayoutEditorPage } from "@/pages/settings/LayoutEditorPage"
import { TrucksPage } from "@/pages/TrucksPage"
import { WarehousePage } from "@/pages/WarehousePage"

/**
 * Route table (docs/ux/routes-and-components.md) + guards
 * (docs/security/authentication.md §6).
 *
 * - Public: /login, /auth/forgot-password, /auth/reset-password, /403.
 * - The "/" shell requires an authenticated session; without one it
 *   redirects to /login?returnTo=<path>.
 * - Module children additionally require their route permission; the
 *   missing-permission case lands on /403 (standalone screen).
 * - Dashboard and settings accept any authenticated session
 *   (authentication.md §6; admin-only screens arrive with the admin
 *   phase and enforce has_role('admin') themselves).
 *
 * Scaffold decision, recorded: the doc declares "/ → OperationalMap" as
 * the default route (Fase 11 spec). The scaffold lands on /dashboard and
 * realigns when the operational map phase lands; module detail routes
 * (:id) are registered now and completed by their phases.
 */
function withModulePermission({ route, children }: { route: string; children: ReactNode }) {
  const permission = ROUTE_PERMISSIONS[route]
  if (!permission) return children
  return <RequirePermission permission={permission}>{children}</RequirePermission>
}

export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  { path: ROUTES.forgotPassword, element: <ForgotPasswordPage /> },
  { path: ROUTES.resetPassword, element: <ResetPasswordPage /> },
  { path: ROUTES.forbidden, element: <ForbiddenPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
      { path: ROUTES.dashboard, element: <DashboardPage /> },
      {
        path: ROUTES.map,
        element: withModulePermission({ route: ROUTES.map, children: <OperationalMapPage /> }),
      },
      {
        path: ROUTES.trucks,
        element: withModulePermission({ route: ROUTES.trucks, children: <TrucksPage /> }),
      },
      {
        path: `${ROUTES.trucks}/:id`,
        element: withModulePermission({ route: ROUTES.trucks, children: <TrucksPage /> }),
      },
      {
        path: ROUTES.cargo,
        element: withModulePermission({ route: ROUTES.cargo, children: <CargoPage /> }),
      },
      {
        path: `${ROUTES.cargo}/:id`,
        element: withModulePermission({ route: ROUTES.cargo, children: <CargoPage /> }),
      },
      {
        path: ROUTES.warehouse,
        element: withModulePermission({ route: ROUTES.warehouse, children: <WarehousePage /> }),
      },
      {
        path: `${ROUTES.warehouse}/:locationId`,
        element: withModulePermission({ route: ROUTES.warehouse, children: <WarehousePage /> }),
      },
      {
        path: ROUTES.scanner,
        element: withModulePermission({ route: ROUTES.scanner, children: <ScannerPage /> }),
      },
      {
        path: ROUTES.scale,
        element: withModulePermission({ route: ROUTES.scale, children: <ScalePage /> }),
      },
      {
        path: ROUTES.quarantine,
        element: withModulePermission({
          route: ROUTES.quarantine,
          children: <QuarantinePage />,
        }),
      },
      {
        path: `${ROUTES.quarantine}/:caseId`,
        element: withModulePermission({
          route: ROUTES.quarantine,
          children: <QuarantinePage />,
        }),
      },
      {
        path: ROUTES.seizure,
        element: withModulePermission({ route: ROUTES.seizure, children: <SeizurePage /> }),
      },
      {
        path: `${ROUTES.seizure}/:recordId`,
        element: withModulePermission({ route: ROUTES.seizure, children: <SeizurePage /> }),
      },
      {
        path: ROUTES.movements,
        element: withModulePermission({ route: ROUTES.movements, children: <MovementsPage /> }),
      },
      {
        path: ROUTES.reports,
        element: withModulePermission({ route: ROUTES.reports, children: <ReportsPage /> }),
      },
      {
        path: ROUTES.audit,
        element: withModulePermission({ route: ROUTES.audit, children: <AuditPage /> }),
      },
      { path: ROUTES.settings, element: <SettingsPage /> },
      {
        path: ROUTES.layouts,
        element: withModulePermission({ route: ROUTES.layouts, children: <LayoutsPage /> }),
      },
      {
        path: ROUTES.layoutEditor,
        element: withModulePermission({ route: ROUTES.layoutEditor, children: <LayoutEditorPage /> }),
      },
      { path: ROUTES.notFound, element: <NotFoundPage /> },
    ],
  },
])