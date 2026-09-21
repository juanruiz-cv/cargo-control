/**
 * Cargo service — manifests, items, lots (Fase 8, ADR 0009 / ADR 0003).
 *
 * IMPORTANT (documented deviation, engine dependency):
 *
 *   - `crearItem`, `transferItem` and `descargar` are quantity-preserving,
 *     so the provisional REST path is safe under RLS: each statement keeps
 *     Σ leaf lot quantities = total_quantity.
 *   - `splitItem` CHANGES quantities across two rows (parent reduced +
 *     child created). The ADR 0003 balance trigger is DEFERRABLE INITIALLY
 *     DEFERRED (0006_triggers.sql): it verifies at COMMIT, and every REST
 *     request commits alone — so a parent-only update or child-only insert
 *     violates the invariant and is rejected. Splits are transactional BY
 *     DESIGN and therefore EXPLICITLY run in the server-side engine
 *     (movement-engine.md §Transactional). The Supabase implementation
 *     validates the request and reports the engine dependency with a clear
 *     error instead of pretending REST can do it; the DEMO adapter
 *     implements the full split in memory (dev only).
 *
 * Manifest status is a rollup (flows.md): reads only, never set by the
 * client in production paths.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  CARGO_ITEM_COLUMNS,
  ITEM_LOT_COLUMNS,
  MANIFEST_COLUMNS,
} from "@/services/columns"
import { SupabaseMovementService } from "@/services/movementService"
import type { ManifestFiltros, MovementExecutionInput } from "@/services/shared"
import type {
  CargoItemInsert,
  CargoItemRow,
  CargoManifestRow,
  ItemLotRow,
  ManifestInsert,
  MovementRow,
} from "@/types"

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

/** Manifest + items (each with its lots) + per-manifest timeline. */
export interface ManifestDetail {
  manifest: CargoManifestRow
  items: CargoItemDetail[]
  movements: MovementRow[]
}

/** Item plus its lots (a lot is the traceability quantum, ADR 0003). */
export interface CargoItemDetail {
  item: CargoItemRow
  lots: ItemLotRow[]
}

export interface SplitItemInput extends MovementExecutionInput {
  itemLotId: string
  cantidad: number
  destinoLocationId?: string | null
  notas?: string | null
}

export interface TransferItemInput extends MovementExecutionInput {
  itemLotId: string
  cantidad?: number // default: full lot
  destinoLocationId: string
  notas?: string | null
}

export interface DescargaInput extends MovementExecutionInput {
  manifestId: string
  destinoLocationId: string
  notas?: string | null
}

export interface CargoService {
  listarManifests(filtros?: ManifestFiltros): Promise<CargoManifestRow[]>
  obtenerManifest(id: string): Promise<ManifestDetail | null>
  crearManifest(datos: ManifestInsert): Promise<CargoManifestRow>
  listarItems(manifestId: string): Promise<CargoItemRow[]>
  /** Creates the item AND its initial full-quantity lot (on the manifest truck). */
  crearItem(manifestId: string, datos: CargoItemInsert): Promise<CargoItemDetail>
  /**
   * Splits a lot into a child lot. Server-side transactional engine ONLY:
   * rejected under REST by the deferred ADR 0003 balance trigger (see file
   * header). Validates inputs and reports the engine dependency.
   */
  splitItem(input: SplitItemInput): Promise<MovementRow>
  /** Transfer location ⟷ location; quantity-preserving (safe under REST). */
  transferItem(input: TransferItemInput): Promise<MovementRow>
  /** Discharge: all on_truck lots of a manifest → destination location. */
  descargar(input: DescargaInput): Promise<MovementRow>
}

