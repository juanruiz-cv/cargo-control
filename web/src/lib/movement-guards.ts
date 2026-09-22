/**
 * Movement engine — pure validation guards (I1..I7).
 *
 * `validarMovimiento(candidato, contexto)` runs every guard against a flat
 * read model and returns ALL results (pass + fail), never first-fail, so the
 * "Registrar movimiento" UI can render every blocking condition inline.
 * Guards are pure: the service layer builds the `ValidationContext` with
 * bounded reads, executes the mutation and audits.
 *
 * Source of truth for the rules:
 *   - movement-engine.md §Type map / §Edge cases (15 kinds, corrections,
 *     operation_key idempotency)
 *   - flows.md guard table (lot transitions)
 *   - business-rules.md §2/§3/§6/§7/§8/§10 (discharge, split Σ, holds,
 *     corrections, capacity/occupancy)
 *   - rbac.md §3 + authorization.md §3 (kind → permission map; release
 *     supervisor gate)
 *   - 0006_triggers.sql (ADR 0006 placement guard, ADR 0003 balance) and
 *     0005_views.sql `location_occupancy` (authoritative capacity numbers)
 *
 * The database is the authority in production (RLS + engine RPC); this
 * module is the honest client-side mirror that powers the engine surface in
 * both DEMO (full in-memory execution) and Supabase (provisional REST path).
 *
 * Guard numbering (task contract):
 *   I1 kind → permission (ADR 0007) + supervisor gate for `release`
 *   I2 quantity / stock sufficiency (ME-10..ME-13, ADR 0003 Σ)
 *   I3 destination capacity placement (ADR 0006 lot_placement guard)
 *   I4 origin-side capacity (never fires on removal; refuses to operate on
 *      an origin already over capacity — do not propagate a corrupt state)
 *   I5 lot / location state (flows.md; ME-20..ME-22, ME-26/ME-27)
 *   I6 sequence / flow rules (flows.md; ME-23..ME-25; sensitive reasons)
 *   I7 idempotency (operation_key partial unique per org, ME-07)
 */

import type {
  CargoItemRow,
  CargoManifestRow,
  ItemLotRow,
  LocationOccupancyRow,
  LocationRow,
  MovementKind,
  MovementRow,
  PermissionCode,
  QuarantineOperationRow,
  RoleCode,
  SeizureOperationRow,
} from "@/types"

export type GuardCode = "I1" | "I2" | "I3" | "I4" | "I5" | "I6" | "I7"

/** One guard verdict. When `ok`, `message` is empty and `code` is "OK". */
export interface GuardResult {
  guard: GuardCode
  ok: boolean
  code: string
  message: string
}

/** Per-lot detail of the intended movement (movement_items row). */
export interface EngineCandidateItem {
  itemLotId: string
  cantidad: number
  origenLocationId?: string | null
  destinoLocationId?: string | null
  origenTruckId?: string | null
  destinoTruckId?: string | null
}

/** The logical movement the engine is asked to apply. */
export interface EngineCandidate {
  kind: MovementKind
  manifestId?: string | null
  facilityId?: string | null
  /** movements.location_id — the movement's main location (often the destination). */
  locationId?: string | null
  motivo?: string | null
  operationKey?: string | null
  previousMovementId?: number | null
  items?: EngineCandidateItem[]
}

