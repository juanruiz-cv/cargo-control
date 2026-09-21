/**
 * Services factory — single entry point for the data layer.
 *
 * Adapter selection follows the environment contract (config/env.ts):
 *
 *   - VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set  → Supabase services
 *     (supabase-js against the migrated schema, RLS + permissions).
 *   - unset → DEMO adapter (dev only, in-memory, fake plates/data). A
 *     console.warn marks the switch; the demo is not production data.
 *
 * One `getServices()` instance is cached for the app lifetime — same as the
 * Supabase client singleton (integrations/supabase/client.ts).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { getSupabaseClient } from "@/integrations/supabase/client"
import { SupabaseAuditService } from "@/services/auditService"
import type { AuditService } from "@/services/auditService"
import type { AuthService } from "@/services/authService"
import { SupabaseAuthService } from "@/services/authService"
import type { CargoService } from "@/services/cargoService"
import { SupabaseCargoService } from "@/services/cargoService"
import type { DashboardService } from "@/services/dashboardService"
import { SupabaseDashboardService } from "@/services/dashboardService"
import { createDemoServices } from "@/services/demo/adapters"
import type { HoldService } from "@/services/holdService"
import { SupabaseHoldService } from "@/services/holdService"
import type { LocationService } from "@/services/locationService"
import { SupabaseLocationService } from "@/services/locationService"
import type { MovementService } from "@/services/movementService"
import { SupabaseMovementService } from "@/services/movementService"
import type { StationService } from "@/services/stationService"
import { SupabaseStationService } from "@/services/stationService"
import type { TruckService } from "@/services/truckService"
import { SupabaseTruckService } from "@/services/truckService"

export interface Services {
  auth: AuthService
  trucks: TruckService
  cargo: CargoService
  movements: MovementService
  locations: LocationService
  stations: StationService
  holds: HoldService
  audit: AuditService
  dashboard: DashboardService
}

export function createSupabaseServices(client: SupabaseClient): Services {
  return {
    auth: new SupabaseAuthService(client),
    trucks: new SupabaseTruckService(client),
    cargo: new SupabaseCargoService(client),
    movements: new SupabaseMovementService(client),
    locations: new SupabaseLocationService(client),
    stations: new SupabaseStationService(client),
    holds: new SupabaseHoldService(client),
    audit: new SupabaseAuditService(client),
    dashboard: new SupabaseDashboardService(client),
  }
}

let services: Services | null = null

export function getServices(): Services {
  if (services) return services

  const client = getSupabaseClient()
  if (client) {
    services = createSupabaseServices(client)
  } else {
    console.warn("DEMO data adapter active (no Supabase configured)")
    services = createDemoServices()
  }
  return services
}