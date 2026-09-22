/**
 * Audit service — read-only projection of audit_log (Fase 13, ADR 0014).
 *
 * Writes are trigger/engine-only: RLS grants NO INSERT/UPDATE/DELETE on
 * audit_log (0004_rls.sql, audit.md §Registration doctrine) — this service
 * is intentionally read-only. Reads require 'audit.read' (admin + auditor).
 *
 * Query design follows audit.md §Query design:
 *   - Order: created_at desc, id desc (database.md §4.9 indexes).
 *   - Every read is bounded: `pagina.pageSize` clamps to [1, 100]; the
 *     client never pulls unbounded history (AU-71).
 *   - Camión: the filter accepts a truck id OR a plate; a plate is
 *     resolved server-side to the truck id (audit.md §Query design,
 *     AU-44) before applying `entity_type='truck' AND entity_id=$1`.
 *   - Mercadería: `entity_type IN (cargo_item,item_lot,cargo_manifest)
 *     AND entity_id=$1` (AU-45).
 *   - Fecha: `created_at >= since AND created_at < until` (day bucket;
 *     the facility-timezone edge is the ADR 0013 server helper — the
 *     client sends UTC-bound ISO instants and the DB enforces RLS scope).
 *
 * There is NO delete, NO edit, NO revert surface anywhere in this module
 * (audit.md §Retention & no-delete; AU-33).
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { AUDIT_LOG_COLUMNS } from "@/services/columns"
import type { AuditLogFiltros } from "@/services/shared"
import { normalizePlate } from "@/services/truckService"
import type { AuditLogRow } from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

/** Hard cap on the audit window — the audit list NEVER loads more. */
export const AUDIT_PAGE_SIZE_MAX = 100

/**
 * Clamps a 1-based page window (shared by the Supabase and DEMO adapters
 * so both sides enforce the identical bounded-read contract, AU-71).
 */
export function normalizarPaginaAudit(pagina?: PaginaAudit): PaginaAudit {
  const page = Math.max(1, Math.floor(pagina?.page ?? 1))
  const pageSize = Math.min(AUDIT_PAGE_SIZE_MAX, Math.max(1, Math.floor(pagina?.pageSize ?? 25)))
  return { page, pageSize }
}

/** 1-based page window; pageSize clamps to [1, AUDIT_PAGE_SIZE_MAX]. */
export interface PaginaAudit {
  page: number
  pageSize: number
}

export interface AuditPageResult {
  filas: AuditLogRow[]
  total: number
}

/** Canonical `entity.verb` code + stable UI label (audit.md Action catalog). */
export interface ActionCode {
  code: string
  label: string
}

/** Org-scoped actor option for the Usuario filter (audit.md §Query design). */
export interface ActorOption {
  id: string
  nombre: string
}

/**
 * The 16 critical codes (audit.md §Action catalog) + the Fase 14 layout
 * extension (layout.create/publish/restore, ADR 0015). `action` remains
 * free text by convention, so extension codes (user.invite, role.change,
 * movement.split, …) stay visible in the log even when not selectable
 * here — the filter only offers the canonical catalog.
 */
export const ACTION_CATALOG: readonly ActionCode[] = [
  { code: "truck.create", label: "Crear camión" },
  { code: "truck.arrival", label: "Ingreso de camión" },
  { code: "truck.egress", label: "Egreso de camión" },
  { code: "cargo.create", label: "Crear mercadería" },
  { code: "cargo.edit", label: "Editar mercadería" },
  { code: "cargo.delete", label: "Eliminar mercadería" },
  { code: "movement.transfer", label: "Transferencia" },
  { code: "movement.discharge", label: "Descarga" },
  { code: "operation.load", label: "Carga" },
  { code: "operation.scale", label: "Pesaje" },
  { code: "operation.scan", label: "Escaneo" },
  { code: "operation.quarantine", label: "Rezago" },
  { code: "operation.seizure", label: "Secuestro" },
  { code: "capacity.set", label: "Modificar capacidad" },
  { code: "layout.edit", label: "Modificar plano" },
  { code: "permission.change", label: "Modificar permisos" },
  { code: "layout.create", label: "Crear plano" },
  { code: "layout.publish", label: "Publicar plano" },
  { code: "layout.restore", label: "Restaurar plano" },
]

/**
 * Entity types exposed by the Entidad filter (audit.md §Query design;
 * writers register `entity_type` as the table/entity name — this is the
 * convention list the filter offers, not an exhaustive schema enum).
 */
