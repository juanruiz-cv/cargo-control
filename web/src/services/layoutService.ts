/**
 * Layout service — floor-plan versions + elements (ADR 0005 taxonomy,
 * ADR 0015 versioning; docs/architecture/floor-plan-editor.md +
 * floor-plan-versioning.md).
 *
 * Versioning model: one `layouts` row IS one version (unique
 * (facility_id, name, version); status draft|published|archived).
 * Editing always happens on a DRAFT; publishing archives the previous
 * published version of the same (facility, name).
 *
 * Client-side constraints (recorded, doc-aligned):
 *   - DELETE is not granted by RLS (0004_rls.sql has no delete policies),
 *     so element/location removal is a SOFT delete: UPDATE is_visible=false
 *     (floor-plan-editor.md §7 "hidden elements keep the data"). The demo
 *     adapter mirrors the same semantics.
 *   - audit_log inserts are trigger/engine-only (0004_rls.sql §audit_log):
 *     layout.create / layout.publish / layout.restore rows are written
 *     SERVER-SIDE. The Supabase adapter reports that dependency (same
 *     pattern as SupabaseHoldService.resolver); the demo appends them
 *     in-memory so the UI shows the flow.
 *   - Multi-table writes (version + elements, element + location) run as
 *     sequential client calls: no Edge Function / RPC exists in this
 *     scaffold to give them one transaction. The route-level constraint
 *     (facility_id, code) still protects duplicates server-side.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import {
  LAYOUT_COLUMNS,
  LAYOUT_ELEMENT_COLUMNS,
  LOCATION_COLUMNS,
  LOCATION_OCCUPANCY_COLUMNS,
} from "@/services/columns"
import type { LayoutFiltros } from "@/services/shared"
import type {
  Json,
  LayoutElementRow,
  LayoutElementType,
  LayoutRow,
  LocationOccupancyRow,
  LocationRow,
} from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

function applyWindow<T>(query: { range: (start: number, end: number) => T }, filtros?: { limit?: number; offset?: number }): T {
  const limit = Math.min(filtros?.limit ?? 200, 500)
  const offset = filtros?.offset ?? 0
  return query.range(offset, offset + limit - 1)
}

// ---------------------------------------------------------------------
// View models (read-side composition, operational-map.md)
// ---------------------------------------------------------------------

/** Layout row + the creator's display name (join over public.users). */
export interface LayoutVersionRow extends LayoutRow {
  creador_nombre?: string | null
}

/** One layout version with its element set (visible only). */
export interface LayoutConElementos {
  layout: LayoutRow
  elementos: LayoutElementRow[]
}

/** Element + linked location + its derived occupancy (map/editor reads). */
export interface LayoutElementConUbicacion {
  elemento: LayoutElementRow
  ubicacion: LocationRow | null
  ocupacion: LocationOccupancyRow | null
}

/** The operational map projection (operational-map.md): published layout. */
export interface MapaOperativoResultado {
  layout: LayoutRow
  elementos: LayoutElementConUbicacion[]
}

/** ADR 0015 — per-version change summary (element diffs). */
export interface CambiosLayout {
  from_version: number
  elements: Json[]
  counts: { added: number; removed: number; changed: number }
}

// ---------------------------------------------------------------------
// Layout diff (floor-plan-versioning.md §Compare algorithm + §changes
// shape). One engine shared by the Supabase and demo adapters: the
// element sets are fetched per version and `computarDiffLayout` runs the
// field-level comparison. The client (component) only renders the result.
// ---------------------------------------------------------------------

/** The ten diffed fields (doc names; width/height map to visual_* columns). */
export const CAMPOS_DIFF_LAYOUT = [
  "x",
  "y",
  "width",
  "height",
  "rotation",
  "color",
  "icon",
  "label",
  "is_visible",
  "location_id",
] as const

export type LayoutDiffField = (typeof CAMPOS_DIFF_LAYOUT)[number]

export type LayoutDiffValue = string | number | boolean | null

