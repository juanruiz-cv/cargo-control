/**
 * Report service (T14, E10-2) — 10 warehouse reports, aggregated/bounded
 * server-side only.
 *
 * Design contracts (operational-dashboard.md, audit.md, special-areas.md):
 *   - Every report row is produced by an EXISTING bounded service (trucks,
 *     cargo, movements, stations, holds, audit, dashboard, locations) or a
 *     direct bounded `in()` enrichment query. The client NEVER aggregates
 *     raw history; the only client-side sums are row-assembly quantities
 *     over the bounded current page (e.g. Σ items of the manifests being
 *     shown) — never statistics.
 *   - The same `columnas[i].formato` renders the table AND the CSV export
 *     (csv.ts): export = the visible table, no second formatting path.
 *     Column arrays are exported consts shared by the Supabase and demo
 *     implementations so both render identically.
 *   - Permissions: the page hides report tabs the caller cannot read
 *     (rbac.md); RLS enforces reads on Supabase; the demo adapter mirrors
 *     via requirePermission.
 *   - `agregado: true` rows come from the dashboard_* aggregated views
 *     (v8) — never paginated client-side. `paginable: false` marks fixed
 *     bounded snapshots (e.g. Ingresos/Egresos detalle, ≤500 rows).
 *
 * Deviation (documented): "Estadísticas operativas" is NOT offered — the
 * dashboard already presents the KPIs; the reports mandate (E10-1/E10-2)
 * says "no duplicar" information already on-screen.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { MOVEMENT_KIND_LABELS, TRUCK_BASE_STATUS_LABELS } from "@/components/trucks/truckStatus"
import { SupabaseAuditService } from "@/services/auditService"
import { SupabaseCargoService } from "@/services/cargoService"
import { SupabaseDashboardService } from "@/services/dashboardService"
import { SupabaseHoldService } from "@/services/holdService"
import { SupabaseLocationService } from "@/services/locationService"
import { SupabaseMovementService } from "@/services/movementService"
import { SupabaseStationService } from "@/services/stationService"
import { SupabaseTruckService } from "@/services/truckService"
import type {
  ManifestFiltros,
  QuarantineHoldFiltros,
  ScannerOpFiltros,
  ScaleOpFiltros,
  SeizureHoldFiltros,
  TruckFiltros,
} from "@/services/shared"
import type {
  CargoManifestStatus,
  ItemLotRow,
  MovementKind,
  PermissionCode,
  QuarantineStatus,
  ScannerResult,
  SeizureStatus,
  TruckStatus,
} from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

// ---------------------------------------------------------------------
// Contract (shared by the Supabase and demo implementations)
// ---------------------------------------------------------------------

export type ReporteId =
  | "camiones"
  | "ingresosEgresos"
  | "carga"
  | "movimientos"
  | "ocupacion"
  | "scanner"
  | "balanza"
  | "rezago"
  | "secuestro"
  | "auditoria"

/** One display column; `formato` renders the value for the table AND the CSV. */
export interface ColumnaReporte {
  clave: string
  titulo: string
  formato?: (valor: unknown) => string
}

export interface FiltrosReporte {
  /** ISO instants: desde = inclusive day start, hasta = exclusive upper edge. */
  desde?: string
  hasta?: string
  /** Module status axes (camiones/carga/rezago/secuestro). */
  estado?: string
  /** Camión plate (camiones `buscar`, ingresosEgresos detalle). */
  placa?: string
  resultado?: ScannerResult
  dentroTolerancia?: boolean
  kind?: MovementKind
  accion?: string
}

export interface PaginaReporte {
  limit: number
  offset: number
}

export type FilaReporte = Record<string, unknown>

export interface ResultadoReporte {
  columnas: readonly ColumnaReporte[]
  filas: FilaReporte[]
  total: number
  /** Rows come from an aggregated server-side view — never paginated. */
  agregado: boolean
  /** False = fixed bounded snapshot (single page by design). */
  paginable: boolean
}

export interface ReporteConfig {
  id: ReporteId
  titulo: string
  descripcion: string
  permiso: PermissionCode
  /** Which filter controls the page renders for this report. */
  fecha: boolean
  estado?: boolean
  placa?: boolean
  resultado?: boolean
  tolerancia?: boolean
  kind?: boolean
  accion?: boolean
}

