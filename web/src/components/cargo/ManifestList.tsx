import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ArrowDownUpIcon, ClipboardListIcon, PlusIcon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { useAuth } from "@/integrations/auth/useAuth"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { useFacilityId } from "@/hooks/useFacilityId"
import { getServices } from "@/services"
import type { ManifestFiltros } from "@/services/shared"
import type { CargoItemRow, CargoManifestRow, CargoManifestStatus, TruckRow } from "@/types"

import { Button } from "@/components/ui/button"
import { CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EmptyState } from "@/components/shared/EmptyState"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { PageHeader } from "@/components/shared/PageHeader"
import { ManifestFormDialog } from "@/components/cargo/ManifestFormDialog"
import { ManifestStatusBadge } from "@/components/cargo/cargoBadges"
import {
  MANIFEST_STATUS_LABELS,
  formatFechaDia,
} from "@/components/cargo/manifestStatus"
import { formatKg } from "@/components/trucks/truckStatus"

const PAGE_SIZE = 20

interface ManifestConItems {
  manifest: CargoManifestRow
  items: CargoItemRow[]
}

type OrdenCampo = "arrival" | "code"

/**
 * CargoList (cargo-module.md §CargoList; /cargo). Page size 20, "Cargar
 * más" with cursor on the server order (created_at desc); the exact count
 * runs ONLY when a rendered page is full (ADR 0008 §4) and no client-side
 * search is active — the search matches code/description/sku in the loaded
 * window because the service layer has no manifest `buscar` filter yet
 * (documented; server-side search lands with the window/cursor work).
 * Sort (arrival_date desc default, code alternative) is client-side over
 * the fetched window, like the trucks module.
 */
