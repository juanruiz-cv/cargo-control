/**
 * Location service — physical locations + derived occupancy (ADR 0004/0006).
 *
 * Occupancy is NEVER stored: it is read from the location_occupancy view
 * (0005_views.sql v3), which derives it from item_lots. Capacity edits go
 * through warehouse.configure only (0004_rls.sql location_update; the
 * locations_capacity_guard trigger rejects reductions below current
 * occupancy and the capacity_audit trigger logs every accepted change with
 * action 'capacity.set' — audit.md).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { LOCATION_COLUMNS, LOCATION_OCCUPANCY_COLUMNS } from "@/services/columns"
import type { LocationFiltros } from "@/services/shared"
import type { CapacityUpdate, LocationOccupancyRow, LocationRow } from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

function applyWindow<T>(query: { range: (start: number, end: number) => T }, filtros?: { limit?: number; offset?: number }): T {
  const limit = Math.min(filtros?.limit ?? 500, 2000)
  const offset = filtros?.offset ?? 0
  return query.range(offset, offset + limit - 1)
}

export interface LocationService {
  /** Playón / galpón / sectores / checkpoints de una facilidad (mapa operativo). */
  listarLocations(filtros?: LocationFiltros): Promise<LocationRow[]>
  /** Derived occupancy per location (view v3) — optional facility scope. */
  obtenerOcupacion(facilidadId?: string): Promise<LocationOccupancyRow[]>
  /** Capacity edit (warehouse.configure; guard + audit triggers fire). */
  actualizarCapacidad(locationId: string, cambios: CapacityUpdate): Promise<LocationRow>
}

export class SupabaseLocationService implements LocationService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  async listarLocations(filtros?: LocationFiltros): Promise<LocationRow[]> {
    const client = requireClient(this.client)
    let query = client.from("locations").select(LOCATION_COLUMNS)

    if (filtros?.facilidadId) query = query.eq("facility_id", filtros.facilidadId)
    if (filtros?.tipo) query = query.eq("type", filtros.tipo)
    if (filtros?.checkpoint) query = query.eq("checkpoint_kind", filtros.checkpoint)
    if (filtros?.activo !== undefined) query = query.eq("active", filtros.activo)

    query = query.order("code", { ascending: true })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`locations: ${error.message}`)
    return (data ?? []) as LocationRow[]
  }

  async obtenerOcupacion(facilidadId?: string): Promise<LocationOccupancyRow[]> {
    const client = requireClient(this.client)
    let query = client.from("location_occupancy").select(LOCATION_OCCUPANCY_COLUMNS)
    if (facilidadId) query = query.eq("facility_id", facilidadId)
    query = query.order("code", { ascending: true })

    const { data, error } = await query
    if (error) throw new Error(`location_occupancy: ${error.message}`)
    return (data ?? []) as LocationOccupancyRow[]
  }

  async actualizarCapacidad(locationId: string, cambios: CapacityUpdate): Promise<LocationRow> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("locations")
      .update({
        ...(cambios.capacity_max_units !== undefined ? { capacity_max_units: cambios.capacity_max_units } : {}),
        ...(cambios.capacity_max_kg !== undefined ? { capacity_max_kg: cambios.capacity_max_kg } : {}),
        ...(cambios.capacity_max_volume_m3 !== undefined ? { capacity_max_volume_m3: cambios.capacity_max_volume_m3 } : {}),
      })
      .eq("id", locationId)
      .select(LOCATION_COLUMNS)
      .single()
    if (error) throw new Error(`locations capacity update ${locationId}: ${error.message}`)
    return data as LocationRow
  }
}