/** Flat read model the service layer builds (bounded reads, org-scoped). */
export interface ValidationContext {
  /** I1: permissions of the acting user (UX mirror of `movement_kind_permitted`). */
  permisos: readonly PermissionCode[]
  /** I1: roles of the acting user (release supervisor gate, rbac.md §3). */
  roles: readonly RoleCode[]
  /** I2/I3/I4/I5/I6: lots involved in the candidate (by item_lot_id). */
  lotes: ReadonlyMap<string, ItemLotRow>
  /** I2: cargo_item_id → ALL its lots (Σ leaf invariant, ADR 0003). */
  lotesDelItem: ReadonlyMap<string, readonly ItemLotRow[]>
  /** I3/I5: cargo items (unit weight/volume fallback, location_occupancy). */
  items: ReadonlyMap<string, CargoItemRow>
  /** I6: manifests referenced by the candidate. */
  manifests: ReadonlyMap<string, CargoManifestRow>
  /** I3/I4/I5: locations (destino activo, allows_hold, capacity). */
  locations: ReadonlyMap<string, LocationRow>
  /** I3/I4: occupancy per location with the EXACT semantics of the
   *  `location_occupancy` view (0005_views.sql). Use `computarOcupaciones`. */
  ocupacion: ReadonlyMap<string, LocationOccupancyRow>
  /** I6/I7: bounded movement history (previous ids, arrival/egress presence). */
  movimientos: readonly MovementRow[]
  /** I7: existing movement for (org, operation_key), if any. */
  existentePorOperationKey: MovementRow | null
  /** I5: OPEN hold cases per item_lot (release requires one, ME-27). */
  holdsAbiertos: {
    quarantine: ReadonlyMap<string, QuarantineOperationRow>
    seizure: ReadonlyMap<string, SeizureOperationRow>
  }
}

/**
 * kind → permission map (ADR 0007), transpose of the SQL function
 * `movement_kind_permitted` (0003_authorization_helpers.sql; authorization.md
 * §3). `release` maps to the originating hold's create permission (either
 * code unlocks) and additionally requires the supervisor/admin role, enforced
 * server-side (rbac.md §3) and mirrored by guard I1.
 */
export const MOVEMENT_KIND_PERMISSION: Record<
  MovementKind,
  PermissionCode | readonly PermissionCode[]
> = {
  arrival: "cargo.update",
  discharge: "cargo.update",
  split: "cargo.update",
  store: "cargo.update",
  correction: "cargo.update",
  transfer: "cargo.transfer",
  load_out: "cargo.transfer",
  return_to_truck: "cargo.transfer",
  scan_in: "scanner.create",
  scan_out: "scanner.create",
  scale: "scale.create",
  quarantine: "quarantine.create",
  seizure: "seizure.create",
  release: ["quarantine.create", "seizure.create"],
  egress: "truck.exit",
}

/** Kinds that carry per-lot movement_items (everything except arrival/egress/correction). */
export const KINDS_CON_ITEMS: ReadonlySet<MovementKind> = new Set([
  "discharge",
  "split",
  "transfer",
  "scan_in",
  "scan_out",
  "scale",
  "store",
  "load_out",
  "quarantine",
  "seizure",
  "release",
  "return_to_truck",
])

/** Kinds whose `reason` is mandatory (business-rules.md §8, ME-42/43). */
export const MOTIVO_OBLIGATORIO: ReadonlySet<MovementKind> = new Set([
  "quarantine",
  "seizure",
  "release",
  "egress",
  "correction",
])

/** Frozen lots (business-rules.md §6/§7): no normal stock movement. */
export const LOTES_CONGELADOS: ReadonlySet<ItemLotRow["status"]> = new Set([
  "in_quarantine",
  "seized",
])

function pass(guard: GuardCode): GuardResult {
  return { guard, ok: true, code: "OK", message: "" }
}

function fail(guard: GuardCode, code: string, message: string): GuardResult {
  return { guard, ok: false, code, message }
}

// ---------------------------------------------------------------------
// I1 — permission (ADR 0007) + release supervisor gate (rbac.md §3)
// ---------------------------------------------------------------------

function guardI1Permiso(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  const requerido = MOVEMENT_KIND_PERMISSION[c.kind]
  const permisos = Array.isArray(requerido) ? requerido : [requerido]
  const tienePermiso = permisos.some((p) => ctx.permisos.includes(p))
  if (!tienePermiso) {
    return fail(
      "I1",
      "I1_PERMISO_DENEGADO",
      `Movimiento '${c.kind}' no permitido: requiere ${permisos.join(" o ")} (RBAC, ADR 0007)`,
    )
  }
  if (c.kind === "release") {
    const esSupervisor = ctx.roles.some((r) => r === "admin" || r === "supervisor")
    if (!esSupervisor) {
      return fail(
        "I1",
        "I1_RELEASE_SUPERVISOR_REQUERIDO",
        "Resolver rezago/secuestro (release) requiere rol supervisor o admin (rbac.md §3)",
      )
    }
  }
  return pass("I1")
}