export const REPORTES: readonly ReporteConfig[] = [
  {
    id: "camiones",
    titulo: "Camiones",
    descripcion: "Flota y actividad por camión (señales derivadas, T-21).",
    permiso: "truck.read",
    fecha: false,
    estado: true,
    placa: true,
  },
  {
    id: "ingresosEgresos",
    titulo: "Ingresos / Egresos",
    descripcion: "Resumen diario agregado; con patente, detalle por movimiento.",
    permiso: "truck.read",
    fecha: true,
    placa: true,
  },
  {
    id: "carga",
    titulo: "Carga",
    descripcion: "Cargamentos con cantidades y peso estimado.",
    permiso: "cargo.read",
    fecha: true,
    estado: true,
  },
  {
    id: "movimientos",
    titulo: "Movimientos",
    descripcion: "Movimientos por día y tipo (agregado v8).",
    permiso: "cargo.read",
    fecha: true,
    kind: true,
  },
  {
    id: "ocupacion",
    titulo: "Ocupación",
    descripcion: "Snapshot de ocupación por ubicación y por sector.",
    permiso: "warehouse.read",
    fecha: false,
  },
  {
    id: "scanner",
    titulo: "Scanner",
    descripcion: "Capturas de escáner (append-only, ADR 0011).",
    permiso: "scanner.read",
    fecha: true,
    resultado: true,
  },
  {
    id: "balanza",
    titulo: "Balanza",
    descripcion: "Pesajes con tolerancia (append-only, ADR 0011).",
    permiso: "scale.read",
    fecha: true,
    tolerancia: true,
  },
  {
    id: "rezago",
    titulo: "Rezago",
    descripcion: "Casos de cuarentena (rezago) y su resolución.",
    permiso: "quarantine.read",
    fecha: true,
    estado: true,
  },
  {
    id: "secuestro",
    titulo: "Secuestro",
    descripcion: "Casos de medida judicial y su documentación.",
    permiso: "seizure.read",
    fecha: true,
    estado: true,
  },
  {
    id: "auditoria",
    titulo: "Auditoría",
    descripcion: "Traza de auditoría (append-only, ADR 0014).",
    permiso: "audit.read",
    fecha: true,
    accion: true,
  },
]

export const REPORTE_POR_ID: ReadonlyMap<ReporteId, ReporteConfig> = new Map(
  REPORTES.map((reporte) => [reporte.id, reporte]),
)

export interface ReportService {
  generar(reporte: ReporteId, filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte>
}

// ---------------------------------------------------------------------
// Label maps + es-AR formatters — the ONLY formatting path: the page
// table and the CSV export both call columnas[i].formato.
// ---------------------------------------------------------------------

const MANIFEST_STATUS_LABELS: Record<CargoManifestStatus, string> = {
  received: "Recibido",
  in_playon: "En playa",
  in_control: "En control",
  discharging: "Descargando",
  discharged: "Descargado",
  distributed: "Distribuido",
  closed: "Cerrado",
}

const SCANNER_RESULT_LABELS: Record<ScannerResult, string> = {
  success: "Éxito",
  not_found: "No encontrado",
  ambiguous: "Ambiguo",
  error: "Error",
}

const QUARANTINE_STATUS_LABELS: Record<QuarantineStatus, string> = {
  open: "Abierto",
  resolved: "Resuelto",
  released: "Liberado",
}

const SEIZURE_STATUS_LABELS: Record<SeizureStatus, string> = {
  open: "Abierto",
  resolved: "Resuelto",
}

const FECHA_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})
const SOLO_DIA = new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "short", year: "numeric" })
const ENTERO = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 })

function fechaHora(iso: unknown): string {
  if (iso === null || iso === undefined) return "—"
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso)
  return FECHA_HORA.format(d)
}

function fechaDia(iso: unknown): string {
  if (iso === null || iso === undefined) return "—"
  const d = new Date(String(iso))
  if (Number.isNaN(d.getTime())) return String(iso)
  return SOLO_DIA.format(d)
}

function entero(valor: unknown): string {
  if (valor === null || valor === undefined) return "—"
  const n = Number(valor)
  return Number.isFinite(n) ? ENTERO.format(n) : "—"
}

function pct(valor: unknown): string {
  if (valor === null || valor === undefined) return "—"
  const n = Number(valor)
  return Number.isFinite(n) ? `${ENTERO.format(n)}%` : "—"
}

function siNo(valor: unknown): string {
  if (valor === null || valor === undefined) return "—"
  return valor === true ? "Sí" : valor === false ? "No" : "—"
}

function texto(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  return String(valor)
}

const TIPO = (v: unknown): string => MOVEMENT_KIND_LABELS[v as MovementKind] ?? texto(v)
const ESTADO_CAMION = (v: unknown): string => TRUCK_BASE_STATUS_LABELS[v as TruckStatus] ?? texto(v)
const ESTADO_MANIFEST = (v: unknown): string => MANIFEST_STATUS_LABELS[v as CargoManifestStatus] ?? texto(v)
const RESULTADO_SCANNER = (v: unknown): string => SCANNER_RESULT_LABELS[v as ScannerResult] ?? texto(v)
const ESTADO_REZAGO = (v: unknown): string => QUARANTINE_STATUS_LABELS[v as QuarantineStatus] ?? texto(v)
const ESTADO_SECUESTRO = (v: unknown): string => SEIZURE_STATUS_LABELS[v as SeizureStatus] ?? texto(v)

// ---------------------------------------------------------------------
// Shared column definitions (single source for table + CSV in BOTH
// adapters — the demo mirror reuses these exact arrays).
// ---------------------------------------------------------------------

