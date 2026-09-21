import { useCallback, useEffect, useRef, useState } from "react"
import { PlusIcon } from "lucide-react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/integrations/auth/useAuth"
import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { getServices } from "@/services"
import type { TruckFiltros } from "@/services/shared"
import type { TruckSignals } from "@/services/truckService"
import type { TransportCompanyRow, TruckRow, TruckStatus } from "@/types"

import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/shared/ErrorState"
import { LoadingState } from "@/components/shared/LoadingState"
import { PageHeader } from "@/components/shared/PageHeader"
import { TruckFilters, type TruckSortField } from "@/components/trucks/TruckFilters"
import { TruckFormDialog } from "@/components/trucks/TruckFormDialog"
import { TruckTable } from "@/components/trucks/TruckTable"

const PAGE_SIZE = 20

/**
 * TruckList (trucks-module.md §List; T-01..T-08). Paginated by pages of
 * PAGE_SIZE over the `plate` cursor (server order, T-08); non-plate sorts
 * are applied to the fetched window and reset to plate asc on filter change
 * (T-05). The exact count (`contar`) runs ONLY when a rendered page is
 * full (T-02) — never on first paint (T-01) — and its failure degrades
 * silently to "Cargar más".
 */
export function TruckListView() {
  const navigate = useNavigate()
  const { hasPermission } = useAuth()
  const puedeCrear = hasPermission("truck.create")

  const [camiones, setCamiones] = useState<TruckRow[]>([])
  const [señales, setSeñales] = useState<Map<string, TruckSignals>>(new Map())
  const [companias, setCompanias] = useState<TransportCompanyRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [cargandoInicial, setCargandoInicial] = useState(true)
  const [errorInicial, setErrorInicial] = useState<string | null>(null)
  const [cargandoMas, setCargandoMas] = useState(false)
  const [errorMas, setErrorMas] = useState<string | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)
  const [reintento, setReintento] = useState(0)

  const [buscar, setBuscar] = useState("")
  const debouncedBuscar = useDebouncedValue(buscar, 300)
  const [estado, setEstado] = useState<TruckStatus | "todos">("todos")
  const [companiaId, setCompaniaId] = useState<string | "todas">("todas")
  const [orden, setOrden] = useState<TruckSortField>("plate")
  const [desc, setDesc] = useState(false)

  const offsetRef = useRef(0)
  const totalRef = useRef<number | null>(null)

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
      const filtros: TruckFiltros = {
        limit: PAGE_SIZE,
        offset,
        ...(debouncedBuscar.trim() ? { buscar: debouncedBuscar.trim() } : {}),
        ...(estado !== "todos" ? { estado } : {}),
        ...(companiaId !== "todas" ? { companiaId } : {}),
      }
      try {
        const nuevas = await getServices().trucks.listar(filtros)
        const señalesNuevas =
          nuevas.length > 0 ? await getServices().trucks.obtenerSeñales(nuevas.map((t) => t.id)) : []
        // Advance BEFORE the count so a retry never duplicates rows.
        const siguienteOffset = offset + nuevas.length
        offsetRef.current = siguienteOffset
        if (nuevas.length < PAGE_SIZE) {
          totalRef.current = siguienteOffset
          setTotal(siguienteOffset)
        }
        setCamiones((prev) => {
          const porId = inicial ? new Map<string, TruckRow>() : new Map(prev.map((t) => [t.id, t]))
          for (const camion of nuevas) porId.set(camion.id, camion)
          return Array.from(porId.values())
        })
        const mapa: Map<string, TruckSignals> = new Map()
        for (const s of señalesNuevas) mapa.set(s.truckId, s)
        setSeñales((prev) => (inicial ? mapa : new Map([...prev, ...mapa])))
        if (nuevas.length === PAGE_SIZE && totalRef.current === null) {
          // Full rendered page: count exactly ONCE (T-02). On failure keep
          // "Cargar más" — the count is an optimization, not a contract.
          try {
            const counted = await getServices().trucks.contar(filtros)
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
          // T-07: the already-rendered rows stay visible.
          setErrorMas(mensaje)
          setCargandoMas(false)
        }
      }
    },
    [debouncedBuscar, estado, companiaId],
  )

  // First page: on mount, on debounced search, on filter change, on retry.
  useEffect(() => {
    void cargarPagina({ inicial: true })
  }, [cargarPagina, reintento])

  // Companias drive the select; a failure only hides the control.
  useEffect(() => {
    let activo = true
    getServices()
      .trucks.listarCompanias()
      .then((cs) => {
        if (activo) setCompanias(cs)
      })
      .catch(() => {
        if (activo) setCompanias([])
      })
    return () => {
      activo = false
    }
  }, [])

  const hayMas = total === null ? camiones.length === PAGE_SIZE : camiones.length < total

  const cambiarEstado = (value: TruckStatus | "todos") => {
    setEstado(value)
    setOrden("plate")
    setDesc(false)
  }
  const cambiarCompania = (value: string | "todas") => {
    setCompaniaId(value)
    setOrden("plate")
    setDesc(false)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Camiones"
        description="Flota con estado derivado (ADR 0008): ingresos, egresos y retenciones como movimientos."
        actions={
          puedeCrear ? (
            <Button onClick={() => setDialogoAbierto(true)}>
              <PlusIcon data-icon="inline-start" />
              Nuevo
            </Button>
          ) : undefined
        }
      />

      <TruckFilters
        buscar={buscar}
        onBuscarChange={setBuscar}
        estado={estado}
        onEstadoChange={cambiarEstado}
        companiaId={companiaId}
        onCompaniaChange={cambiarCompania}
        companias={companias}
        orden={orden}
        onOrdenChange={setOrden}
        desc={desc}
        onToggleDireccion={() => setDesc((d) => !d)}
      />

      {cargandoInicial && camiones.length === 0 ? (
        <LoadingState rows={8} label="Cargando camiones" />
      ) : errorInicial && camiones.length === 0 ? (
        <ErrorState
          title="No se pudieron cargar los camiones"
          description={errorInicial}
          action={<Button onClick={() => setReintento((r) => r + 1)}>Reintentar</Button>}
        />
      ) : (
        <TruckTable
          trucks={camiones}
          señales={señales}
          companias={companias}
          orden={orden}
          desc={desc}
          query={debouncedBuscar}
          tieneFiltros={estado !== "todos" || companiaId !== "todas" || Boolean(debouncedBuscar.trim())}
          puedeCrear={puedeCrear}
          onNuevo={() => setDialogoAbierto(true)}
          onRowClick={(id) => navigate(`/trucks/${id}`)}
          hayMas={hayMas}
          cargandoMas={cargandoMas}
          errorMas={errorMas}
          onCargarMas={() => void cargarPagina({ inicial: false })}
          onReintentarMas={() => void cargarPagina({ inicial: false })}
        />
      )}

      <TruckFormDialog
        abierto={dialogoAbierto}
        onAbiertoChange={setDialogoAbierto}
        camion={null}
        companias={companias}
        onGuardado={() => setReintento((r) => r + 1)}
      />
    </div>
  )
}