// ---------------------------------------------------------------------
// I2 — quantity / stock sufficiency (ME-10..ME-13, ADR 0003 Σ)
// ---------------------------------------------------------------------

function guardI2Cantidad(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  if (!KINDS_CON_ITEMS.has(c.kind)) return pass("I2")

  const items = c.items ?? []
  if (items.length === 0) {
    return fail(
      "I2",
      "I2_LOTES_REQUERIDOS",
      `El movimiento '${c.kind}' requiere al menos un lote (movement_items)`,
    )
  }

  for (const it of items) {
    if (!(it.cantidad > 0) || !Number.isFinite(it.cantidad)) {
      return fail(
        "I2",
        "I2_CANTIDAD_INVALIDA",
        `Cantidad ${it.cantidad} inválida para el lote ${it.itemLotId} (debe ser > 0, ME-12)`,
      )
    }
    const lot = ctx.lotes.get(it.itemLotId)
    if (!lot) continue // existencia → I5
    switch (c.kind) {
      case "split":
        if (it.cantidad >= lot.quantity) {
          return fail(
            "I2",
            "I2_SPLIT_SIN_REMANENTE",
            `Split: la cantidad (${it.cantidad}) debe ser menor al lote (${lot.quantity}) para dejar remanente`,
          )
        }
        break
      case "transfer":
      case "store":
      case "load_out":
      case "return_to_truck":
        if (it.cantidad > lot.quantity) {
          return fail(
            "I2",
            "I2_CANTIDAD_EXCEDE_LOTE",
            `Cantidad (${it.cantidad}) excede el lote ${lot.id} (${lot.quantity}) — ME-10`,
          )
        }
        break
      default:
        // discharge, scan_in/out, scale, quarantine, seizure, release:
        // whole-lot operations on this surface (flows.md lot transitions).
        if (it.cantidad !== lot.quantity) {
          return fail(
            "I2",
            "I2_MOVIMIENTO_LOTE_COMPLETO",
            `El movimiento '${c.kind}' opera sobre el lote completo (${lot.quantity}), no ${it.cantidad}`,
          )
        }
    }
  }

  // ADR 0003 Σ leaf invariant — defensive check of the PRE state for
  // splits (0006_triggers.sql `enforce_item_lot_balance` is authoritative;
  // here we refuse to operate on already-corrupt items, ME-13 spirit).
  if (c.kind === "split") {
    for (const it of items) {
      const lot = ctx.lotes.get(it.itemLotId)
      if (!lot) continue
      const hojas = ctx.lotesDelItem.get(lot.cargo_item_id)
      const item = ctx.items.get(lot.cargo_item_id)
      if (!hojas || !item) continue
      const hojasSinHijos = hojas.filter((h) => !hojas.some((otro) => otro.parent_lot_id === h.id))
      const suma = hojasSinHijos.reduce((acc, h) => acc + h.quantity, 0)
      if (suma !== item.total_quantity) {
        return fail(
          "I2",
          "I2_BALANCE_SUMA_ROTO",
          `Invariante Σ roto: hojas del ítem ${item.id} suman ${suma} ≠ total ${item.total_quantity} (ADR 0003, ME-13)`,
        )
      }
    }
  }
  return pass("I2")
}

// ---------------------------------------------------------------------
// I3 — destination capacity placement (ADR 0006 lot_placement guard)
//
// Mirrors `lot_placement_capacity_guard` (0006_triggers.sql) against the
// `location_occupancy` view semantics (0005_views.sql): occupancy is
// derived (kg = Σ qty × COALESCE(lot, item)), units only count uom='unit',
// unknown weight/volume leaves that dimension unguarded, equality allowed,
// and the lot's OLD contribution is excluded when it stays at the same
// location.
// ---------------------------------------------------------------------