export function ManifestList() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const { facilityId } = useFacilityId()
  const puedeCrear = hasPermission("cargo.create")

  const [filas, setFilas] = useState<ManifestConItems[]>([])
  const [camiones, setCamiones] = useState<TruckRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cargandoInicial, setCargandoInicial] = useState(true)
  const [errorInicial, setErrorInicial] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorMas, setErrorMas] = useState<string | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [reintento, setReintento] = useState(0)

  const [buscar, setBuscar] = useState("")
  const debouncedBuscar = useDebouncedValue(buscar, 300)
  const [estado, setEstado] = useState<CargoManifestStatus | "todos">("todos")
  const [codigoFiltro, setCodigoFiltro] = useState<string | "todos">("todos")
  const [orden, setOrden] = useState<OrdenCampo>("arrival")
  const [desc, setDesc] = useState(true)

  const offsetRef = useRef(0)
  const totalRef = useRef<number | null>(null)

  const buscando = debouncedBuscar.trim().length > 0

  const cargarPagina = useCallback(
    async ({ inicial }: { inicial: boolean }) => {
      const offset = inicial ? 0 : offsetRef.current
      if (inicial) {
        offsetRef.current = 0
        totalRef.current = null
        setTotal(null)
        setErrorMas(null)
        setErrorInicial(null)
        setCargandoInicial(true)
      } else {
        setCargandoMas(true)
        setErrorMas(null)
      }
      const filtros: ManifestFiltros = {
        limit: PAGE_SIZE,
        offset,
        ...(estado !== "todos" ? { estado } : {}),
        ...(facilityId ? { facilidadId: facilityId } : {}),
      }
      try {
        const manifests = await getServices().cargo.listarManifests(filtros)
        // Items drive card stats + the search window (single bounded read
        // per manifest of the page; degrade per manifest on failure).
        const itemsPorManifest = await Promise.all(
          manifests.map((m) =>
            getServices()
              .cargo.listarItems(m.id)
              .catch(() => [] as CargoItemRow[]),
          ),
        )
        const nuevas: ManifestConItems[] = manifests.map((manifest, index) => ({
          manifest,
          items: itemsPorManifest[index],
        }))
        const siguienteOffset = offset + nuevas.length
        offsetRef.current = siguienteOffset
        if (nuevas.length < PAGE_SIZE) {
          totalRef.current = siguienteOffset
          setTotal(siguienteOffset)
        }
        setFilas((prev) => {
          const porId = inicial ? new Map<string, ManifestConItems>() : new Map(prev.map((f) => [f.manifest.id, f]))
          for (const fila of nuevas) porId.set(fila.manifest.id, fila)
          return Array.from(porId.values())
        })
        if (nuevas.length === PAGE_SIZE && totalRef.current === null) {
          try {
            const counted = await getServices().cargo.contarManifests(filtros)
            totalRef.current = counted
            setTotal(counted)
          } catch {
            totalRef.current = null
            setTotal(null)
          }
        }
        if (inicial) setCargandoInicial(false)
        else setCargandoMas(false)
      } catch (cause) {
        const mensaje = cause instanceof Error ? cause.message : String(cause)
        if (inicial) {
          setErrorInicial(mensaje)
          setCargandoInicial(false)
        } else {
          setErrorMas(mensaje)
          setCargandoMas(false)
        }
      }
    },
    // Search is client-side over the loaded window (no service `buscar`
    // filter); the server window only depends on estado + facility.
    [estado, facilityId],
  )

  useEffect(() => {
    void cargarPagina({ inicial: true })
  }, [cargarPagina, reintento])

  // Plates for the cards; trucks.listar needs truck.read — degrade silently.
  useEffect(() => {
    let activo = true
    getServices()
      .trucks.listar({ limit: 100 })
      .then((rows) => {
        if (activo) setCamiones(rows)
      })
      .catch(() => {
        if (activo) setCamiones([])
      })
    return () => {
      activo = false
    }
  }, [])

  const filasVisibles = useMemo(() => {
    const query = debouncedBuscar.trim().toLowerCase()
    const conecta = (fila: ManifestConItems) => {
      if (fila.manifest.code.toLowerCase().includes(query)) return true
      return fila.items.some(
        (item) =>
          (item.sku ?? "").toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query),
      )
    }
    let resultado = filas
    if (codigoFiltro !== "todos") {
      resultado = resultado.filter((f) => f.manifest.code === codigoFiltro)
    }
    if (query) {
      resultado = resultado.filter(conecta)
    }
    const fecha = (f: ManifestConItems) => f.manifest.arrival_date ?? f.manifest.created_at.slice(0, 10)
    const comparador =
      orden === "code"
        ? (a: ManifestConItems, b: ManifestConItems) => a.manifest.code.localeCompare(b.manifest.code, "es")
        : (a: ManifestConItems, b: ManifestConItems) => fecha(a).localeCompare(fecha(b))
    resultado = [...resultado].sort(comparador)
    return desc ? resultado.reverse() : resultado
  }, [filas, debouncedBuscar, codigoFiltro, orden, desc])

  const placas = useMemo(() => new Map(camiones.map((t) => [t.id, t.plate])), [camiones])
  const codigosDisponibles = useMemo(
    () => Array.from(new Set(filas.map((f) => f.manifest.code))).sort((a, b) => a.localeCompare(b, "es")),
    [filas],
  )

  const hayMas = total === null ? filas.length === PAGE_SIZE : filas.length < total
  const tieneFiltros = estado !== "todos" || codigoFiltro !== "todos" || buscando

  return (
    <div className="space-y-4">
      <PageHeader
        title={
          buscando
            ? `Resultados: ${filasVisibles.length}`
            : total !== null
              ? `Mercadería (${total})`
              : "Mercadería"
        }
        description="Manifiestos y mercadería con trazabilidad por lotes (ADR 0003). El estado es un rollup de movimientos."
        actions={
          puedeCrear ? (
            <Button onClick={() => setDialogoAbierto(true)}>
              <PlusIcon data-icon="inline-start" />
              Nuevo
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={buscar}
          onChange={(event) => setBuscar(event.target.value)}
          placeholder="Buscar por código, descripción o SKU…"
          className="w-72"
          aria-label="Buscar por código, descripción o SKU"
        />
        <Select value={estado} onValueChange={(v) => setEstado((v ?? "todos") as CargoManifestStatus | "todos")}>
          <SelectTrigger aria-label="Filtrar por estado">
            <SelectValue placeholder="Estado: Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Estado: Todos</SelectItem>
            {(Object.keys(MANIFEST_STATUS_LABELS) as CargoManifestStatus[]).map((estadoValue) => (
              <SelectItem key={estadoValue} value={estadoValue}>
                {MANIFEST_STATUS_LABELS[estadoValue]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {codigosDisponibles.length > 0 ? (
          <Select value={codigoFiltro} onValueChange={(v) => setCodigoFiltro(v ?? "todos")}>
            <SelectTrigger aria-label="Filtrar por manifiesto">
              <SelectValue placeholder="Manifiesto: Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Manifiesto: Todos</SelectItem>
              {codigosDisponibles.map((codigo) => (
                <SelectItem key={codigo} value={codigo}>
                  {codigo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <div className="flex items-center gap-1">
          <Select
            value={orden}
            onValueChange={(v) => setOrden((v ?? "arrival") as OrdenCampo)}
          >
            <SelectTrigger aria-label="Ordenar por">
              <SelectValue placeholder="Ordenar: Llegada" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="arrival">Ordenar: Llegada</SelectItem>
              <SelectItem value="code">Ordenar: Código</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={desc ? "Dirección: descendente" : "Dirección: ascendente"}
            title={desc ? "Dirección: descendente" : "Dirección: ascendente"}
            onClick={() => setDesc((d) => !d)}
          >
            <ArrowDownUpIcon className="size-4" />
          </Button>
        </div>
      </div>

      {cargandoInicial && filas.length === 0 ? (
        <LoadingState rows={6} label="Cargando manifiestos" />
      ) : errorInicial && filas.length === 0 ? (
        <ErrorState
          title="No se pudieron cargar los manifiestos"
          description={errorInicial}
          action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
        />
      ) : filasVisibles.length === 0 ? (
        buscando ? (
          <EmptyState
            title={`Sin resultados para «${debouncedBuscar.trim()}»`}
            description="Probá con otro código, descripción o SKU, o ajustá los filtros."
          />
        ) : tieneFiltros ? (
          <EmptyState title="Sin resultados" description="Probá ajustar los filtros de búsqueda." />
        ) : (
          <EmptyState
            title="No hay mercadería"
            description="Registrá tu primer manifiesto para empezar a controlar cargas."
            icon={<ClipboardListIcon className="size-6" />}
            action={
              puedeCrear ? <Button onClick={() => setDialogoAbierto(true)}>+ Nuevo manifiesto</Button> : undefined
            }
          />
        )
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filasVisibles.map((fila) => (
              <Link
                key={fila.manifest.id}
                to={`/cargo/${fila.manifest.id}`}
                className="group rounded-xl border border-border bg-card transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
              >
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground group-hover:underline">
                      {fila.manifest.code}
                    </span>
                    <ManifestStatusBadge status={fila.manifest.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>{formatFechaDia(fila.manifest.arrival_date ?? fila.manifest.created_at)}</span>
                    <span>{placas.get(fila.manifest.truck_id ?? "") ?? "Sin camión"}</span>
                    <span>
                      {fila.items.length === 1 ? "1 ítem" : `${fila.items.length} ítems`}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">
                      Peso esperado: {formatKg(fila.manifest.expected_weight_kg)}
                    </span>
                    <span className="text-muted-foreground">
                      {fila.items.filter((i) => i.status === "distributed" || i.status === "closed").length}/
                      {fila.items.length} distribuidos
                    </span>
                  </div>
                  {fila.manifest.notes?.trim() ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{fila.manifest.notes}</p>
                  ) : null}
                </CardContent>
              </Link>
            ))}
          </div>

          <div className="flex flex-col items-center gap-3">
            {errorMas ? (
              <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                <span role="alert">No se pudo cargar más mercadería.</span>
                <Button variant="outline" onClick={() => void cargarPagina({ inicial: false })}>
                  Reintentar
                </Button>
              </div>
            ) : null}
            {hayMas && !errorMas ? (
              <Button variant="outline" onClick={() => void cargarPagina({ inicial: false })} disabled={cargandoMas}>
                {cargandoMas ? "Cargando…" : "Cargar más"}
              </Button>
            ) : null}
          </div>
        </div>
      )}

      <ManifestFormDialog
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
        facilityId={facilityId}
        // After create, land on the new manifest's history to keep adding
        // items / splits (cargo-module.md flow).
        onGuardado={(manifestId) => navigate(`/cargo/${manifestId}`)}
      />
    </div>
  )
}