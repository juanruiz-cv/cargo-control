/**
 * Truck service — fleet module (Fase 7, ADR 0008).
 *
 * Entry/exit are NOT timestamp columns: they are `arrival`/`egress`
 * movements on the append-only spine (0001_schema.sql note + entities.md),
 * so registrarEntrada/registrarSalida delegate to the movement service and
 * then apply the documented base-status/rollup touches:
 *
 *   - arrival  → truck.status 'in_playon', manifest → 'in_playon',
 *                cargo_items pending → on_truck (states.md cargo_item §pending)
 *   - egress   → truck.status 'in_route'
 *
 * The authoritative state transitions belong to the server-side engine
 * (engine path supersedes this provisional client update sequence); here
 * they keep the dev/demo experience coherent under RLS.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { TRUCK_COLUMNS, MANIFEST_COLUMNS } from "@/services/columns"
import { SupabaseMovementService } from "@/services/movementService"
import type { MovementExecutionInput, TruckFiltros } from "@/services/shared"
import type { CargoManifestStatus, MovementRow, CargoManifestRow, TruckInsert, TruckRow, TruckUpdate } from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

function applyWindow<T>(query: { range: (start: number, end: number) => T }, filtros?: { limit?: number; offset?: number }): T {
  const limit = Math.min(filtros?.limit ?? 100, 500)
  const offset = filtros?.offset ?? 0
  return query.range(offset, offset + limit - 1)
}

export interface TruckService {
  listar(filtros?: TruckFiltros): Promise<TruckRow[]>
  obtener(id: string): Promise<TruckRow | null>
  crear(datos: TruckInsert): Promise<TruckRow>
  actualizar(id: string, cambios: TruckUpdate): Promise<TruckRow>
  /** Truck entry: 'arrival' movement + base-status/rollup touches (ADR 0008). */
  registrarEntrada(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow>
  /** Truck exit: 'egress' movement (truck.exit; admin/supervisor per rbac.md). */
  registrarSalida(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow>
}

export class SupabaseTruckService implements TruckService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.movements = new SupabaseMovementService(client)
  }

  async listar(filtros?: TruckFiltros): Promise<TruckRow[]> {
    const client = requireClient(this.client)
    let query = client.from("trucks").select(TRUCK_COLUMNS)

    if (filtros?.estado) query = query.eq("status", filtros.estado)
    if (filtros?.companiaId) query = query.eq("transport_company_id", filtros.companiaId)
    if (filtros?.buscar) query = query.ilike("plate", `%${filtros.buscar}%`)

    query = query.order("plate", { ascending: true })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`trucks: ${error.message}`)
    return (data ?? []) as TruckRow[]
  }

  async obtener(id: string): Promise<TruckRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("trucks")
      .select(TRUCK_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(`truck ${id}: ${error.message}`)
    return (data as TruckRow | null) ?? null
  }

  async crear(datos: TruckInsert): Promise<TruckRow> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("trucks")
      .insert({
        transport_company_id: datos.transport_company_id ?? null,
        plate: datos.plate,
        capacity_kg: datos.capacity_kg ?? null,
        status: datos.status ?? "available",
      })
      .select(TRUCK_COLUMNS)
      .single()
    if (error) throw new Error(`trucks insert: ${error.message}`)
    return data as TruckRow
  }

  async actualizar(id: string, cambios: TruckUpdate): Promise<TruckRow> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("trucks")
      .update({
        ...(cambios.transport_company_id !== undefined ? { transport_company_id: cambios.transport_company_id } : {}),
        ...(cambios.plate !== undefined ? { plate: cambios.plate } : {}),
        ...(cambios.capacity_kg !== undefined ? { capacity_kg: cambios.capacity_kg } : {}),
        ...(cambios.status !== undefined ? { status: cambios.status } : {}),
      })
      .eq("id", id)
      .select(TRUCK_COLUMNS)
      .single()
    if (error) throw new Error(`trucks update ${id}: ${error.message}`)
    return data as TruckRow
  }

  async registrarEntrada(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: manifest, error: mError } = await client
      .from("cargo_manifests")
      .select(MANIFEST_COLUMNS)
      .eq("id", manifestId)
      .maybeSingle()
    if (mError) throw new Error(`manifest ${manifestId}: ${mError.message}`)
    if (!manifest) throw new Error(`Manifest ${manifestId} no encontrado`)
    const m = manifest as CargoManifestRow

    const movement = await this.movements.crearMovimiento({
      kind: "arrival",
      manifestId,
      facilityId: m.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo,
    })

    // Provisional rollup touches (documented in the header): the server
    // engine owns these transitions; RLS permits them under cargo.update.
    const manifestUpdate: { status: CargoManifestStatus } = { status: "in_playon" }
    const { error: manifestError } = await client
      .from("cargo_manifests")
      .update(manifestUpdate)
      .eq("id", manifestId)
    if (manifestError) throw new Error(`manifest rollup ${manifestId}: ${manifestError.message}`)

    if (manifest.truck_id) {
      const { error: truckError } = await client
        .from("trucks")
        .update({ status: "in_playon" })
        .eq("id", manifest.truck_id)
      if (truckError) throw new Error(`truck rollup ${manifest.truck_id}: ${truckError.message}`)
    }

    const { error: itemsError } = await client
      .from("cargo_items")
      .update({ status: "on_truck" })
      .eq("manifest_id", manifestId)
      .eq("status", "pending")
    if (itemsError) throw new Error(`items rollup ${manifestId}: ${itemsError.message}`)

    return movement
  }

  async registrarSalida(manifestId: string, input?: MovementExecutionInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: manifest, error: mError } = await client
      .from("cargo_manifests")
      .select(MANIFEST_COLUMNS)
      .eq("id", manifestId)
      .maybeSingle()
    if (mError) throw new Error(`manifest ${manifestId}: ${mError.message}`)
    if (!manifest) throw new Error(`Manifest ${manifestId} no encontrado`)
    const m = manifest as CargoManifestRow

    const movement = await this.movements.crearMovimiento({
      kind: "egress",
      manifestId,
      facilityId: m.facility_id,
      operatorId: input?.operatorId ?? null,
      ocurridoEn: input?.ocurridoEn,
      operationKey: input?.operationKey,
      motivo: input?.motivo, // egress is a sensitive kind: reason recommended
    })

    if (manifest.truck_id) {
      const { error: truckError } = await client
        .from("trucks")
        .update({ status: "in_route" })
        .eq("id", manifest.truck_id)
      if (truckError) throw new Error(`truck rollup ${manifest.truck_id}: ${truckError.message}`)
    }

    return movement
  }
}