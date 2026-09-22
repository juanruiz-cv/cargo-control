import { useEffect, useMemo, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { ChevronDown, LayersIcon, MapIcon, Search } from "lucide-react"
import { getServices } from "@/services"
import type { MapaOperativoResultado } from "@/services/layoutService"
import type { TruckRow } from "@/types"
import { ROUTES } from "@/config/routes"
import { useFacilityId } from "@/hooks/useFacilityId"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { derivarEstadoCamion, type TruckDisplayStatus } from "@/components/trucks/truckStatus"
import { PageHeader } from "@/components/shared/PageHeader"
import { LoadingState } from "@/components/shared/LoadingState"
import { ErrorState } from "@/components/shared/ErrorState"
import { EmptyState } from "@/components/shared/EmptyState"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { OperationalCanvas } from "@/components/map/operational/OperationalCanvas"
import { LocationDetailDrawer } from "@/components/map/operational/LocationDetailDrawer"
import {
  derivarEstadoOperativo,
  ESTADO_META,
  ESTADOS_ORDEN,
  type EstadoOperativo,
} from "@/components/map/shared/estadoOperativo"
import { ELEMENT_TYPE_LABELS, ELEMENT_TYPE_ORDER } from "@/components/map/shared/elementMeta"
import { cn } from "cn"
import type { LayoutElementType } from "@/types"

type ElementoConEstado = MapaOperativoResultado["elementos"][number] & { estado: EstadoOperativo }

interface Filtros {
  tipo: "todos" | LayoutElementType
  estado: "todos" | EstadoOperativo
  busqueda: string
}

const FILTROS_INICIALES: Filtros = { tipo: "todos", estado: "todos", busqueda: "" }

export function OperationalMapPage() {
  const navigate = useNavigate()
  const { facilityId, loading: facilityLoading } = useFacilityId()
  const [resultado, setResultado] = useState<MapaOperativoResultado | null>(null)
  const [camiones, setCamiones] = useState<TruckRow[]>([])
  const [estadosCamion, setEstadosCamion] = useState<Record<string, TruckDisplayStatus>>({})
  const [locsConHold, setLocsConHold] = useState<ReadonlySet<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_INICIALES)
  const busqueda = useDebouncedValue(filtros.busqueda, 300)
  const [leyendaAbierta, setLeyendaAbierta] = useState(true)

  const [seleccionId, setSeleccionId] = useState<string | null>(null)

  useEffect(() => {
    if (!facilityId) return
    let cancelled = false
    const cargar = async () => {
      setLoading(true)
      setError(null)
      try {
        const services = getServices()
        const [mapa, conHold, trucks] = await Promise.all([
          services.layouts.obtenerMapaOperativo(facilityId),
          services.layouts.ubicacionesConHoldAbierto(facilityId),
          services.trucks.listar({ estado: "in_playon" }),
        ])
        if (cancelled) return
        // Derived-status per truck (T-21): same badges the trucks module
        // shows, so the playón chips are not a second, weaker vocabulary.
        const estados: Record<string, TruckDisplayStatus> = {}
        if (trucks.length > 0) {
          const señales = await services.trucks.obtenerSeñales(trucks.map((t) => t.id))
          for (let i = 0; i < trucks.length; i += 1) {
            estados[trucks[i].id] = derivarEstadoCamion(trucks[i], señales[i])
          }
        }
        if (cancelled) return
        setResultado(mapa)
        setCamiones(trucks)
        setEstadosCamion(estados)
        setLocsConHold(new Set(conHold))
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void cargar()
    return () => {
      cancelled = true
    }
  }, [facilityId])

  const elementosConEstado = useMemo<ElementoConEstado[]>(
    () =>
      (resultado?.elementos ?? []).map((dato) => ({
        ...dato,
        estado: derivarEstadoOperativo(dato, locsConHold),
      })),
    [resultado, locsConHold],
  )

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return elementosConEstado.filter((e) => {
      if (filtros.tipo !== "todos" && e.elemento.element_type !== filtros.tipo) return false
      if (filtros.estado !== "todos" && e.estado !== filtros.estado) return false
      if (q) {
        const texto = `${e.elemento.code ?? ""} ${e.elemento.name ?? ""} ${e.ubicacion?.code ?? ""} ${e.ubicacion?.name ?? ""}`.toLowerCase()
        if (!texto.includes(q)) return false
      }
      return true
    })
  }, [elementosConEstado, filtros, busqueda])

  const resultadoFiltrado = useMemo(
    () => (resultado ? { ...resultado, elementos: filtrados } : null),
    [resultado, filtrados],
  )

  const seleccion = useMemo(
    () => elementosConEstado.find((e) => e.elemento.id === seleccionId) ?? null,
    [elementosConEstado, seleccionId],
  )

  if (facilityLoading || (facilityId && loading && !resultado)) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mapa Operativo" description="Estado en vivo del predio sobre el layout publicado." />
        <LoadingState rows={5} label="Cargando mapa operativo" />
      </div>
    )
  }

  if (!facilityId) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mapa Operativo" description="Estado en vivo del predio sobre el layout publicado." />
        <ErrorState description="No se encontró ninguna facilidad activa para mostrar el mapa." />
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mapa Operativo" description="Estado en vivo del predio sobre el layout publicado." />
        <ErrorState description={error} />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title="Mapa Operativo"
        description="Estado en vivo del predio sobre el layout publicado."
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar código o nombre…"
            value={filtros.busqueda}
            onChange={(event) => setFiltros((f) => ({ ...f, busqueda: event.target.value }))}
          />
        </div>

        <Select
          value={filtros.tipo}
          onValueChange={(tipo) => setFiltros((f) => ({ ...f, tipo: tipo as Filtros["tipo"] }))}
        >
          <SelectTrigger className="w-44" aria-label="Filtrar por tipo de elemento">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los tipos</SelectItem>
            {ELEMENT_TYPE_ORDER.map((tipo) => (
              <SelectItem key={tipo} value={tipo}>
                {ELEMENT_TYPE_LABELS[tipo]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filtros.estado}
          onValueChange={(estado) => setFiltros((f) => ({ ...f, estado: estado as Filtros["estado"] }))}
        >
          <SelectTrigger className="w-44" aria-label="Filtrar por estado operativo">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            {ESTADOS_ORDEN.map((estado) => (
              <SelectItem key={estado} value={estado}>
                {ESTADO_META[estado].labelEs}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLeyendaAbierta((v) => !v)}
            aria-expanded={leyendaAbierta}
          >
            Leyenda
            <ChevronDown className={cn("size-4 transition-transform", leyendaAbierta && "rotate-180")} />
          </Button>
          <Link to="/settings/layouts">
            <Button variant="outline" size="sm">
              <LayersIcon className="size-4" />
              Planos
            </Button>
          </Link>
        </div>
      </div>

      {leyendaAbierta ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border bg-muted/30 px-4 py-2 text-xs">
          <span className="font-medium text-muted-foreground self-center">Estados</span>
          {ESTADOS_ORDEN.map((estado) => (
            <span key={estado} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: ESTADO_META[estado].color }} />
              {ESTADO_META[estado].labelEs}
            </span>
          ))}
          <span className="mx-1 w-px self-stretch bg-border" />
          <span className="font-medium text-muted-foreground self-center">Lugares</span>
          {ELEMENT_TYPE_ORDER.map((tipo) => (
            <span key={tipo} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm border border-black/15 bg-white/60" />
              {ELEMENT_TYPE_LABELS[tipo]}
            </span>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        {resultadoFiltrado ? (
          <OperationalCanvas
            resultado={resultadoFiltrado}
            ubicacionesConHoldAbierto={locsConHold}
            camionesEnPlayon={camiones}
            estadosCamion={estadosCamion}
            onSeleccionar={(e) => setSeleccionId(e.elemento.id)}
            onSeleccionarCamion={(id) => navigate(`${ROUTES.trucks}/${id}`)}
          />
        ) : (
          <EmptyState
            icon={<MapIcon className="size-6" />}
            title="Todavía no hay un layout publicado"
            description="Creá el primer plano de la facilidad y publicá una versión para que aparezca en el mapa operativo."
            action={
              <div className="flex gap-2">
                <Link to="/settings/layouts">
                  <Button size="sm">Crear primer layout</Button>
                </Link>
                <Link to="/settings/layouts">
                  <Button variant="outline" size="sm">
                    Ver borradores
                  </Button>
                </Link>
              </div>
            }
          />
        )}
      </div>

      <LocationDetailDrawer
        elemento={seleccion}
        estado={seleccion?.estado ?? null}
        camionesEnPlayon={camiones}
        open={seleccion !== null}
        onOpenChange={(open) => {
          if (!open) setSeleccionId(null)
        }}
      />
    </div>
  )
}