export const COLUMNAS_CAMIONES: readonly ColumnaReporte[] = [
  { clave: "placa", titulo: "Patente", formato: texto },
  { clave: "estado", titulo: "Estado", formato: ESTADO_CAMION },
  { clave: "manifiestos", titulo: "Manifiestos", formato: entero },
  { clave: "ingresos", titulo: "Ingresos", formato: entero },
  { clave: "egresos", titulo: "Egresos", formato: entero },
  { clave: "descargas", titulo: "Descargas", formato: entero },
  { clave: "primeraLlegada", titulo: "Primera llegada", formato: fechaDia },
  { clave: "ultimoEgreso", titulo: "Último egreso", formato: fechaDia },
  { clave: "ultimaOperacion", titulo: "Última operación", formato: fechaHora },
]

export const COLUMNAS_INGRESOS_EGRESOS_RESUMEN: readonly ColumnaReporte[] = [
  { clave: "dia", titulo: "Día", formato: fechaDia },
  { clave: "ingresos", titulo: "Ingresos", formato: entero },
  { clave: "egresos", titulo: "Egresos", formato: entero },
]

export const COLUMNAS_INGRESOS_EGRESOS_DETALLE: readonly ColumnaReporte[] = [
  { clave: "fecha", titulo: "Fecha", formato: fechaHora },
  { clave: "placa", titulo: "Patente", formato: texto },
  { clave: "tipo", titulo: "Tipo", formato: TIPO },
  { clave: "operador", titulo: "Operador", formato: texto },
]

export const COLUMNAS_CARGA: readonly ColumnaReporte[] = [
  { clave: "codigo", titulo: "Código", formato: texto },
  { clave: "placa", titulo: "Patente", formato: texto },
  { clave: "estado", titulo: "Estado", formato: ESTADO_MANIFEST },
  { clave: "cantidad", titulo: "Cantidad", formato: entero },
  { clave: "peso", titulo: "Peso (kg)", formato: entero },
  { clave: "destino", titulo: "Destino", formato: texto },
]

export const COLUMNAS_MOVIMIENTOS: readonly ColumnaReporte[] = [
  { clave: "dia", titulo: "Día", formato: fechaDia },
  { clave: "tipo", titulo: "Tipo", formato: TIPO },
  { clave: "cantidad", titulo: "Cantidad", formato: entero },
]

export const COLUMNAS_OCUPACION: readonly ColumnaReporte[] = [
  { clave: "ubicacion", titulo: "Ubicación", formato: texto },
  { clave: "ocupadas", titulo: "Ocupadas", formato: entero },
  { clave: "capacidad", titulo: "Capacidad", formato: entero },
  { clave: "pct", titulo: "Ocupación", formato: pct },
  { clave: "kg", titulo: "Kg", formato: entero },
  { clave: "m3", titulo: "m³", formato: entero },
]

export const COLUMNAS_SCANNER: readonly ColumnaReporte[] = [
  { clave: "fecha", titulo: "Fecha", formato: fechaHora },
  { clave: "lote", titulo: "Lote", formato: texto },
  { clave: "mercaderia", titulo: "Mercadería", formato: texto },
  { clave: "codigo", titulo: "Código", formato: texto },
  { clave: "resultado", titulo: "Resultado", formato: RESULTADO_SCANNER },
  { clave: "operador", titulo: "Operador", formato: texto },
]

export const COLUMNAS_BALANZA: readonly ColumnaReporte[] = [
  { clave: "fecha", titulo: "Fecha", formato: fechaHora },
  { clave: "lote", titulo: "Lote", formato: texto },
  { clave: "mercaderia", titulo: "Mercadería", formato: texto },
  { clave: "neto", titulo: "Neto (kg)", formato: entero },
  { clave: "esperado", titulo: "Esperado (kg)", formato: entero },
  { clave: "tolerancia", titulo: "Tolerancia (kg)", formato: entero },
  { clave: "dentro", titulo: "Dentro", formato: siNo },
  { clave: "operador", titulo: "Operador", formato: texto },
]

export const COLUMNAS_REZAGO: readonly ColumnaReporte[] = [
  { clave: "apertura", titulo: "Apertura", formato: fechaHora },
  { clave: "lote", titulo: "Lote", formato: texto },
  { clave: "mercaderia", titulo: "Mercadería", formato: texto },
  { clave: "motivo", titulo: "Motivo", formato: texto },
  { clave: "estado", titulo: "Estado", formato: ESTADO_REZAGO },
  { clave: "operador", titulo: "Operador", formato: texto },
]

export const COLUMNAS_SECUESTRO: readonly ColumnaReporte[] = [
  { clave: "apertura", titulo: "Apertura", formato: fechaHora },
  { clave: "lote", titulo: "Lote", formato: texto },
  { clave: "mercaderia", titulo: "Mercadería", formato: texto },
  { clave: "refLegal", titulo: "Ref. legal", formato: texto },
  { clave: "estado", titulo: "Estado", formato: ESTADO_SECUESTRO },
  { clave: "operador", titulo: "Operador", formato: texto },
  { clave: "documentos", titulo: "Documentos", formato: entero },
]