interface ContribucionDimensiones {
  kg: number | null // null = unknown (lot & item both lack weight data)
  m3: number | null
  units: number
}

function contribucionUnidad(
  lot: ItemLotRow,
  item: CargoItemRow | undefined,
  cantidad: number,
): ContribucionDimensiones {
  const kg = lot.unit_weight_kg ?? item?.unit_weight_kg ?? null
  const m3 = lot.unit_volume_m3 ?? item?.unit_volume_m3 ?? null
  return {
    kg: kg === null ? null : cantidad * kg,
    m3: m3 === null ? null : cantidad * m3,
    units: lot.uom === "unit" ? cantidad : 0,
  }
}

function guardI3CapacidadDestino(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  const items = c.items ?? []
  if (items.length === 0) return pass("I3")

  for (const it of items) {
    const destino = it.destinoLocationId ?? (items.length === 1 ? c.locationId ?? null : null)
    if (!destino) continue // sin placement → sin dimensión de capacidad
    const loc = ctx.locations.get(destino)
    const occ = ctx.ocupacion.get(destino)
    const lot = ctx.lotes.get(it.itemLotId)
    if (!loc || !occ || !lot) continue // existencia/actividad → I5

    const item = ctx.items.get(lot.cargo_item_id)
    const nuevo = contribucionUnidad(lot, item, it.cantidad)
    const mismoDestino = lot.current_location_id === destino
    const viejo = mismoDestino ? contribucionUnidad(lot, item, lot.quantity) : null

    const proyectadoKg = occ.occupancy_kg + (nuevo.kg ?? 0) - (viejo?.kg ?? 0)
    const proyectadoM3 = occ.occupancy_m3 + (nuevo.m3 ?? 0) - (viejo?.m3 ?? 0)
    const proyectadoUnits = occ.occupancy_units + nuevo.units - (viejo?.units ?? 0)

    if (loc.capacity_max_kg !== null && proyectadoKg > loc.capacity_max_kg) {
      return fail(
        "I3",
        "I3_CAPACIDAD_KG_EXCEDIDA",
        `Placement en ${loc.code}: ${proyectadoKg} kg excede la capacidad de ${loc.capacity_max_kg} kg (ADR 0006)`,
      )
    }
    if (loc.capacity_max_volume_m3 !== null && proyectadoM3 > loc.capacity_max_volume_m3) {
      return fail(
        "I3",
        "I3_CAPACIDAD_M3_EXCEDIDA",
        `Placement en ${loc.code}: ${proyectadoM3} m³ exceden la capacidad de ${loc.capacity_max_volume_m3} m³ (ADR 0006)`,
      )
    }
    if (loc.capacity_max_units !== null && proyectadoUnits > loc.capacity_max_units) {
      return fail(
        "I3",
        "I3_CAPACIDAD_UNITS_EXCEDIDA",
        `Placement en ${loc.code}: ${proyectadoUnits} unidades exceden la capacidad de ${loc.capacity_max_units} (igualdad permitida, ADR 0006)`,
      )
    }
  }
  return pass("I3")
}

// ---------------------------------------------------------------------
// I4 — origin-side capacity
//
// Removal never overflows (no projected check on the source). The ONLY
// origin fire is defensive: refuse to operate on a source that ALREADY
// exceeds a known capacity (corrupt placement) instead of propagating the
// overflow to new movement rows. The DB twin of this guard is
// `locations_capacity_guard` (0006_triggers.sql) on capacity cuts.
// ---------------------------------------------------------------------

