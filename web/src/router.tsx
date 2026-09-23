import type { ReactNode } from "react"
import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom"

import { RequireAuth } from "@/components/auth/RequireAuth"
import { RequirePermission } from "@/components/auth/RequirePermission"
import { AppShell } from "@/components/layout/AppShell"
import { PublicLayout } from "@/components/layout/PublicLayout"
import { Seo } from "@/components/seo/Seo"
import { ROUTES, ROUTE_PERMISSIONS } from "@/config/routes"

// Route pages are code-split (T18): each route downloads its page chunk on
// first navigation instead of one ~1.4 MB initial bundle. Named exports are
// mapped to the default shape React.lazy requires. The fallback stays tiny
// (spinner) so navigation never blocks paint on a heavy chunk.
const AboutPage = lazy(() => import("@/pages/AboutPage").then((m) => ({ default: m.AboutPage })))
const AuditPage = lazy(() => import("@/pages/AuditPage").then((m) => ({ default: m.AuditPage })))
const CargoPage = lazy(() => import("@/pages/CargoPage").then((m) => ({ default: m.CargoPage })))
const ContactPage = lazy(() => import("@/pages/ContactPage").then((m) => ({ default: m.ContactPage })))
const DashboardPage = lazy(() => import("@/pages/DashboardPage").then((m) => ({ default: m.DashboardPage })))
const ForbiddenPage = lazy(() => import("@/pages/ForbiddenPage").then((m) => ({ default: m.ForbiddenPage })))
const ForgotPasswordPage = lazy(() => import("@/pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })))
const HelpPage = lazy(() => import("@/pages/HelpPage").then((m) => ({ default: m.HelpPage })))
const LoginPage = lazy(() => import("@/pages/LoginPage").then((m) => ({ default: m.LoginPage })))
const MovementsPage = lazy(() => import("@/pages/MovementsPage").then((m) => ({ default: m.MovementsPage })))
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })))
const OperationalMapPage = lazy(() => import("@/pages/OperationalMapPage").then((m) => ({ default: m.OperationalMapPage })))
const QuarantinePage = lazy(() => import("@/pages/QuarantinePage").then((m) => ({ default: m.QuarantinePage })))
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })))
const ResetPasswordPage = lazy(() => import("@/pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })))
const ScalePage = lazy(() => import("@/pages/ScalePage").then((m) => ({ default: m.ScalePage })))
const ScannerPage = lazy(() => import("@/pages/ScannerPage").then((m) => ({ default: m.ScannerPage })))
const SeizurePage = lazy(() => import("@/pages/SeizurePage").then((m) => ({ default: m.SeizurePage })))
const SettingsPage = lazy(() => import("@/pages/SettingsPage").then((m) => ({ default: m.SettingsPage })))
const LayoutsPage = lazy(() => import("@/pages/settings/LayoutsPage").then((m) => ({ default: m.LayoutsPage })))
const LayoutEditorPage = lazy(() => import("@/pages/settings/LayoutEditorPage").then((m) => ({ default: m.LayoutEditorPage })))
const TrucksPage = lazy(() => import("@/pages/TrucksPage").then((m) => ({ default: m.TrucksPage })))
const WarehousePage = lazy(() => import("@/pages/WarehousePage").then((m) => ({ default: m.WarehousePage })))

function PageLoading() {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-muted-foreground">
      Cargando…
    </div>
  )
}

/** Wraps a lazy route element with its suspension boundary. */
function lazyElement(node: ReactNode) {
  return <Suspense fallback={<PageLoading />}>{node}</Suspense>
}

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
  // Router-root <Seo />: one head manager for EVERY route — index only
  // for routes declared in PUBLIC_SEO, fail-closed noindex otherwise
  // (T16). Pathless layout; children own all real paths.
  {
    element: (
      <>
        <Seo />
        <Outlet />
      </>
    ),
    children: [
      // Public pages (no session required): /about, /help, /contact.
      {
        element: <PublicLayout />,
        children: [
          { path: ROUTES.about, element: lazyElement(<AboutPage />) },
          { path: ROUTES.help, element: lazyElement(<HelpPage />) },
          { path: ROUTES.contact, element: lazyElement(<ContactPage />) },
        ],
      },
      { path: ROUTES.login, element: lazyElement(<LoginPage />) },
      { path: ROUTES.forgotPassword, element: lazyElement(<ForgotPasswordPage />) },
      { path: ROUTES.resetPassword, element: lazyElement(<ResetPasswordPage />) },
      { path: ROUTES.forbidden, element: lazyElement(<ForbiddenPage />) },
      {
        path: "/",
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
      { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
      { path: ROUTES.dashboard, element: lazyElement(<DashboardPage />) },
      {
        path: ROUTES.map,
        element: withModulePermission({ route: ROUTES.map, children: lazyElement(<OperationalMapPage />) }),
      },
      {
        path: ROUTES.trucks,
        element: withModulePermission({ route: ROUTES.trucks, children: lazyElement(<TrucksPage />) }),
      },
      {
        path: `${ROUTES.trucks}/:id`,
        element: withModulePermission({ route: ROUTES.trucks, children: lazyElement(<TrucksPage />) }),
      },
      {
        path: ROUTES.cargo,
        element: withModulePermission({ route: ROUTES.cargo, children: lazyElement(<CargoPage />) }),
      },
      {
        path: `${ROUTES.cargo}/:id`,
        element: withModulePermission({ route: ROUTES.cargo, children: lazyElement(<CargoPage />) }),
      },
      {
        path: ROUTES.warehouse,
        element: withModulePermission({ route: ROUTES.warehouse, children: lazyElement(<WarehousePage />) }),
      },
      {
        path: `${ROUTES.warehouse}/:locationId`,
        element: withModulePermission({ route: ROUTES.warehouse, children: lazyElement(<WarehousePage />) }),
      },
      {
        path: ROUTES.scanner,
        element: withModulePermission({ route: ROUTES.scanner, children: lazyElement(<ScannerPage />) }),
      },
      {
        path: ROUTES.scale,
        element: withModulePermission({ route: ROUTES.scale, children: lazyElement(<ScalePage />) }),
      },
      {
        path: ROUTES.quarantine,
        element: withModulePermission({
          route: ROUTES.quarantine,
          children: lazyElement(<QuarantinePage />),
        }),
      },
      {
        path: `${ROUTES.quarantine}/:caseId`,
        element: withModulePermission({
          route: ROUTES.quarantine,
          children: lazyElement(<QuarantinePage />),
        }),
      },
      {
        path: ROUTES.seizure,
        element: withModulePermission({ route: ROUTES.seizure, children: lazyElement(<SeizurePage />) }),
      },
      {
        path: `${ROUTES.seizure}/:recordId`,
        element: withModulePermission({ route: ROUTES.seizure, children: lazyElement(<SeizurePage />) }),
      },
      {
        path: ROUTES.movements,
        element: withModulePermission({ route: ROUTES.movements, children: lazyElement(<MovementsPage />) }),
      },
      {
        path: ROUTES.reports,
        element: withModulePermission({ route: ROUTES.reports, children: lazyElement(<ReportsPage />) }),
      },
      {
        path: ROUTES.audit,
        element: withModulePermission({ route: ROUTES.audit, children: lazyElement(<AuditPage />) }),
      },
      { path: ROUTES.settings, element: lazyElement(<SettingsPage />) },
      {
        path: ROUTES.layouts,
        element: withModulePermission({ route: ROUTES.layouts, children: lazyElement(<LayoutsPage />) }),
      },
      {
        path: ROUTES.layoutEditor,
        element: withModulePermission({ route: ROUTES.layoutEditor, children: lazyElement(<LayoutEditorPage />) }),
      },
      { path: ROUTES.notFound, element: lazyElement(<NotFoundPage />) },
      ],
      },
    ],
  },
])