/** Field-level change for an element present in both versions. */
export interface LayoutDiffFieldChange {
  element_id: string
  field: LayoutDiffField
  before: LayoutDiffValue
  after: LayoutDiffValue
}

/** Element present only in the newer (added) or only in the older (removed) set. */
export interface LayoutDiffActionItem {
  element_id: string
  action: "added" | "removed"
}

/**
 * Render ref for an element_id that appears in the diff (the diff items
 * themselves carry only ids per the documented JSON shape). `nombre` is
 * name ?? label ?? code; the UI falls back to the element-type label.
 */
export interface LayoutDiffElementoRef {
  element_id: string
  /** Layout version the element row belongs to (from or to). */
  layout_version: number
  element_type: LayoutElementType
  nombre: string | null
}

/** Server-side diff between two versions of the same (facility, name). */
export interface LayoutDiff {
  facility_id: string
  name: string
  from_version: number
  to_version: number
  added: LayoutDiffActionItem[]
  removed: LayoutDiffActionItem[]
  changed: LayoutDiffFieldChange[]
  counts: { added: number; removed: number; changed: number }
  /** Render refs for every element_id present in added/removed/changed. */
  elementos: LayoutDiffElementoRef[]
}

export interface ComputarDiffLayoutContext {
  facilityId: string
  name: string
  fromVersion: number
  toVersion: number
}

/**
 * Stable join key between two versions' element sets.
 *
 * Place elements are linked to a persistent `locations` row
 * (unique per layout via layout_elements_no_dup_marker_idx), so
 * `location_id` is their stable identity across versions. Visual-only
 * elements (corridor/door/other) have no location_id; the scaffold keeps
 * no stable business key for them, so they match by element_type + name
 * (or code) when both sides carry one, and unmatched otherwise. An
 * element with no key in a version is reported added/removed (no
 * identity to diff against) — the engine-side SQL function should
 * standardize this key before the element-set comparison.
 */
export function claveEstableLayoutElement(el: LayoutElementRow): string | null {
  if (el.location_id) return `place:${el.location_id}`
  if (el.code) return `visual:${el.element_type}:code:${el.code}`
  const nombre = el.name?.trim()
  if (nombre) return `visual:${el.element_type}:name:${nombre.toLowerCase()}`
  return null
}

function leerCampoLayout(el: LayoutElementRow, campo: LayoutDiffField): LayoutDiffValue {
  switch (campo) {
    case "x":
      return el.x
    case "y":
      return el.y
    case "width":
      return el.visual_width
    case "height":
      return el.visual_height
    case "rotation":
      return el.rotation
    case "color":
      return el.color
    case "icon":
      return el.icon
    case "label":
      return el.label
    case "is_visible":
      return el.is_visible
    case "location_id":
      return el.location_id
  }
}

function refElemento(el: LayoutElementRow, layoutVersion: number): LayoutDiffElementoRef {
  return {
    element_id: el.id,
    layout_version: layoutVersion,
    element_type: el.element_type,
    nombre: el.name ?? el.label ?? el.code ?? null,
  }
}

/**
 * Core diff engine (pure, deterministic, adapter-agnostic).
 *
 * - element present in both (stable key) → one LayoutDiffFieldChange per
 *   differing field of the documented ten;
 * - present only in `to` → added (element_id = row id in `to`);
 * - present only in `from` → removed (element_id = row id in `from`).
 *
 * `counts.changed` counts FIELD changes (an element moved in x+y = 2),
 * matching the documented `changes` shape example.
 */