export const COLUMNAS_AUDITORIA: readonly ColumnaReporte[] = [
  { clave: "id", titulo: "ID", formato: (v) => `#${String(v)}` },
  { clave: "fecha", titulo: "Fecha", formato: fechaHora },
  { clave: "usuario", titulo: "Usuario", formato: texto },
  { clave: "accion", titulo: "Acción", formato: texto },
  { clave: "entidad", titulo: "Entidad", formato: texto },
]

/**
 * Auditoría columns built from the action catalog (label + code). Shared by
 * BOTH adapters so the rendered table and CSV are identical: the Acción
 * formatter pairs the catalog label with its code, e.g. "Crear camión
 * (truck.create)" — same convention as AuditPage.
 */
export function construirColumnasAuditoria(valores: readonly { code: string; label: string }[]): ColumnaReporte[] {
  const accionLabel = new Map(valores.map((a) => [a.code, a.label]))
  return COLUMNAS_AUDITORIA.map((columna) =>
    columna.clave === "accion"
      ? {
          ...columna,
          formato: (v: unknown) => {
            const code = String(v)
            return accionLabel.has(code) ? `${accionLabel.get(code)} (${code})` : texto(v)
          },
        }
      : columna,
  )
}

// ---------------------------------------------------------------------
// Shared enrichment helpers (bounded in() reads for the CURRENT page)
// ---------------------------------------------------------------------

interface UsuarioMap {
  [id: string]: string
}

async function fetchUsers(client: SupabaseClient, ids: readonly string[]): Promise<UsuarioMap> {
  if (ids.length === 0) return {}
  const { data, error } = await client.from("users").select("id, full_name").in("id", ids as string[])
  if (error) throw new Error(`users (reporte): ${error.message}`)
  const mapa: UsuarioMap = {}
  for (const u of (data ?? []) as { id: string; full_name: string | null }[]) {
    mapa[u.id] = u.full_name ?? u.id
  }
  return mapa
}

interface ItemMap {
  [cargoItemId: string]: { sku: string | null; description: string }
}

async function fetchItems(client: SupabaseClient, ids: readonly string[]): Promise<ItemMap> {
  if (ids.length === 0) return {}
  const { data, error } = await client.from("cargo_items").select("id, sku, description").in("id", ids as string[])
  if (error) throw new Error(`cargo_items (reporte): ${error.message}`)
  const mapa: ItemMap = {}
  for (const i of (data ?? []) as { id: string; sku: string | null; description: string }[]) {
    mapa[i.id] = { sku: i.sku, description: i.description }
  }
  return mapa
}

// ---------------------------------------------------------------------
// Supabase implementation — composes the existing bounded services; the
// helpers above ONLY enrich the current page.
// ---------------------------------------------------------------------

export class SupabaseReportService implements ReportService {
  private readonly client: SupabaseClient | null
  private readonly trucks: SupabaseTruckService
  private readonly cargo: SupabaseCargoService
  private readonly movements: SupabaseMovementService
  private readonly stations: SupabaseStationService
  private readonly holds: SupabaseHoldService
  private readonly audit: SupabaseAuditService
  private readonly dashboard: SupabaseDashboardService
  private readonly locations: SupabaseLocationService

  constructor(client: SupabaseClient | null) {
    this.client = client
    this.trucks = new SupabaseTruckService(client)
    this.cargo = new SupabaseCargoService(client)
    this.movements = new SupabaseMovementService(client)
    this.stations = new SupabaseStationService(client)
    this.holds = new SupabaseHoldService(client)
    this.audit = new SupabaseAuditService(client)
    this.dashboard = new SupabaseDashboardService(client)
    this.locations = new SupabaseLocationService(client)
  }

  async generar(reporte: ReporteId, filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    switch (reporte) {
      case "camiones":
        return this.reporteCamiones(filtros, pagina)
      case "ingresosEgresos":
        return this.reporteIngresosEgresos(filtros)
      case "carga":
        return this.reporteCarga(filtros, pagina)
      case "movimientos":
        return this.reporteMovimientos(filtros)
      case "ocupacion":
        return this.reporteOcupacion()
      case "scanner":
        return this.reporteScanner(filtros, pagina)
      case "balanza":
        return this.reporteBalanza(filtros, pagina)
      case "rezago":
        return this.reporteRezago(filtros, pagina)
      case "secuestro":
        return this.reporteSecuestro(filtros, pagina)
      case "auditoria":
        return this.reporteAuditoria(filtros, pagina)
    }
  }