export const AUDIT_ENTITY_TYPES: readonly string[] = [
  "truck",
  "cargo_item",
  "item_lot",
  "cargo_manifest",
  "movement",
  "user",
  "location",
  "layout",
  "layout_element",
]

export interface AuditService {
  /**
   * Filtered + paginated audit rows, newest first (created_at desc,
   * id desc for ties). `filtros.truckId` accepts a truck id OR a plate
   * (plate→id resolution happens server-side; an unresolvable truck
   * yields an empty page, never a client-side bucket).
   */
  listarAudit(filtros?: AuditLogFiltros, pagina?: PaginaAudit): Promise<AuditPageResult>
  obtenerDetalle(id: number): Promise<AuditLogRow | null>
  obtenerCatalogoAcciones(): Promise<ActionCode[]>
  obtenerActores(): Promise<ActorOption[]>
}

export class SupabaseAuditService implements AuditService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  /** audit.md §Query design — additive AND predicates (AU-46). */
  private applyFiltros<T extends { eq: (col: string, v: unknown) => T; in: (col: string, v: unknown[]) => T; gte: (col: string, v: unknown) => T; lt: (col: string, v: unknown) => T }>(
    query: T,
    filtros?: AuditLogFiltros,
  ): T {
    let q = query
    if (filtros?.actorId) q = q.eq("actor_id", filtros.actorId)
    if (filtros?.action) q = q.eq("action", filtros.action)
    if (filtros?.entityType) q = q.eq("entity_type", filtros.entityType)
    if (filtros?.entityId) q = q.eq("entity_id", filtros.entityId)
    if (filtros?.truckId) q = q.eq("entity_type", "truck").eq("entity_id", filtros.truckId)
    if (filtros?.mercaderiaId) {
      q = q.in("entity_type", ["cargo_item", "item_lot", "cargo_manifest"]).eq("entity_id", filtros.mercaderiaId)
    }
    if (filtros?.since) q = q.gte("created_at", filtros.since)
    if (filtros?.until) q = q.lt("created_at", filtros.until)
    return q
  }

  /**
   * Camión filter resolution: a truck id matches directly; anything else
   * is treated as a plate and normalized (trim + uppercase) before the
   * lookup (audit.md §Query design, AU-44).
   */
  private async resolverCamion(truckId: string): Promise<string | null> {
    const client = requireClient(this.client)
    const { data: porId } = await client.from("trucks").select("id").eq("id", truckId).maybeSingle()
    if (porId) return porId.id
    const placa = normalizePlate(truckId)
    const { data: porPlaca } = await client.from("trucks").select("id").eq("plate", placa).maybeSingle()
    return porPlaca?.id ?? null
  }

  async listarAudit(filtros?: AuditLogFiltros, pagina?: PaginaAudit): Promise<AuditPageResult> {
    const client = requireClient(this.client)
    const { page, pageSize } = normalizarPaginaAudit(pagina)

    let truckId: string | null | undefined = filtros?.truckId
    if (truckId) {
      truckId = await this.resolverCamion(truckId)
      // Plate that maps to no truck → no possible audit rows (AU-44).
      if (!truckId) return { filas: [], total: 0 }
    }

    // One bounded query: exact count + the window in the same round trip
    // (PostgREST count=exact; AU-71 keeps the window capped).
    const query = client.from("audit_log").select(AUDIT_LOG_COLUMNS, { count: "exact" })
    const filtrada = this.applyFiltros(query, { ...filtros, truckId: truckId ?? undefined })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1)

    const { data, error, count } = await filtrada
    if (error) throw new Error(`audit_log: ${error.message}`)
    return { filas: (data ?? []) as AuditLogRow[], total: count ?? 0 }
  }

  async obtenerDetalle(id: number): Promise<AuditLogRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("audit_log")
      .select(AUDIT_LOG_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(`audit_log ${id}: ${error.message}`)
    return (data as AuditLogRow | null) ?? null
  }

  async obtenerCatalogoAcciones(): Promise<ActionCode[]> {
    return [...ACTION_CATALOG]
  }

  async obtenerActores(): Promise<ActorOption[]> {
    const client = requireClient(this.client)
    // Org-scoped by RLS; bounded read reused for the filter and for
    // resolving actor_id → name in the table (AU-72 "sistema" fallback).
    const { data, error } = await client
      .from("users")
      .select("id, full_name")
      .order("full_name", { ascending: true })
      .limit(500)
    if (error) throw new Error(`users: ${error.message}`)
    return (data ?? []).map((usuario) => ({
      id: usuario.id,
      nombre: usuario.full_name ?? usuario.id,
    }))
  }
}