export function computarDiffLayout(
  from: LayoutElementRow[],
  to: LayoutElementRow[],
  contexto: ComputarDiffLayoutContext,
): LayoutDiff {
  const fromPorClave = new Map<string, LayoutElementRow>()
  for (const el of from) {
    const clave = claveEstableLayoutElement(el)
    if (clave) fromPorClave.set(clave, el)
  }
  const toPorClave = new Map<string, LayoutElementRow>()
  for (const el of to) {
    const clave = claveEstableLayoutElement(el)
    if (clave) toPorClave.set(clave, el)
  }

  const added: LayoutDiffActionItem[] = []
  const removed: LayoutDiffActionItem[] = []
  const changed: LayoutDiffFieldChange[] = []
  const refs = new Map<string, LayoutDiffElementoRef>()

  for (const el of to) {
    const clave = claveEstableLayoutElement(el)
    const par = clave ? fromPorClave.get(clave) : undefined
    if (!par) {
      added.push({ element_id: el.id, action: "added" })
      refs.set(el.id, refElemento(el, contexto.toVersion))
      continue
    }
    let tieneCambios = false
    for (const campo of CAMPOS_DIFF_LAYOUT) {
      const before = leerCampoLayout(par, campo)
      const after = leerCampoLayout(el, campo)
      if (before !== after) {
        changed.push({ element_id: el.id, field: campo, before, after })
        tieneCambios = true
      }
    }
    if (tieneCambios) refs.set(el.id, refElemento(el, contexto.toVersion))
  }

  for (const el of from) {
    const clave = claveEstableLayoutElement(el)
    const par = clave ? toPorClave.get(clave) : undefined
    if (!par) {
      removed.push({ element_id: el.id, action: "removed" })
      refs.set(el.id, refElemento(el, contexto.fromVersion))
    }
  }

  return {
    facility_id: contexto.facilityId,
    name: contexto.name,
    from_version: contexto.fromVersion,
    to_version: contexto.toVersion,
    added,
    removed,
    changed,
    counts: { added: added.length, removed: removed.length, changed: changed.length },
    elementos: Array.from(refs.values()),
  }
}

/** Diff-only element projection (id + stable key + the ten diffed fields). */
const DIFF_ELEMENTO_COLUMNS =
  "id, location_id, element_type, code, name, label, x, y, visual_width, visual_height, rotation, color, icon, is_visible"

/**
 * Shape a computed diff into the persisted `changes` jsonb (documented
 * §changes shape): same item records (element_id + field/before/after |
 * action) with their counts. Content is plain JSON-compatible objects,
 * matching the Json[] collection of `CambiosLayout`.
 */
export function aCambiosLayout(diff: LayoutDiff): CambiosLayout {
  return {
    from_version: diff.from_version,
    elements: [
      ...diff.added.map((item) => ({ element_id: item.element_id, action: item.action })),
      ...diff.removed.map((item) => ({ element_id: item.element_id, action: item.action })),
      ...diff.changed.map((item) => ({
        element_id: item.element_id,
        field: item.field,
        before: item.before,
        after: item.after,
      })),
    ],
    counts: diff.counts,
  }
}

/** Draft element payload for guardarBorrador; ids come from existing rows. */
export interface LayoutElementDraft {
  id?: string
  location_id?: string | null
  element_type: LayoutElementType
  code?: string | null
  name?: string | null
  description?: string | null
  x: number
  y: number
  visual_width: number | null
  visual_height: number | null
  rotation?: number
  color?: string | null
  icon?: string | null
  z_index?: number
  label?: string | null
  is_locked?: boolean
  is_visible?: boolean
}

export interface CrearVersionInput {
  facilityId: string
  name: string
  description?: string
  /** Copy the element set of this version into the new draft (create/restore). */
  baseVersionId?: string
  actorId?: string
}

export interface GuardarBorradorInput {
  layoutId: string
  description?: string
  escala?: number
  background?: Json | null
  /** Full intended visible set of the draft (upsert; missing rows are hidden). */
  elementos?: LayoutElementDraft[]
  actorId?: string
}

export interface CrearElementoInput {
  layoutId: string
  elementType: LayoutElementType
  x: number
  y: number
  visualWidth: number
  visualHeight: number
  color?: string | null
  icon?: string | null
  zIndex?: number
  label?: string | null
  name?: string | null
  actorId?: string
}

export interface EliminarElementoResultado {
  elementoBorrado: boolean
  aviso?: string
}

// ---------------------------------------------------------------------
// Editor taxonomy → location shape (ADR 0005 place type mapping)
// ---------------------------------------------------------------------