  /** Camiones: bounded page over trucks.listar/contar + señales (T-21). */
  private async reporteCamiones(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const camionFiltros: TruckFiltros = {
      estado: filtros?.estado as TruckStatus | undefined,
      buscar: filtros?.placa || undefined,
      limit,
      offset,
    }
    const camiones = await this.trucks.listar(camionFiltros)
    const total = await this.trucks.contar(camionFiltros)
    const ids = camiones.map((c) => c.id)
    const señales = await this.trucks.obtenerSeñales(ids)
    const descargas = await this.contarDescargasPorCamion(camiones)

    const filas: FilaReporte[] = camiones.map((camion, index) => {
      const s = señales[index]
      return {
        placa: camion.plate,
        estado: camion.status,
        manifiestos: s.manifestCount,
        ingresos: s.arrivalCount,
        egresos: s.egressCount,
        descargas: descargas.get(camion.id) ?? 0,
        primeraLlegada: s.firstArrivalAt,
        ultimoEgreso: s.lastEgressAt,
        ultimaOperacion: s.latestMovementAt,
      }
    })

    return {
      columnas: COLUMNAS_CAMIONES,
      filas,
      total,
      agregado: false,
      paginable: true,
    }
  }

  /** Descargas (kind='discharge') count per truck — one bounded in() query for the page. */
  private async contarDescargasPorCamion(camiones: { id: string }[]): Promise<Map<string, number>> {
    const client = requireClient(this.client)
    const resultado = new Map<string, number>()
    if (camiones.length === 0) return resultado
    const { data: manifests, error: mError } = await client
      .from("cargo_manifests")
      .select("id, truck_id")
      .in("truck_id", camiones.map((c) => c.id))
    if (mError) throw new Error(`cargo_manifests (descargas): ${mError.message}`)
    const vinculados = ((manifests ?? []) as { id: string; truck_id: string | null }[]).filter(
      (m) => m.truck_id !== null,
    )
    if (vinculados.length === 0) return resultado
    const { data: discharges, error: dError } = await client
      .from("movements")
      .select("manifest_id")
      .in(
        "manifest_id",
        vinculados.map((m) => m.id),
      )
      .eq("kind", "discharge")
    if (dError) throw new Error(`movements (descargas): ${dError.message}`)
    const contador = new Map<string, number>()
    for (const movimiento of (discharges ?? []) as { manifest_id: string | null }[]) {
      if (movimiento.manifest_id === null) continue
      contador.set(movimiento.manifest_id, (contador.get(movimiento.manifest_id) ?? 0) + 1)
    }
    for (const m of vinculados) {
      const n = contador.get(m.id) ?? 0
      const truckId = m.truck_id as string
      resultado.set(truckId, (resultado.get(truckId) ?? 0) + n)
    }
    return resultado
  }