function guardI4CapacidadOrigen(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  const items = c.items ?? []
  if (items.length === 0) return pass("I4")

  for (const it of items) {
    const origen = it.origenLocationId
    if (!origen) continue
    const loc = ctx.locations.get(origen)
    const occ = ctx.ocupacion.get(origen)
    if (!loc || !occ) continue
    const sobre = (dato: number, cap: number | null): boolean => cap !== null && dato > cap
    if (
      sobre(occ.occupancy_kg, loc.capacity_max_kg) ||
      sobre(occ.occupancy_m3, loc.capacity_max_volume_m3) ||
      sobre(occ.occupancy_units, loc.capacity_max_units)
    ) {
      return fail(
        "I4",
        "I4_ORIGEN_SOBRE_CAPACIDAD",
        `El origen ${loc.code} ya excede su capacidad (estado inválido); no se opera sobre él`,
      )
    }
  }
  return pass("I4")
}

// ---------------------------------------------------------------------
// I5 — lot / location state (flows.md guard table; ME-20..22, ME-26/27)
// ---------------------------------------------------------------------

function guardI5Estado(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  if (!KINDS_CON_ITEMS.has(c.kind)) return pass("I5")

  const items = c.items ?? []
  if (items.length === 0) return pass("I5") // I2 reports the missing lots

  for (const it of items) {
    const lot = ctx.lotes.get(it.itemLotId)
    if (!lot) {
      return fail("I5", "I5_LOTE_INEXISTENTE", `El lote ${it.itemLotId} no existe`)
    }
    if (LOTES_CONGELADOS.has(lot.status) && c.kind !== "release") {
      return fail(
        "I5",
        "I5_LOTE_CONGELADO",
        `El lote ${lot.id} está retenido (${lot.status}) y no admite movimientos normales (ME-20/ME-21)`,
      )
    }
    switch (c.kind) {
      case "release": {
        const abierto =
          ctx.holdsAbiertos.quarantine.has(lot.id) || ctx.holdsAbiertos.seizure.has(lot.id)
        if (!abierto) {
          return fail(
            "I5",
            "I5_SIN_CASO_ABIERTO",
            `El lote ${lot.id} no tiene un caso abierto de rezago/secuestro para resolver (ME-27)`,
          )
        }
        break
      }
      case "discharge":
        if (lot.status !== "on_truck") {
          return fail(
            "I5",
            "I5_LOTE_NO_EN_CAMION",
            `El lote ${lot.id} está ${lot.status}; discharge requiere on_truck (flows.md)`,
          )
        }
        break
      case "store":
        if (lot.status !== "discharged" && lot.status !== "checked" && lot.status !== "in_warehouse") {
          return fail(
            "I5",
            "I5_LOTE_NO_ALMACENABLE",
            `El lote ${lot.id} (${lot.status}) no puede almacenarse (store: discharged/checked/in_warehouse)`,
          )
        }
        break
      case "transfer":
      case "load_out":
      case "return_to_truck":
        if (!lot.current_location_id || lot.current_truck_id) {
          return fail(
            "I5",
            "I5_LOTE_SIN_UBICACION",
            `El lote ${lot.id} debe estar en una ubicación física para '${c.kind}'`,
          )
        }
        break
      case "scan_in":
        if (lot.status !== "discharged" && lot.status !== "checked") {
          return fail(
            "I5",
            "I5_LOTE_NO_ESCANEABLE",
            `El lote ${lot.id} (${lot.status}) no admite scan_in (discharged/checked)`,
          )
        }
        break
      case "scan_out":
        if (lot.status !== "checked") {
          return fail(
            "I5",
            "I5_LOTE_NO_SALE_SCANNER",
            `El lote ${lot.id} (${lot.status}) no admite scan_out (checked)`,
          )
        }
        break
      case "scale":
        if (lot.status !== "discharged" && lot.status !== "checked") {
          return fail(
            "I5",
            "I5_LOTE_NO_PESABLE",
            `El lote ${lot.id} (${lot.status}) no admite scale (discharged/checked)`,
          )
        }
        break
      default:
        break // split/quarantine/seizure: only the frozen gate applies
    }
  }

  // Destination state (ME-22): active location; holds need allows_hold.
  for (const it of items) {
    const destino = it.destinoLocationId ?? items.length === 1 ? c.locationId ?? null : null
    if (!destino) continue
    const loc = ctx.locations.get(destino)
    if (!loc || !loc.active) {
      return fail(
        "I5",
        "I5_DESTINO_INACTIVO",
        `El destino ${destino} no existe o está inactivo (ME-22)`,
      )
    }
    if ((c.kind === "quarantine" || c.kind === "seizure") && !loc.allows_hold) {
      return fail(
        "I5",
        "I5_DESTINO_SIN_HOLD",
        `La ubicación ${loc.code} no permite holds (allows_hold=false) para ${c.kind}`,
      )
    }
  }
  return pass("I5")
}