export const TIPO_CODIGO_PREFIJO: Record<LayoutElementType, string> = {
  playon: "PLAYON",
  warehouse: "GALPON",
  storage: "SECTOR",
  scanner: "SCANNER",
  scale: "BALANZA",
  quarantine: "REZAGO",
  seizure: "SECUESTRO",
  corridor: "CORREDOR",
  door: "PUERTA",
  other: "AREA",
}

export const TIPOS_LUGAR: ReadonlySet<LayoutElementType> = new Set([
  "playon",
  "warehouse",
  "storage",
  "scanner",
  "scale",
  "quarantine",
  "seizure",
])

/** Location shape each place element creates (ADR 0005 mapping table). */
export const PLACE_LOCATION: Record<LayoutElementType, Pick<LocationRow, "type" | "checkpoint_kind" | "allows_hold">> = {
  playon: { type: "playon", checkpoint_kind: null, allows_hold: false },
  warehouse: { type: "zone", checkpoint_kind: null, allows_hold: false },
  storage: { type: "zone", checkpoint_kind: null, allows_hold: false },
  scanner: { type: "checkpoint", checkpoint_kind: "scan", allows_hold: false },
  scale: { type: "checkpoint", checkpoint_kind: "scale", allows_hold: false },
  quarantine: { type: "zone", checkpoint_kind: null, allows_hold: true },
  seizure: { type: "zone", checkpoint_kind: null, allows_hold: true },
  corridor: { type: "zone", checkpoint_kind: null, allows_hold: false },
  door: { type: "zone", checkpoint_kind: null, allows_hold: false },
  other: { type: "zone", checkpoint_kind: null, allows_hold: false },
}

export interface LayoutService {
  /** Version history grouped by the client (ordered by version desc per name). */
  listarVersiones(filtros?: LayoutFiltros): Promise<LayoutVersionRow[]>
  obtenerLayout(id: string): Promise<LayoutVersionRow | null>
  /** One version + its visible elements (editor / read-only view). */
  obtenerLayoutConElementos(id: string): Promise<LayoutConElementos | null>
  /** The published layout of a facility + elements (map source; null if none). */
  obtenerLayoutPublicado(facilidadId: string): Promise<LayoutConElementos | null>
  /** The map projection: published layout + elements + locations + occupancy. */
  obtenerMapaOperativo(facilidadId: string): Promise<MapaOperativoResultado | null>
  /** Ubicaciones with an open quarantine/seizure (view v6 hold_open / demo mirror). */
  ubicacionesConHoldAbierto(facilidadId: string): Promise<string[]>
  /** First draft or a new draft copied from a base version (audit layout.create). */
  crearVersion(input: CrearVersionInput): Promise<LayoutConElementos>
  /**
   * Server-side diff between two versions (floor-plan-versioning.md
   * §Compare versions). `fromVersion` 0 means the empty baseline (first
   * publish preview); otherwise both versions must exist for
   * (facility_id, name). warehouse.read.
   */
  obtenerComparacionLayout(facilityId: string, name: string, fromVersion: number, toVersion: number): Promise<LayoutDiff>
  /** Persist a draft's meta + full element set (soft-delete the missing ones). */
  guardarBorrador(input: GuardarBorradorInput): Promise<LayoutConElementos>
  /** draft → published; archives other published versions (audit layout.publish). */
  publicarVersion(layoutId: string, cambios?: CambiosLayout | null, actorId?: string): Promise<LayoutVersionRow>
  /** New draft (version+1) copying this version's elements (audit layout.restore). */
  restaurarVersion(layoutId: string, actorId?: string): Promise<LayoutConElementos>
  /** Place element: creates the linked location too (auto code TIPO-001). */
  crearElemento(input: CrearElementoInput): Promise<LayoutElementRow>
  /** Soft-delete an element (is_visible=false; no RLS DELETE grant exists). */
  eliminarElemento(layoutId: string, elementId: string): Promise<EliminarElementoResultado>
}

