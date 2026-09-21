/**
 * Audit service — read-only projection of audit_log (Fase 13, ADR 0014).
 *
 * Writes are trigger/engine-only: RLS grants NO INSERT/UPDATE/DELETE on
 * audit_log (0004_rls.sql, audit.md §Registration doctrine) — this service
 * is intentionally read-only. Reads require 'audit.read' (admin + auditor).
 * Filters follow audit.md §Query design; all reads are bounded.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { AUDIT_LOG_COLUMNS } from "@/services/columns"
import type { AuditLogFiltros } from "@/services/shared"
import type { AuditLogRow } from "@/types"

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

export interface AuditService {
  listarAudit(filtros?: AuditLogFiltros): Promise<AuditLogRow[]>
  detalle(id: number): Promise<AuditLogRow | null>
}

export class SupabaseAuditService implements AuditService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  async listarAudit(filtros?: AuditLogFiltros): Promise<AuditLogRow[]> {
    const client = requireClient(this.client)
    let query = client.from("audit_log").select(AUDIT_LOG_COLUMNS)

    if (filtros?.actorId) query = query.eq("actor_id", filtros.actorId)
    if (filtros?.action) query = query.eq("action", filtros.action)
    if (filtros?.entityType) query = query.eq("entity_type", filtros.entityType)
    if (filtros?.entityId) query = query.eq("entity_id", filtros.entityId)
    if (filtros?.since) query = query.gte("created_at", filtros.since)
    if (filtros?.until) query = query.lt("created_at", filtros.until)

    query = query.order("created_at", { ascending: false })
    query = applyWindow(query, filtros)

    const { data, error } = await query
    if (error) throw new Error(`audit_log: ${error.message}`)
    return (data ?? []) as AuditLogRow[]
  }

  async detalle(id: number): Promise<AuditLogRow | null> {
    const client = requireClient(this.client)
    const { data, error } = await client
      .from("audit_log")
      .select(AUDIT_LOG_COLUMNS)
      .eq("id", id)
      .maybeSingle()
    if (error) throw new Error(`audit_log ${id}: ${error.message}`)
    return (data as AuditLogRow | null) ?? null
  }
}