// ---------------------------------------------------------------------
// I6 — sequence / flow rules (flows.md; ME-23..ME-25; sensitive reasons)
// ---------------------------------------------------------------------

function guardI6Secuencia(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  const items = c.items ?? []

  if (MOTIVO_OBLIGATORIO.has(c.kind) && !(c.motivo ?? "").trim()) {
    return fail(
      "I6",
      "I6_MOTIVO_REQUERIDO",
      `El movimiento '${c.kind}' es sensible: motivo/reason obligatorio (business-rules.md §8)`,
    )
  }

  switch (c.kind) {
    case "arrival": {
      if (!c.manifestId) {
        return fail("I6", "I6_MANIFIESTO_REQUERIDO", "arrival requiere manifestId")
      }
      const m = ctx.manifests.get(c.manifestId)
      if (!m) return fail("I6", "I6_MANIFIESTO_INEXISTENTE", `El manifiesto ${c.manifestId} no existe`)
      if (m.status === "closed") {
        return fail("I6", "I6_MANIFIESTO_CERRADO", "No puede ingresar un manifiesto cerrado")
      }
      if (ctx.movimientos.some((x) => x.manifest_id === c.manifestId && x.kind === "arrival")) {
        return fail(
          "I6",
          "I6_INGRESO_DUPLICADO",
          `El manifiesto ${c.manifestId} ya registró ingreso (movimiento 'arrival')`,
        )
      }
      break
    }
    case "discharge": {
      if (!c.manifestId) {
        return fail("I6", "I6_MANIFIESTO_REQUERIDO", "discharge requiere manifestId")
      }
      const m = ctx.manifests.get(c.manifestId)
      if (!m) return fail("I6", "I6_MANIFIESTO_INEXISTENTE", `El manifiesto ${c.manifestId} no existe`)
      if (m.status !== "in_playon") {
        return fail(
          "I6",
          "I6_MANIFIESTO_NO_EN_PLAYON",
          `discharge requiere manifiesto in_playon (estado actual: ${m.status}) — flows.md`,
        )
      }
      for (const it of items) {
        const lot = ctx.lotes.get(it.itemLotId)
        if (!lot) continue
        if (lot.manifest_id !== c.manifestId || lot.current_truck_id !== m.truck_id) {
          return fail(
            "I6",
            "I6_TRUCK_INCORRECTO",
            `El lote ${lot.id} no está en el camión del manifiesto ${c.manifestId} (ME-26)`,
          )
        }
      }
      break
    }
    case "egress": {
      if (!c.manifestId) {
        return fail("I6", "I6_MANIFIESTO_REQUERIDO", "egress requiere manifestId")
      }
      const m = ctx.manifests.get(c.manifestId)
      if (!m) return fail("I6", "I6_MANIFIESTO_INEXISTENTE", `El manifiesto ${c.manifestId} no existe`)
      if (!ctx.movimientos.some((x) => x.manifest_id === c.manifestId && x.kind === "arrival")) {
        return fail(
          "I6",
          "I6_SIN_INGRESO",
          `El manifiesto ${c.manifestId} no registró ingreso (movimiento 'arrival')`,
        )
      }
      if (ctx.movimientos.some((x) => x.manifest_id === c.manifestId && x.kind === "egress")) {
        return fail("I6", "I6_EGRESO_DUPLICADO", `El manifiesto ${c.manifestId} ya egresó`)
      }
      for (const lot of ctx.lotes.values()) {
        if (lot.manifest_id === c.manifestId && LOTES_CONGELADOS.has(lot.status)) {
          return fail(
            "I6",
            "I6_LOTES_RETENIDOS",
            `El manifiesto ${c.manifestId} tiene lotes retenidos (${lot.id}: ${lot.status}); no puede egresar (AC-E2-2)`,
          )
        }
      }
      break
    }
    case "store": {
      for (const it of items) {
        if (!it.destinoLocationId && !(items.length === 1 && c.locationId)) {
          return fail("I6", "I6_SIN_DESTINO", "store requiere una ubicación destino")
        }
      }
      break
    }
    case "load_out":
    case "return_to_truck": {
      const m = c.manifestId ? ctx.manifests.get(c.manifestId) : undefined
      if (!m) {
        return fail("I6", "I6_MANIFIESTO_REQUERIDO", `${c.kind} requiere el manifiesto del lote`)
      }
      if (m.status === "closed") {
        return fail(
          "I6",
          "I6_MANIFIESTO_CERRADO",
          `${c.kind} requiere manifiesto abierto (el cierre/ack del egress es server-side; ME-24/ME-25)`,
        )
      }
      for (const it of items) {
        const destinoTruck = it.destinoTruckId ?? m.truck_id
        if (m.truck_id && destinoTruck !== m.truck_id) {
          return fail(
            "I6",
            "I6_TRUCK_NO_EN_MANIFIESTO",
            `El camión destino ${destinoTruck} no es el del manifiesto ${m.id} (${m.truck_id}) — ME-23`,
          )
        }
      }
      break
    }
    case "correction": {
      if (!c.previousMovementId) {
        return fail(
          "I6",
          "I6_CORRECCION_SIN_ORIGEN",
          "correction requiere previous_movement_id (business-rules.md §8, AC-E8-3)",
        )
      }
      if (!ctx.movimientos.some((x) => x.id === c.previousMovementId)) {
        return fail(
          "I6",
          "I6_ORIGEN_INEXISTENTE",
          `El movimiento ${c.previousMovementId} referenciado no existe`,
        )
      }
      if (items.length > 0) {
        return fail(
          "I6",
          "I6_CORRECCION_SIN_LOTES",
          "correction no lleva movement_items (no mutación física; append-only)",
        )
      }
      break
    }
    case "scan_in":
    case "scan_out":
    case "scale": {
      // Station flow: the lot must be AT a checkpoint whose kind matches
      // (flows.md: "lot at scanner checkpoint" / "lot at scale checkpoint").
      const esperado = c.kind === "scale" ? "scale" : "scan"
      for (const it of items) {
        const lot = ctx.lotes.get(it.itemLotId)
        if (!lot) continue
        const loc = lot.current_location_id ? ctx.locations.get(lot.current_location_id) : undefined
        if (!loc || loc.type !== "checkpoint") {
          return fail(
            "I6",
            "I6_LOTE_NO_EN_CHECKPOINT",
            `El lote ${lot.id} no está en un checkpoint (${loc?.code ?? "sin ubicación"})`,
          )
        }
        if (loc.checkpoint_kind !== esperado) {
          return fail(
            "I6",
            "I6_CHECKPOINT_INCORRECTO",
            `El lote ${lot.id} está en ${loc.code} (checkpoint ${loc.checkpoint_kind}); se esperaba '${esperado}'`,
          )
        }
      }
      break
    }
    default:
      break // split/transfer/quarantine/seizure: sin regla de secuencia extra
  }
  return pass("I6")
}