  /**
   * Ingresos/Egresos. Sin patente: resumen diario (agregado v8 — arrivals +
   * trucks_processed con egreso; merge de agregados del servidor, igual que
   * el dashboard). Con patente: detalle por movimiento — UNA consulta
   * acotada (≤500, snapshot fijo sin paginación).
   */
  private async reporteIngresosEgresos(filtros?: FiltrosReporte): Promise<ResultadoReporte> {
    if (filtros?.placa) {
      const camiones = await this.trucks.listar({ buscar: filtros.placa, limit: 5 })
      const camion = camiones[0]
      if (!camion) {
        return {
          columnas: COLUMNAS_INGRESOS_EGRESOS_DETALLE,
          filas: [],
          total: 0,
          agregado: false,
          paginable: false,
        }
      }
      const movimientos = await this.movements.listarMovimientos({
        camionId: camion.id,
        since: filtros.desde,
        until: filtros.hasta,
        limit: 500,
      })
      const operadorIds = [
        ...new Set(movimientos.filter((m) => m.operator_id !== null).map((m) => m.operator_id as string)),
      ]
      const operadores = await fetchUsers(requireClient(this.client), operadorIds)
      const filas: FilaReporte[] = movimientos.map((m) => ({
        fecha: m.occurred_at,
        placa: camion.plate,
        tipo: m.kind,
        operador: m.operator_id ? (operadores[m.operator_id] ?? m.operator_id) : "—",
      }))
      return {
        columnas: COLUMNAS_INGRESOS_EGRESOS_DETALLE,
        filas,
        total: filas.length,
        agregado: false,
        paginable: false,
      }
    }

    const [arribos, egresos] = await Promise.all([
      this.dashboard.obtenerSerie("arrivals", { desde: filtros?.desde, hasta: filtros?.hasta }),
      this.dashboard.obtenerSerie("trucks_processed", { desde: filtros?.desde, hasta: filtros?.hasta }),
    ])
    const porDia = new Map<string, { ingresos: number; egresos: number }>()
    for (const fila of arribos) {
      if (!("arrivals" in fila)) continue
      const dia = fila.liquidity_day
      porDia.set(dia, { ingresos: fila.arrivals, egresos: porDia.get(dia)?.egresos ?? 0 })
    }
    for (const fila of egresos) {
      if (!("trucks_processed" in fila)) continue
      const previo = porDia.get(fila.liquidity_day) ?? { ingresos: 0, egresos: 0 }
      porDia.set(fila.liquidity_day, { ingresos: previo.ingresos, egresos: fila.trucks_processed })
    }
    const filas: FilaReporte[] = [...porDia.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dia, cuenta]) => ({ dia, ingresos: cuenta.ingresos, egresos: cuenta.egresos }))
    return {
      columnas: COLUMNAS_INGRESOS_EGRESOS_RESUMEN,
      filas,
      total: filas.length,
      agregado: true,
      paginable: false,
    }
  }

  /** Carga: página acotada de manifiestos + Σ de ítems de ESA página (ensamblado de filas, no estadística). */
  private async reporteCarga(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const client = requireClient(this.client)
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const manifestFiltros: ManifestFiltros = {
      estado: filtros?.estado as CargoManifestStatus | undefined,
      since: filtros?.desde,
      until: filtros?.hasta,
      limit,
      offset,
    }
    const manifests = await this.cargo.listarManifests(manifestFiltros)
    const total = await this.cargo.contarManifests(manifestFiltros)

    const cantidadPorManifest = new Map<string, { cantidad: number; peso: number }>()
    const manifestIds = manifests.map((m) => m.id)
    if (manifestIds.length > 0) {
      const { data: rows, error } = await client
        .from("cargo_items")
        .select("manifest_id, total_quantity, unit_weight_kg")
        .in("manifest_id", manifestIds)
      if (error) throw new Error(`cargo_items (reporte carga): ${error.message}`)
      for (const fila of (rows ?? []) as {
        manifest_id: string
        total_quantity: number
        unit_weight_kg: number | null
      }[]) {
        const previo = cantidadPorManifest.get(fila.manifest_id) ?? { cantidad: 0, peso: 0 }
        cantidadPorManifest.set(fila.manifest_id, {
          cantidad: previo.cantidad + fila.total_quantity,
          peso: previo.peso + fila.total_quantity * (fila.unit_weight_kg ?? 0),
        })
      }
    }
    const truckIds = [...new Set(manifests.filter((m) => m.truck_id !== null).map((m) => m.truck_id as string))]
    const placas = new Map<string, string>()
    if (truckIds.length > 0) {
      const { data: camiones, error: tError } = await client.from("trucks").select("id, plate").in("id", truckIds)
      if (tError) throw new Error(`trucks (reporte carga): ${tError.message}`)
      for (const t of (camiones ?? []) as { id: string; plate: string }[]) placas.set(t.id, t.plate)
    }

    const filas: FilaReporte[] = manifests.map((manifest) => ({
      codigo: manifest.code,
      placa: manifest.truck_id ? (placas.get(manifest.truck_id) ?? "—") : "—",
      estado: manifest.status,
      cantidad: cantidadPorManifest.get(manifest.id)?.cantidad ?? 0,
      peso: cantidadPorManifest.get(manifest.id)?.peso ?? 0,
      destino: manifest.destination,
    }))
    return {
      columnas: COLUMNAS_CARGA,
      filas,
      total,
      agregado: false,
      paginable: true,
    }
  }

  /** Movimientos: agregado por día + tipo (dashboard_series_movements v8). */
  private async reporteMovimientos(filtros?: FiltrosReporte): Promise<ResultadoReporte> {
    const serie = await this.dashboard.obtenerSerie("movements", {
      desde: filtros?.desde,
      hasta: filtros?.hasta,
      kind: filtros?.kind,
    })
    const filas: FilaReporte[] = [...serie]
      .sort((a, b) => b.liquidity_day.localeCompare(a.liquidity_day))
      .map((fila) =>
        "kind" in fila
          ? { dia: fila.liquidity_day, tipo: fila.kind, cantidad: fila.movements }
          : { dia: fila.liquidity_day, tipo: null, cantidad: 0 },
      )
    return {
      columnas: COLUMNAS_MOVIMIENTOS,
      filas,
      total: filas.length,
      agregado: true,
      paginable: false,
    }
  }

  /** Ocupación: snapshot v3 location_occupancy (una fila por ubicación). */
  private async reporteOcupacion(): Promise<ResultadoReporte> {
    const ocupaciones = await this.locations.obtenerOcupacion()
    const filas: FilaReporte[] = ocupaciones.map((fila) => ({
      ubicacion: fila.code,
      ocupadas: fila.occupancy_units,
      capacidad: fila.capacity_max_units,
      pct: fila.pct_units,
      kg: fila.occupancy_kg,
      m3: fila.occupancy_m3,
    }))
    return {
      columnas: COLUMNAS_OCUPACION,
      filas,
      total: filas.length,
      agregado: true,
      paginable: false,
    }
  }

  /** Scanner: página acotada de scanner_operations + enriquecimiento lote/ítem/operador. */
  private async reporteScanner(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const client = requireClient(this.client)
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const opFiltros: ScannerOpFiltros = {
      resultado: filtros?.resultado,
      since: filtros?.desde,
      until: filtros?.hasta,
      limit,
      offset,
    }
    const ops = await this.stations.scanner.listarOperaciones(opFiltros)
    const total = await this.contar("scanner_operations", opFiltros)
    const [lotes, operadores] = await Promise.all([
      this.fetchLotes(ops.map((o) => o.item_lot_id)),
      fetchUsers(
        client,
        [...new Set(ops.filter((o) => o.operator_id !== null).map((o) => o.operator_id as string))],
      ),
    ])
    const items = await fetchItems(client, [...new Set(lotes.map((l) => l.cargo_item_id))])
    const filas: FilaReporte[] = ops.map((op) => {
      const lot = lotes.find((l) => l.id === op.item_lot_id)
      const item = lot ? items[lot.cargo_item_id] : undefined
      return {
        fecha: op.scanned_at,
        lote: item?.sku ?? lot?.id ?? op.item_lot_id,
        mercaderia: item?.description ?? "—",
        codigo: op.scanned_code,
        resultado: op.result,
        operador: op.operator_id ? (operadores[op.operator_id] ?? op.operator_id) : "—",
      }
    })
    return {
      columnas: COLUMNAS_SCANNER,
      filas,
      total,
      agregado: false,
      paginable: true,
    }
  }

  /** Balanza: página acotada de scale_operations + enriquecimiento lote/ítem/operador. */
  private async reporteBalanza(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const client = requireClient(this.client)
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const opFiltros: ScaleOpFiltros = {
      dentroTolerancia: filtros?.dentroTolerancia,
      since: filtros?.desde,
      until: filtros?.hasta,
      limit,
      offset,
    }
    const ops = await this.stations.escala.listarOperaciones(opFiltros)
    const total = await this.contar("scale_operations", opFiltros)
    const [lotes, operadores] = await Promise.all([
      this.fetchLotes(ops.map((o) => o.item_lot_id)),
      fetchUsers(
        client,
        [...new Set(ops.filter((o) => o.operator_id !== null).map((o) => o.operator_id as string))],
      ),
    ])
    const items = await fetchItems(client, [...new Set(lotes.map((l) => l.cargo_item_id))])
    const filas: FilaReporte[] = ops.map((op) => {
      const lot = lotes.find((l) => l.id === op.item_lot_id)
      const item = lot ? items[lot.cargo_item_id] : undefined
      return {
        fecha: op.weighed_at,
        lote: item?.sku ?? lot?.id ?? op.item_lot_id,
        mercaderia: item?.description ?? "—",
        neto: op.net_kg,
        esperado: op.expected_kg,
        tolerancia: op.tolerance_kg,
        dentro: op.within_tolerance,
        operador: op.operator_id ? (operadores[op.operator_id] ?? op.operator_id) : "—",
      }
    })
    return {
      columnas: COLUMNAS_BALANZA,
      filas,
      total,
      agregado: false,
      paginable: true,
    }
  }

  /** Rezago: página acotada de quarantine_operations (enriquecida). */
  private async reporteRezago(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const client = requireClient(this.client)
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const holdFiltros: QuarantineHoldFiltros = {
      estado: filtros?.estado as QuarantineStatus | undefined,
      since: filtros?.desde,
      until: filtros?.hasta,
      limit,
      offset,
    }
    const ops = await this.holds.quarantine.listar(holdFiltros)
    const total = await this.contar("quarantine_operations", holdFiltros)
    const [lotes, operadores] = await Promise.all([
      this.fetchLotes(ops.map((o) => o.item_lot_id)),
      fetchUsers(
        client,
        [...new Set(ops.filter((o) => o.opened_by !== null).map((o) => o.opened_by as string))],
      ),
    ])
    const items = await fetchItems(client, [...new Set(lotes.map((l) => l.cargo_item_id))])
    const filas: FilaReporte[] = ops.map((op) => {
      const lot = lotes.find((l) => l.id === op.item_lot_id)
      const item = lot ? items[lot.cargo_item_id] : undefined
      return {
        apertura: op.opened_at,
        lote: item?.sku ?? lot?.id ?? op.item_lot_id,
        mercaderia: item?.description ?? "—",
        motivo: op.reason,
        estado: op.status,
        operador: op.opened_by ? (operadores[op.opened_by] ?? op.opened_by) : "—",
      }
    })
    return {
      columnas: COLUMNAS_REZAGO,
      filas,
      total,
      agregado: false,
      paginable: true,
    }
  }

  /** Secuestro: página acotada de seizure_operations + conteo de adjuntos. */
  private async reporteSecuestro(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const client = requireClient(this.client)
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const holdFiltros: SeizureHoldFiltros = {
      estado: filtros?.estado as SeizureStatus | undefined,
      since: filtros?.desde,
      until: filtros?.hasta,
      limit,
      offset,
    }
    const ops = await this.holds.seizure.listar(holdFiltros)
    const total = await this.contar("seizure_operations", holdFiltros)
    const [lotes, operadores] = await Promise.all([
      this.fetchLotes(ops.map((o) => o.item_lot_id)),
      fetchUsers(
        client,
        [...new Set(ops.filter((o) => o.opened_by !== null).map((o) => o.opened_by as string))],
      ),
    ])
    const items = await fetchItems(client, [...new Set(lotes.map((l) => l.cargo_item_id))])
    const documentos = await this.contarAdjuntos(ops.map((o) => o.id))
    const filas: FilaReporte[] = ops.map((op) => {
      const lot = lotes.find((l) => l.id === op.item_lot_id)
      const item = lot ? items[lot.cargo_item_id] : undefined
      return {
        apertura: op.opened_at,
        lote: item?.sku ?? lot?.id ?? op.item_lot_id,
        mercaderia: item?.description ?? "—",
        refLegal: op.legal_ref,
        estado: op.status,
        operador: op.opened_by ? (operadores[op.opened_by] ?? op.opened_by) : "—",
        documentos: documentos.get(op.id) ?? 0,
      }
    })
    return {
      columnas: COLUMNAS_SECUESTRO,
      filas,
      total,
      agregado: false,
      paginable: true,
    }
  }

  /** Auditoría: página acotada vía AuditService (AU-71) — el CSV exporta la página actual. */
  private async reporteAuditoria(filtros?: FiltrosReporte, pagina?: PaginaReporte): Promise<ResultadoReporte> {
    const limit = pagina?.limit ?? 25
    const offset = pagina?.offset ?? 0
    const page = Math.floor(offset / limit) + 1
    const [resultado, acciones, actores] = await Promise.all([
      this.audit.listarAudit(
        { action: filtros?.accion, since: filtros?.desde, until: filtros?.hasta },
        { page, pageSize: limit },
      ),
      this.audit.obtenerCatalogoAcciones(),
      this.audit.obtenerActores(),
    ])
    const actorNombre = new Map(actores.map((a) => [a.id, a.nombre]))
    const filas: FilaReporte[] = resultado.filas.map((fila) => ({
      id: fila.id,
      fecha: fila.created_at,
      usuario: fila.actor_id ? (actorNombre.get(fila.actor_id) ?? fila.actor_id) : "sistema",
      accion: fila.action,
      entidad: fila.entity_type ? `${fila.entity_type}${fila.entity_id ? ` #${fila.entity_id}` : ""}` : "—",
    }))
    return {
      columnas: construirColumnasAuditoria(acciones),
      filas,
      total: resultado.total,
      agregado: false,
      paginable: true,
    }
  }

  /** Bounded exact count for the operation tables (same predicates as the page). */
  private async contar(
    tabla: "scanner_operations" | "scale_operations" | "quarantine_operations" | "seizure_operations",
    filtros: { resultado?: ScannerResult; dentroTolerancia?: boolean; estado?: string; since?: string; until?: string },
  ): Promise<number> {
    const client = requireClient(this.client)
    let query = client.from(tabla).select("id", { count: "exact", head: true })
    if (tabla === "scanner_operations" && filtros.resultado !== undefined) query = query.eq("result", filtros.resultado)
    if (tabla === "scale_operations" && filtros.dentroTolerancia !== undefined) {
      query = query.eq("within_tolerance", filtros.dentroTolerancia)
    }
    if ((tabla === "quarantine_operations" || tabla === "seizure_operations") && filtros.estado !== undefined) {
      query = query.eq("status", filtros.estado)
    }
    const fechaCol = tabla === "scanner_operations" ? "scanned_at" : tabla === "scale_operations" ? "weighed_at" : "opened_at"
    if (filtros.since !== undefined) query = query.gte(fechaCol, filtros.since)
    if (filtros.until !== undefined) query = query.lt(fechaCol, filtros.until)
    const { count, error } = await query
    if (error) throw new Error(`${tabla} count (reporte): ${error.message}`)
    return count ?? 0
  }

  /** Lot rows for the page (bounded in() read). */
  private async fetchLotes(ids: readonly string[]): Promise<ItemLotRow[]> {
    const client = requireClient(this.client)
    if (ids.length === 0) return []
    const { data, error } = await client.from("item_lots").select("id, cargo_item_id").in("id", ids as string[])
    if (error) throw new Error(`item_lots (reporte): ${error.message}`)
    return (data ?? []) as ItemLotRow[]
  }

  /** Attachment count per seizure operation (bounded in() read). */
  private async contarAdjuntos(entityIds: readonly string[]): Promise<Map<string, number>> {
    const client = requireClient(this.client)
    const resultado = new Map<string, number>()
    if (entityIds.length === 0) return resultado
    const { data, error } = await client
      .from("attachments")
      .select("entity_id")
      .eq("entity_type", "seizure_operation")
      .in("entity_id", entityIds as string[])
    if (error) throw new Error(`attachments (reporte): ${error.message}`)
    for (const fila of (data ?? []) as { entity_id: string }[]) {
      resultado.set(fila.entity_id, (resultado.get(fila.entity_id) ?? 0) + 1)
    }
    return resultado
  }
}