export class SupabaseCargoService implements CargoService {
  private readonly client: SupabaseClient | null
  private readonly movements: SupabaseMovementService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.movements = new SupabaseMovementService(client)
  }

  async listarManifests(filtros?: ManifestFiltros): Promise<CargoManifestRow[]> {
    const client = requireClient(this.client)
    let query = client.from("cargo_manifests").select(MANIFEST_COLUMNS)

    if (filtros?.estado) query = query.eq("status", filtros.estado)
    if (filtros?.facilidadId) query = query.eq("facility_id", filtros.facilidadId)
    if (filtros?.camionId) query = query.eq("truck_id", filtros.camionId)
    if (filtros?.since) query = query.gte("created_at", filtros.since)
    if (filtros?.until) query = query.lt("created_at", filtros.until)

    query = query.order("created_at", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`cargo_manifests: ${error.message}`)
    return (data ?? []) as CargoManifestRow[]
  }

  async obtenerManifest(id: string): Promise<ManifestDetail | null> {
    const client = requireClient(this.client)
    const { data: manifest, error: manifestError } = await client
      .from("cargo_manifests")
      .select(MANIFEST_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (manifestError) throw new Error(`cargo_manifest ${id}: ${manifestError.message}`)
    if (!manifest) return null

    const { data: items } = await client
      .from("cargo_items")
      .select(CARGO_ITEM_COLUMNS)
      .eq("manifest_id", id)
      .order("line_number", { ascending: true })
    const itemRows = (items ?? []) as CargoItemRow[]

    const itemDetails = await Promise.all(
      itemRows.map(async (item) => {
        const { data: lots } = await client
          .from("item_lots")
          .select(ITEM_LOT_COLUMNS)
          .eq("cargo_item_id", item.id)
        return { item, lots: (lots ?? []) as ItemLotRow[] }
      }),
    )

    const movements = await this.movements.listarMovimientos({ manifestId: id })

    return { manifest: manifest as CargoManifestRow, items: itemDetails, movements }
  }

  async crearManifest(datos: ManifestInsert): Promise<CargoManifestRow> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("cargo_manifests")
      .insert({
        facility_id: datos.facility_id,
        code: datos.code,
        truck_id: datos.truck_id ?? null,
        driver_id: datos.driver_id ?? null,
        transport_company_id: datos.transport_company_id ?? null,
        shipper_party_id: datos.shipper_party_id ?? null,
        client_party_id: datos.client_party_id ?? null,
        origin: datos.origin ?? null,
        destination: datos.destination ?? null,
        expected_weight_kg: datos.expected_weight_kg ?? null,
        arrival_date: datos.arrival_date ?? null,
        departure_date: datos.departure_date ?? null,
        notes: datos.notes ?? null,
        created_by: datos.created_by ?? null,
      })
      .select(MANIFEST_COLUMNS)
      .single()
    if (error) throw new Error(`cargo_manifests insert: ${error.message}`)
    return data as CargoManifestRow
  }

  async listarItems(manifestId: string): Promise<CargoItemRow[]> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("cargo_items")
      .select(CARGO_ITEM_COLUMNS)
      .eq("manifest_id", manifestId)
      .order("line_number", { ascending: true })
    if (error) throw new Error(`cargo_items ${manifestId}: ${error.message}`)
    return (data ?? []) as CargoItemRow[]
  }

  async crearItem(manifestId: string, datos: CargoItemInsert): Promise<CargoItemDetail> {
    const client = requireClient(this.client)
    const { data: manifest, error: manifestError } = await client
      .from("cargo_manifests")
      .select("id, truck_id")
      .eq("id", manifestId)
      .maybeSingle()
    if (manifestError) throw new Error(`cargo_manifest ${manifestId}: ${manifestError.message}`)
    if (!manifest) throw new Error(`Manifest ${manifestId} no encontrado`)

    const { data: item, error: itemError } = await client
      .from("cargo_items")
      .insert({
        manifest_id: manifestId,
        line_number: datos.line_number,
        sku: datos.sku ?? null,
        description: datos.description,
        category: datos.category ?? null,
        total_quantity: datos.total_quantity,
        uom: datos.uom ?? "unit",
        unit_weight_kg: datos.unit_weight_kg ?? null,
        unit_volume_m3: datos.unit_volume_m3 ?? null,
        observations: datos.observations ?? null,
      })
      .select(CARGO_ITEM_COLUMNS)
      .single()
    if (itemError) throw new Error(`cargo_items insert: ${itemError.message}`)

    // Initial lot = full quantity on the manifest truck (states.md §cargo_item:
    // pending → on_truck after arrival; the invariant needs a lot at all times).
    // PLACEMENT NOTE: an unplaced lot (null location AND null truck) is legal
    // for the balance trigger; the truck placement is set when known.
    const { data: lot, error: lotError } = await client
      .from("item_lots")
      .insert({
        manifest_id: manifestId,
        cargo_item_id: (item as CargoItemRow).id,
        quantity: datos.total_quantity,
        uom: datos.uom ?? "unit",
        status: manifest.truck_id ? "on_truck" : "discharged",
        current_truck_id: (manifest.truck_id as string | null) ?? null,
        unit_weight_kg: datos.unit_weight_kg ?? null,
        unit_volume_m3: datos.unit_volume_m3 ?? null,
      })
      .select(ITEM_LOT_COLUMNS)
      .single()
    if (lotError) throw new Error(`item_lots insert: ${lotError.message}`)

    return { item: item as CargoItemRow, lots: [lot as ItemLotRow] }
  }

  async splitItem(input: SplitItemInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    if (!(input.cantidad > 0)) throw new Error("La cantidad del split debe ser mayor a 0")
    if (!input.itemLotId) throw new Error("itemLotId es requerido")

    const { data: lot, error: lotError } = await client
      .from("item_lots")
      .select(ITEM_LOT_COLUMNS)
      .eq("id", input.itemLotId)
      .maybeSingle()
    if (lotError) throw new Error(`item_lot ${input.itemLotId}: ${lotError.message}`)
    if (!lot) throw new Error(`Lote ${input.itemLotId} no encontrado`)
    const parent = lot as ItemLotRow

    if (input.cantidad >= parent.quantity) {
      throw new Error(`La cantidad del split (${input.cantidad}) debe ser menor al lote actual (${parent.quantity})`)
    }

    // The engine owns this transaction (see file header). Restating the
    // engine dependency here keeps the pre-flight honest without a fake RPC.
    throw new Error(
      "splitItem requiere el motor transaccional server-side (Edge Function / RPC): " +
        "el trigger de balance Σ (ADR 0003, deferrable) rechaza splits vía REST. " +
        "El adaptador DEMO implementa el split completo para desarrollo.",
    )
  }

  async transferItem(input: TransferItemInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: lot, error: lotError } = await client
      .from("item_lots")
      .select(ITEM_LOT_COLUMNS)
      .eq("id", input.itemLotId)
      .maybeSingle()
    if (lotError) throw new Error(`item_lot ${input.itemLotId}: ${lotError.message}`)
    if (!lot) throw new Error(`Lote ${input.itemLotId} no encontrado`)
    const source = lot as ItemLotRow

    // UX guard mirroring the flows.md guard table (engine re-validates):
    // frozen lots (rezago/secuestro) cannot move.
    if (source.status === "in_quarantine" || source.status === "seized") {
      throw new Error(`El lote ${input.itemLotId} está retenido (${source.status}) y no puede transferirse`)
    }

    const { data: destino, error: destinoError } = await client
      .from("locations")
      .select("id, active, allows_hold")
      .eq("id", input.destinoLocationId)
      .maybeSingle()
    if (destinoError) throw new Error(`location ${input.destinoLocationId}: ${destinoError.message}`)
    if (!destino || !destino.active) {
      throw new Error(`El destino ${input.destinoLocationId} no existe o está inactivo`)
    }

    const { data: manifest } = await client
      .from("cargo_manifests")
      .select("facility_id")
      .eq("id", source.manifest_id)
      .maybeSingle()

    const cantidad = input.cantidad ?? source.quantity
    const movement = await this.movements.crearMovimiento({
      kind: "transfer",
      manifestId: source.manifest_id,
      facilityId: ((manifest?.facility_id as string | null) ?? null),
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.motivo,
      locationId: input.destinoLocationId,
      items: [
        {
          itemLotId: source.id,
          cantidad,
          origenLocationId: source.current_location_id,
          destinoLocationId: input.destinoLocationId,
          notas: input.notas,
        },
      ],
    })

    // Quantity-preserving placement change — safe under REST + capacity guard.
    const { error: updateError } = await client
      .from("item_lots")
      .update({ current_location_id: input.destinoLocationId })
      .eq("id", source.id)
    if (updateError) throw new Error(`item_lots update ${source.id}: ${updateError.message}`)

    return movement
  }

  async descargar(input: DescargaInput): Promise<MovementRow> {
    const client = requireClient(this.client)
    const { data: manifest, error: manifestError } = await client
      .from("cargo_manifests")
      .select("id, truck_id, facility_id")
      .eq("id", input.manifestId)
      .maybeSingle()
    if (manifestError) throw new Error(`cargo_manifest ${input.manifestId}: ${manifestError.message}`)
    if (!manifest) throw new Error(`Manifest ${input.manifestId} no encontrado`)

    const { data: lots } = await client
      .from("item_lots")
      .select(ITEM_LOT_COLUMNS)
      .eq("manifest_id", input.manifestId)
      .eq("status", "on_truck")
    const onTruckLots = (lots ?? []) as ItemLotRow[]
    if (onTruckLots.length === 0) {
      throw new Error(`El manifest ${input.manifestId} no tiene lotes on_truck para descargar`)
    }

    const movement = await this.movements.crearMovimiento({
      kind: "discharge",
      manifestId: input.manifestId,
      facilityId: (manifest.facility_id as string | null) ?? null,
      operatorId: input.operatorId ?? null,
      ocurridoEn: input.ocurridoEn,
      operationKey: input.operationKey,
      motivo: input.motivo,
      locationId: input.destinoLocationId,
      items: onTruckLots.map((lot) => ({
        itemLotId: lot.id,
        cantidad: lot.quantity,
        origenTruckId: manifest.truck_id as string | null,
        destinoLocationId: input.destinoLocationId,
        notas: input.notas,
      })),
    })

    // Batch placement update (single statement, quantity-preserving): all
    // discharged lots land at the destination location.
    const { error: updateError } = await client
      .from("item_lots")
      .update({
        status: "discharged",
        current_location_id: input.destinoLocationId,
        current_truck_id: null,
      })
      .eq("manifest_id", input.manifestId)
      .eq("status", "on_truck")
    if (updateError) throw new Error(`item_lots update (descarga ${input.manifestId}): ${updateError.message}`)

    return movement
  }
}