// ---------------------------------------------------------------------
// I7 — idempotency (operation_key partial unique per org; ME-07)
// ---------------------------------------------------------------------

function guardI7Idempotencia(c: EngineCandidate, ctx: ValidationContext): GuardResult {
  const clave = c.operationKey
  if (clave === undefined || clave === null) return pass("I7")
  if (String(clave).trim() === "") {
    return fail("I7", "I7_CLAVE_VACIA", "operation_key no puede ser vacío")
  }
  const existente = ctx.existentePorOperationKey
  if (existente) {
    return fail(
      "I7",
      "I7_DUPLICADO",
      `La operation_key '${clave}' ya fue aplicada en el movimiento #${existente.id} (${existente.kind}) — replay (ME-07)`,
    )
  }
  return pass("I7")
}

// ---------------------------------------------------------------------
// Orchestrator + helpers
// ---------------------------------------------------------------------

/** Runs every guard. Returns ALL verdicts (pass + fail), never first-fail. */
export function validarMovimiento(c: EngineCandidate, ctx: ValidationContext): GuardResult[] {
  return [
    guardI1Permiso(c, ctx),
    guardI2Cantidad(c, ctx),
    guardI3CapacidadDestino(c, ctx),
    guardI4CapacidadOrigen(c, ctx),
    guardI5Estado(c, ctx),
    guardI6Secuencia(c, ctx),
    guardI7Idempotencia(c, ctx),
  ]
}