export class SupabaseLayoutService implements LayoutService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  async listarVersiones(filtros?: LayoutFiltros): Promise<LayoutVersionRow[]> {
    const client = requireClient(this.client)
    let query = client
      .from("layouts")
      .select(`${LAYOUT_COLUMNS}, users(full_name)`)

    if (filtros?.facilidadId) query = query.eq("facility_id", filtros.facilidadId)
    if (filtros?.nombre) query = query.eq("name", filtros.nombre)
    if (filtros?.estado) query = query.eq("status", filtros.estado)

    query = query.order("name", { ascending: true }).order("version", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`layouts: ${error.message}`)
    return (data ?? []).map((row) => {
      const { users, ...layout } = row as LayoutRow & { users: { full_name: string }[] | null }
      return { ...layout, creador_nombre: users?.[0]?.full_name ?? null }
    })
  }

  async obtenerLayout(id: string): Promise<LayoutVersionRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("layouts")
      .select(`${LAYOUT_COLUMNS}, users(full_name)`)
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(`layout ${id}: ${error.message}`)
    if (!data) return null
    const { users, ...layout } = data as LayoutRow & { users: { full_name: string }[] | null }
    return { ...layout, creador_nombre: users?.[0]?.full_name ?? null }
  }

  private async listarElementosVisible(layoutId: string): Promise<LayoutElementRow[]> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("layout_elements")
      .select(LAYOUT_ELEMENT_COLUMNS)
      .eq("layout_id", layoutId)
      .eq("is_visible", true)
      .order("z_index", { ascending: true })
      .order("id", { ascending: true })
    if (error) throw new Error(`layout_elements ${layoutId}: ${error.message}`)
    return (data ?? []) as LayoutElementRow[]
  }

  async obtenerLayoutConElementos(id: string): Promise<LayoutConElementos | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("layouts")
      .select(LAYOUT_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(`layout ${id}: ${error.message}`)
    if (!data) return null
    return { layout: data as LayoutRow, elementos: await this.listarElementosVisible(id) }
  }

  /**
   * Server-side diff between two versions of (facility_id, name).
   *
   * DEVIATION (registered in the doc as "client-side join temporal, engine
   * server-side pendiente"): no SQL function for this exists in
   * supabase/migrations (0001..0006 reference layout_elements only for
   * DDL/RLS/triggers; 0005_views.sql has no diff), and this scaffold has no
   * Edge Functions, so the join runs HERE in the service over two selects
   * returning ONLY the diff columns of each version's visible element set.
   * The client component never receives the sets nor compares them. Home
   * for the engine-side diff: a SQL function
   * `public.comparar_layout_versions(_facility_id uuid, _name text,
   * _from int, _to int) returns jsonb` next to 0005_views.sql, called via
   * RPC once the Edge Function / RPC path lands.
   */
  async obtenerComparacionLayout(
    facilityId: string,
    name: string,
    fromVersion: number,
    toVersion: number,
  ): Promise<LayoutDiff> {
    const client = requireClient(this.client)

    const { data: filas, error } = await client
      .from("layouts")
      .select("id, version")
      .eq("facility_id", facilityId)
      .eq("name", name)
      .in("version", [fromVersion, toVersion])
    if (error) throw new Error(`layouts ${name}: ${error.message}`)
    const idPorVersion = new Map((filas ?? []).map((f) => [f.version as number, f.id as string]))

    const fromLayoutId = idPorVersion.get(fromVersion)
    const toLayoutId = idPorVersion.get(toVersion)
    if (fromVersion > 0 && !fromLayoutId) throw new Error(`versión ${fromVersion} de "${name}" no existe`)
    if (!toLayoutId) throw new Error(`versión ${toVersion} de "${name}" no existe`)

    const [fromRes, toRes] = await Promise.all([
      fromLayoutId
        ? client
            .from("layout_elements")
            .select(DIFF_ELEMENTO_COLUMNS)
            .eq("layout_id", fromLayoutId)
            .eq("is_visible", true)
        : Promise.resolve({ data: [], error: null }),
      client
        .from("layout_elements")
        .select(DIFF_ELEMENTO_COLUMNS)
        .eq("layout_id", toLayoutId)
        .eq("is_visible", true),
    ])
    if (fromRes.error) throw new Error(`layout_elements ${fromLayoutId}: ${fromRes.error.message}`)
    if (toRes.error) throw new Error(`layout_elements ${toLayoutId}: ${toRes.error.message}`)

    return computarDiffLayout(
      (fromRes.data ?? []) as LayoutElementRow[],
      (toRes.data ?? []) as LayoutElementRow[],
      { facilityId, name, fromVersion, toVersion },
    )
  }

  async obtenerLayoutPublicado(facilidadId: string): Promise<LayoutConElementos | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("layouts")
      .select(LAYOUT_COLUMNS)
      .eq("facility_id", facilidadId)
      .eq("status", "published")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw new Error(`layout publicado ${facilidadId}: ${error.message}`)
    if (!data) return null
    const layout = data as LayoutRow
    return { layout, elementos: await this.listarElementosVisible(layout.id) }
  }

  async obtenerMapaOperativo(facilidadId: string): Promise<MapaOperativoResultado | null> {
    const published = await this.obtenerLayoutPublicado(facilidadId)
    if (!published) return null

    const client = requireClient(this.client)
    const [locationsRes, occupancyRes] = await Promise.all([
      client.from("locations").select(LOCATION_COLUMNS).eq("facility_id", facilidadId),
      client
        .from("location_occupancy")
        .select(LOCATION_OCCUPANCY_COLUMNS)
        .eq("facility_id", facilidadId),
    ])
    if (locationsRes.error) throw new Error(`locations: ${locationsRes.error.message}`)
    if (occupancyRes.error) throw new Error(`location_occupancy: ${occupancyRes.error.message}`)

    const locations = (locationsRes.data ?? []) as LocationRow[]
    const occupancy = (occupancyRes.data ?? []) as LocationOccupancyRow[]
    const locationById = new Map(locations.map((l) => [l.id, l]))
    const occupancyByLocation = new Map(occupancy.map((o) => [o.location_id, o]))

    return {
      layout: published.layout,
      elementos: published.elementos.map((elemento) => ({
        elemento,
        ubicacion: elemento.location_id ? locationById.get(elemento.location_id) ?? null : null,
        ocupacion: elemento.location_id ? occupancyByLocation.get(elemento.location_id) ?? null : null,
      })),
    }
  }

  async ubicacionesConHoldAbierto(_facilidadId: string): Promise<string[]> {
    const client = requireClient(this.client)
    // v6 hold_open (security_invoker): base RLS of operations/lots applies;
    // the view has no facility_id column, org scoping comes from RLS.
    const { data, error } = await client
      .from("hold_open")
      .select("current_location_id")
      .eq("status", "open")
      .not("current_location_id", "is", null)
    if (error) throw new Error(`hold_open: ${error.message}`)
    return Array.from(
      new Set(
        (data ?? [])
          .map((row) => (row as { current_location_id: string | null }).current_location_id)
          .filter((id): id is string => id !== null),
      ),
    )
  }

  async crearVersion(input: CrearVersionInput): Promise<LayoutConElementos> {
    const client = requireClient(this.client)

    const { data: maxRow, error: maxError } = await client
      .from("layouts")
      .select("version")
      .eq("facility_id", input.facilityId)
      .eq("name", input.name)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxError) throw new Error(`layouts max version ${input.name}: ${maxError.message}`)
    const version = ((maxRow?.version as number | undefined) ?? 0) + 1

    const { data, error } = await client
      .from("layouts")
      .insert({
        facility_id: input.facilityId,
        name: input.name,
        version,
        status: "draft",
        created_by: input.actorId ?? null,
        description: input.description ?? null,
      })
      .select(LAYOUT_COLUMNS)
      .single()
    if (error) throw new Error(`layout insert: ${error.message}`)
    const layout = data as LayoutRow

    let elementos: LayoutElementRow[] = []
    if (input.baseVersionId) {
      const source = await this.listarElementosVisible(input.baseVersionId)
      if (source.length > 0) {
        const { error: copyError } = await client.from("layout_elements").insert(
          source.map(({ id: _id, layout_id: _layoutId, created_at: _ca, updated_at: _ua, ...rest }) => ({
            ...rest,
            layout_id: layout.id,
          })),
        )
        if (copyError) throw new Error(`layout elements copy: ${copyError.message}`)
      }
      elementos = await this.listarElementosVisible(layout.id)
    }

    return { layout, elementos }
  }

  async guardarBorrador(input: GuardarBorradorInput): Promise<LayoutConElementos> {
    const client = requireClient(this.client)

    const { error: metaError } = await client
      .from("layouts")
      .update({
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.escala !== undefined ? { scale: input.escala } : {}),
        ...(input.background !== undefined ? { background: input.background } : {}),
      })
      .eq("id", input.layoutId)
      .eq("status", "draft")
    if (metaError) throw new Error(`layout meta update ${input.layoutId}: ${metaError.message}`)

    const drafts = (input.elementos ?? []).map((e) => ({
      ...e,
      is_visible: e.is_visible ?? true,
      rotation: e.rotation ?? 0,
      z_index: e.z_index ?? 0,
    }))
    const withId = drafts.filter((e) => e.id)
    const withoutId = drafts.filter((e) => !e.id)

    if (withId.length > 0) {
      const { error } = await client
        .from("layout_elements")
        .upsert(withId.map(({ id, ...rest }) => ({ id, layout_id: input.layoutId, ...rest })))
      if (error) throw new Error(`layout elements upsert: ${error.message}`)
    }
    if (withoutId.length > 0) {
      const { error } = await client
        .from("layout_elements")
        .insert(withoutId.map((rest) => ({ layout_id: input.layoutId, ...rest })))
      if (error) throw new Error(`layout elements insert: ${error.message}`)
    }

    // Soft-hide elements that left the intended set (no RLS DELETE grant).
    const { data: existing, error: existingError } = await client
      .from("layout_elements")
      .select("id")
      .eq("layout_id", input.layoutId)
      .eq("is_visible", true)
    if (existingError) throw new Error(`layout elements ids: ${existingError.message}`)
    const incomingIds = new Set(withId.map((e) => e.id as string))
    const hidden = (existing ?? [])
      .map((r) => (r as { id: string }).id)
      .filter((id) => !incomingIds.has(id))
    if (hidden.length > 0) {
      const { error: hideError } = await client
        .from("layout_elements")
        .update({ is_visible: false })
        .eq("layout_id", input.layoutId)
        .in("id", hidden)
      if (hideError) throw new Error(`layout elements hide: ${hideError.message}`)
    }

    return { layout: (await this.obtenerLayout(input.layoutId))!, elementos: await this.listarElementosVisible(input.layoutId) }
  }

  async publicarVersion(layoutId: string, cambios?: CambiosLayout | null, _actorId?: string): Promise<LayoutVersionRow> {
    const client = requireClient(this.client)
    const layout = await this.obtenerLayout(layoutId)
    if (!layout) throw new Error(`layout ${layoutId} no existe`)
    if (layout.status !== "draft") throw new Error(`solo versiones borrador se publican (${layout.status})`)

    const { error: archiveError } = await client
      .from("layouts")
      .update({ status: "archived" })
      .eq("facility_id", layout.facility_id)
      .eq("name", layout.name)
      .eq("status", "published")
      .neq("id", layout.id)
    if (archiveError) throw new Error(`archive published layouts: ${archiveError.message}`)

    const { data, error } = await client
      .from("layouts")
      .update({ status: "published", changes: cambios ?? layout.changes })
      .eq("id", layout.id)
      .select(LAYOUT_COLUMNS)
      .single()
    // Note: audit row (layout.publish) is appended server-side (engine/trigger);
    // the client has no INSERT policy on audit_log (0004_rls.sql).
    if (error) throw new Error(`publish layout ${layoutId}: ${error.message}`)
    return data as LayoutVersionRow
  }

  async restaurarVersion(layoutId: string, actorId?: string): Promise<LayoutConElementos> {
    const source = await this.obtenerLayout(layoutId)
    if (!source) throw new Error(`layout ${layoutId} no existe`)
    const version = await this.crearVersion({
      facilityId: source.facility_id,
      name: source.name,
      description: `Restaurado desde versión ${source.version}`,
      baseVersionId: source.id,
      actorId,
    })
    return version
  }

  async crearElemento(input: CrearElementoInput): Promise<LayoutElementRow> {
    const client = requireClient(this.client)
    const esLugar = TIPOS_LUGAR.has(input.elementType)

    const { data: layoutRow, error: layoutError } = await client
      .from("layouts")
      .select("facility_id")
      .eq("id", input.layoutId)
      .maybeSingle()
    if (layoutError) throw new Error(`layout ${input.layoutId}: ${layoutError.message}`)
    if (!layoutRow) throw new Error(`layout ${input.layoutId} no existe`)
    const facilityId = layoutRow.facility_id as string

    let locationId: string | null = null
    if (esLugar) {
      const location = PLACE_LOCATION[input.elementType]
      const codigo = await this.proximoCodigoLocation(client, input.elementType)
      const { data, error } = await client
        .from("locations")
        .insert({
          facility_id: facilityId,
          code: codigo,
          name: codigo,
          type: location.type,
          checkpoint_kind: location.checkpoint_kind,
          allows_hold: location.allows_hold,
        })
        .select(LOCATION_COLUMNS)
        .single()
      if (error) throw new Error(`location create: ${error.message}`)
      locationId = (data as LocationRow).id
    }

    const { data, error } = await client
      .from("layout_elements")
      .insert({
        layout_id: input.layoutId,
        location_id: locationId,
        element_type: input.elementType,
        x: input.x,
        y: input.y,
        visual_width: input.visualWidth,
        visual_height: input.visualHeight,
        rotation: 0,
        color: input.color ?? null,
        icon: input.icon ?? null,
        z_index: input.zIndex ?? 0,
        label: input.label ?? null,
        name: esLugar ? null : input.name ?? null,
        is_locked: false,
        is_visible: true,
      })
      .select(LAYOUT_ELEMENT_COLUMNS)
      .single()
    if (error) throw new Error(`layout element insert: ${error.message}`)
    return data as LayoutElementRow
  }

  async eliminarElemento(layoutId: string, elementId: string): Promise<EliminarElementoResultado> {
    const client = requireClient(this.client)
    const { data: row, error: rowError } = await client
      .from("layout_elements")
      .select(LAYOUT_ELEMENT_COLUMNS)
      .eq("id", elementId)
      .eq("layout_id", layoutId)
      .maybeSingle()
    if (rowError) throw new Error(`layout element ${elementId}: ${rowError.message}`)
    if (!row) return { elementoBorrado: false }

    const { error } = await client
      .from("layout_elements")
      .update({ is_visible: false })
      .eq("id", elementId)
    if (error) throw new Error(`layout element hide ${elementId}: ${error.message}`)

    const elemento = row as LayoutElementRow
    const esLugar = elemento.location_id !== null
    return {
      elementoBorrado: true,
      aviso: esLugar
        ? "El elemento se ocultó del plano; la ubicación y su historial se conservan (sin borrado físico por RLS)."
        : undefined,
    }
  }

  private async proximoCodigoLocation(client: SupabaseClient, elementType: LayoutElementType): Promise<string> {
    const prefijo = TIPO_CODIGO_PREFIJO[elementType]
    const { data, error } = await client
      .from("locations")
      .select("code")
      .ilike("code", `${prefijo}-%`)
      .limit(500)
    if (error) throw new Error(`locations codes: ${error.message}`)
    let max = 0
    for (const row of data ?? []) {
      const match = /^[A-Z]+-(\d+)$/.exec((row as { code: string }).code)
      if (match) max = Math.max(max, Number.parseInt(match[1], 10))
    }
    return `${prefijo}-${String(max + 1).padStart(3, "0")}`
  }
}