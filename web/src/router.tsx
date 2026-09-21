import { createBrowserRouter, Navigate } from "react-router-dom"

import { AppShell } from "@/components/layout/AppShell"
import { ROUTES } from "@/config/routes"
import { AuditPage } from "@/pages/AuditPage"
import { CargoPage } from "@/pages/CargoPage"
import { DashboardPage } from "@/pages/DashboardPage"
import { LoginPage } from "@/pages/LoginPage"
import { MovementsPage } from "@/pages/MovementsPage"
import { NotFoundPage } from "@/pages/NotFoundPage"
import { OperationalMapPage } from "@/pages/OperationalMapPage"
import { QuarantinePage } from "@/pages/QuarantinePage"
import { ReportsPage } from "@/pages/ReportsPage"
import { ScalePage } from "@/pages/ScalePage"
import { ScannerPage } from "@/pages/ScannerPage"
import { SeizurePage } from "@/pages/SeizurePage"
import { SettingsPage } from "@/pages/SettingsPage"
import { TrucksPage } from "@/pages/TrucksPage"
import { WarehousePage } from "@/pages/WarehousePage"

/**
 * Route table (docs/ux/routes-and-components.md).
 *
 * Scaffold decision, recorded: the doc declares "/ → OperationalMap" as
 * the default route (Fase 11 spec). The scaffold lands on /dashboard and
 * realigns when auth + the operational map arrive; module detail routes
 * (:id) are registered now and completed by their phases.
 */
export const router = createBrowserRouter([
  { path: ROUTES.login, element: <LoginPage /> },
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to={ROUTES.dashboard} replace /> },
      { path: ROUTES.dashboard, element: <DashboardPage /> },
      { path: ROUTES.map, element: <OperationalMapPage /> },
      { path: ROUTES.trucks, element: <TrucksPage /> },
      { path: `${ROUTES.trucks}/:id`, element: <TrucksPage /> },
      { path: ROUTES.cargo, element: <CargoPage /> },
      { path: `${ROUTES.cargo}/:id`, element: <CargoPage /> },
      { path: ROUTES.warehouse, element: <WarehousePage /> },
      { path: `${ROUTES.warehouse}/:locationId`, element: <WarehousePage /> },
      { path: ROUTES.scanner, element: <ScannerPage /> },
      { path: ROUTES.scale, element: <ScalePage /> },
      { path: ROUTES.quarantine, element: <QuarantinePage /> },
      { path: `${ROUTES.quarantine}/:caseId`, element: <QuarantinePage /> },
      { path: ROUTES.seizure, element: <SeizurePage /> },
      { path: `${ROUTES.seizure}/:recordId`, element: <SeizurePage /> },
      { path: ROUTES.movements, element: <MovementsPage /> },
      { path: ROUTES.reports, element: <ReportsPage /> },
      { path: ROUTES.audit, element: <AuditPage /> },
      { path: ROUTES.settings, element: <SettingsPage /> },
      { path: ROUTES.notFound, element: <NotFoundPage /> },
    ],
  },
])