export function hayFallos(validaciones: readonly GuardResult[]): boolean {
  return validaciones.some((v) => !v.ok)
}

export function fallosDe(validaciones: readonly GuardResult[]): GuardResult[] {
  return validaciones.filter((v) => !v.ok)
}

/** True when the ONLY blocker is an I7 replay (the orchestrator short-circuits). */
export function esReplayDuplicado(validaciones: readonly GuardResult[]): boolean {
  return validaciones.some((v) => v.code === "I7_DUPLICADO")
}

/**
 * Occupancy with the EXACT semantics of the `location_occupancy` view
 * (0005_views.sql): kg/m³ = Σ qty × COALESCE(lot unit, item unit), units only
 * count uom='unit', lots on a truck never count, holds DO count, missing
 * weight/volume lots are flagged (not zeroed). This is the number set the
 * ADR 0006 placement guard works against — I3/I4 use it so validation and
 * the DB agree.
 */
export function computarOcupaciones(
  locations: readonly LocationRow[],
  lots: readonly ItemLotRow[],
  items: readonly CargoItemRow[],
): Map<string, LocationOccupancyRow> {
  const itemById = new Map(items.map((i) => [i.id, i]))
  const resultado = new Map<string, LocationOccupancyRow>()

  for (const loc of locations) {
    const colocados = lots.filter((l) => l.current_location_id === loc.id)
    let kg = 0
    let m3 = 0
    let units = 0
    let missingWeight = 0
    let missingVolume = 0
    for (const l of colocados) {
      const item = itemById.get(l.cargo_item_id)
      const w = l.unit_weight_kg ?? item?.unit_weight_kg ?? null
      const v = l.unit_volume_m3 ?? item?.unit_volume_m3 ?? null
      if (w === null) missingWeight += 1
      else kg += l.quantity * w
      if (v === null) missingVolume += 1
      else m3 += l.quantity * v
      if (l.uom === "unit") units += l.quantity
    }
    const capKg = loc.capacity_max_kg
    const capM3 = loc.capacity_max_volume_m3
    const capUnits = loc.capacity_max_units
    const pct = (used: number, cap: number | null): number | null =>
      cap === null || cap === 0 ? null : Math.round((used / cap) * 100)
    resultado.set(loc.id, {
      location_id: loc.id,
      organization_id: loc.organization_id,
      facility_id: loc.facility_id,
      code: loc.code,
      occupancy_kg: kg,
      occupancy_m3: m3,
      occupancy_units: units,
      missing_weight_lots: missingWeight,
      missing_volume_lots: missingVolume,
      capacity_max_kg: capKg,
      capacity_max_volume_m3: capM3,
      capacity_max_units: capUnits,
      available_kg: capKg === null ? null : Math.max(capKg - kg, 0),
      available_m3: capM3 === null ? null : Math.max(capM3 - m3, 0),
      available_units: capUnits === null ? null : Math.max(capUnits - units, 0),
      pct_kg: pct(kg, capKg),
      pct_m3: pct(m3, capM3),
      pct_units: pct(units, capUnits),
    })
  }
  return resultado
}