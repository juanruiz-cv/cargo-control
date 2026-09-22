import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { useAuth } from "@/integrations/auth/useAuth"
import { useFacilityId } from "@/hooks/useFacilityId"
import {
  KINDS_CON_ITEMS,
  MOVEMENT_KIND_PERMISSION,
  fallosDe,
} from "@/lib/movement-guards"
import type { GuardResult } from "@/lib/movement-guards"
import { MovementEngineError } from "@/services/movementService"
import type { CreateMovementInput } from "@/services/shared"
import { getServices } from "@/services"
import type { CargoManifestRow, ItemLotRow, MovementKind } from "@/types"

import { MOVEMENT_KIND_LABELS } from "@/components/trucks/truckStatus"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { LocationSelect } from "@/components/cargo/LocationSelect"

interface RegistrarMovimientoDialogProps {
  abierto: boolean
  onAbiertoChange: (abierto: boolean) => void
  /** Re-query the timeline after a successful engine execution. */
  onRegistrado: () => void
}

/**
 * "Registrar movimiento" — the engine command surface (movement-engine.md
 * §Command contract). Picks a kind the current user may run (I1 UX filter;
 * the engine re-validates), sources a lot from a manifest, and submits to
 * `ejecutarMovimiento` with a fresh operation_key. Every guard failure of
 * the aggregate verdict renders inline (I2..I7 messages, never first-fail).
 * Idempotent replays (ME-07) are acknowledged, not re-executed.
 */
export function RegistrarMovimientoDialog({
  abierto,
  onAbiertoChange,
  onRegistrado,
}: RegistrarMovimientoDialogProps) {
  const { user, permissions } = useAuth()
  const { facilityId } = useFacilityId()

  const [kind, setKind] = useState<MovementKind | "">("")
  const [manifestId, setManifestId] = useState<string | null>(null)
  const [manifests, setManifests] = useState<CargoManifestRow[]>([])
  const [lotesManifest, setLotesManifest] = useState<ItemLotRow[]>([])
  const [lotId, setLotId] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState("")
  const [destino, setDestino] = useState<string | null>(null)
  const [motivo, setMotivo] = useState("")
  const [movimientoACorregir, setMovimientoACorregir] = useState("")
  const [fallos, setFallos] = useState<GuardResult[]>([])
  const [errorCantidad, setErrorCantidad] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)

  /** Kinds the current user may run (I1 UX mirror; engine is authoritative). */
  const kindsPermitidos = useMemo(
    () =>
      (Object.keys(MOVEMENT_KIND_PERMISSION) as MovementKind[]).filter((k) => {
        const requerido = MOVEMENT_KIND_PERMISSION[k]
        const perms = Array.isArray(requerido) ? requerido : [requerido]
        return perms.some((p) => permissions.includes(p))
      }),
    [permissions],
  )

  useEffect(() => {
    if (!abierto) return
    setKind((prev) => (prev && kindsPermitidos.includes(prev) ? prev : (kindsPermitidos[0] ?? "")))
    setManifestId(null)
    setLotesManifest([])
    setLotId(null)
    setCantidad("")
    setDestino(null)
    setMotivo("")
    setMovimientoACorregir("")
    setFallos([])
    setErrorCantidad(null)
  }, [abierto, kindsPermitidos])

  // Manifest list, bounded — source of lots for the picker (cargo module).
  useEffect(() => {
    if (!abierto) return
    let activo = true
    setManifests([])
    getServices()
      .cargo.listarManifests({ limit: 200 })
      .then((rows) => {
        if (activo) setManifests(rows)
      })
      .catch((cause) => {
        if (!activo) return
        toast.error(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      activo = false
    }
  }, [abierto])

  // Lots of the selected manifest, loaded only when a manifest is chosen.
  useEffect(() => {
    if (!abierto || !manifestId) {
      setLotesManifest([])
      setLotId(null)
      return
    }
    let activo = true
    setLotesManifest([])
    setLotId(null)
    getServices()
      .cargo.obtenerManifest(manifestId)
      .then((detalle) => {
        if (!activo || !detalle) return
        setLotesManifest(detalle.items.flatMap((i) => i.lots))
      })
      .catch((cause) => {
        if (!activo) return
        toast.error(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      activo = false
    }
  }, [abierto, manifestId])

  const conItems = kind !== "" && KINDS_CON_ITEMS.has(kind as MovementKind)
  const loteElegido = lotesManifest.find((l) => l.id === lotId) ?? null

  const registrar = async () => {
    if (!kind) return
    let cantidadNum: number | undefined
    if (conItems) {
      cantidadNum = Number(cantidad)
      if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        setErrorCantidad("Ingresá una cantidad mayor a cero.")
        return
      }
    }
    let previousId: number | undefined
    if (kind === "correction") {
      previousId = Number(movimientoACorregir)
      if (!Number.isInteger(previousId) || previousId <= 0) {
        setFallos([
          {
            guard: "I6",
            ok: false,
            code: "I6_CORRECCION_SIN_ORIGEN",
            message: "Corrección: ingresá el ID (#) del movimiento a corregir.",
          },
        ])
        return
      }
    }
    setErrorCantidad(null)
    setFallos([])
    setGuardando(true)
    try {
      const input: CreateMovementInput = {
        kind: kind as MovementKind,
        manifestId: manifestId ?? null,
        facilityId: facilityId ?? null,
        locationId: destino ?? null,
        motivo: motivo.trim() || null,
        operatorId: user?.id ?? null,
        operationKey: getServices().movements.generarOperationKey(kind as MovementKind),
        previousMovementId: previousId,
        items:
          conItems && loteElegido
            ? [
                {
                  itemLotId: loteElegido.id,
                  cantidad: cantidadNum as number,
                  destinoLocationId: destino ?? undefined,
                },
              ]
            : undefined,
      }
      const resultado = await getServices().movements.ejecutarMovimiento(input)
      if (resultado.duplicado) {
        toast.info(
          `La operation_key ya estaba aplicada en el movimiento #${resultado.movimiento.id} — replay ignorado (ME-07).`,
        )
      } else {
        toast.success(`Movimiento '${MOVEMENT_KIND_LABELS[input.kind]}' registrado (#${resultado.movimiento.id}).`)
      }
      onAbiertoChange(false)
      onRegistrado()
    } catch (cause) {
      if (cause instanceof MovementEngineError) {
        setFallos(cause.validaciones)
        const bloqueantes = fallosDe(cause.validaciones)
        if (bloqueantes.length > 0) {
          toast.error(`${bloqueantes.length} condición(es) del engine bloquean el movimiento.`)
        } else {
          toast.error(cause.message)
        }
      } else {
        toast.error(cause instanceof Error ? cause.message : String(cause))
      }
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={abierto} onOpenChange={onAbiertoChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar movimiento</DialogTitle>
          <DialogDescription>
            Comando del motor de movimientos (I1..I7): elegí el tipo y el engine valida
            permiso, stock, capacidad, estado, secuencia e idempotencia antes de aplicar.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="mov-tipo">Tipo de movimiento</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as MovementKind)
                setFallos([])
              }}
            >
              <SelectTrigger id="mov-tipo" className="mt-1 w-full">
                <SelectValue placeholder="Elegí el tipo" />
              </SelectTrigger>
              <SelectContent>
                {kindsPermitidos.map((k) => (
                  <SelectItem key={k} value={k}>
                    {MOVEMENT_KIND_LABELS[k]} ({k})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {kind !== "correction" ? (
            <div>
              <Label htmlFor="mov-manifiesto">Manifiesto</Label>
              <Select
                value={manifestId ?? ""}
                onValueChange={(v) => setManifestId(v === "" ? null : v)}
              >
                <SelectTrigger id="mov-manifiesto" className="mt-1 w-full">
                  <SelectValue placeholder="Sin manifiesto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin manifiesto</SelectItem>
                  {manifests.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.code} · {m.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {kind === "correction" ? (
            <div>
              <Label htmlFor="mov-corrige">Movimiento a corregir (#)</Label>
              <Input
                id="mov-corrige"
                type="number"
                min={1}
                value={movimientoACorregir}
                onChange={(e) => setMovimientoACorregir(e.target.value)}
                className="mt-1"
                placeholder="Ej: 42"
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Se registra un movimiento `correction` append-only (sin mutación física),
                con motivo obligatorio.
              </p>
            </div>
          ) : null}

          {conItems ? (
            <>
              <div>
                <Label htmlFor="mov-lote">Lote</Label>
                <Select
                  value={lotId ?? ""}
                  onValueChange={(v) => {
                    setLotId(v === "" ? null : v)
                    setFallos([])
                  }}
                  disabled={!manifestId}
                >
                  <SelectTrigger id="mov-lote" className="mt-1 w-full" disabled={!manifestId}>
                    <SelectValue
                      placeholder={manifestId ? "Elegí el lote" : "Primero elegí un manifiesto"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin lote</SelectItem>
                    {lotesManifest.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.id} · {l.status} · {l.quantity} {l.uom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {loteElegido ? (
                <div>
                  <Label htmlFor="mov-cantidad">
                    Cantidad (lote completo: {loteElegido.quantity} {loteElegido.uom})
                  </Label>
                  <Input
                    id="mov-cantidad"
                    type="number"
                    min={1}
                    step="any"
                    value={cantidad}
                    onChange={(e) => {
                      setCantidad(e.target.value)
                      setErrorCantidad(null)
                    }}
                    className="mt-1"
                    placeholder={`Ej: ${loteElegido.quantity}`}
                  />
                  {errorCantidad ? (
                    <p role="alert" className="mt-1 text-sm text-destructive">{errorCantidad}</p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <Label htmlFor="mov-destino">Destino (ubicación)</Label>
                <LocationSelect
                  id="mov-destino"
                  value={destino}
                  onValueChange={(v) => {
                    setDestino(v)
                    setFallos([])
                  }}
                  permitirSinDestino
                />
              </div>
            </>
          ) : null}

          <div>
            <Label htmlFor="mov-motivo">
              Motivo {kind === "correction" || kind === "quarantine" || kind === "seizure" || kind === "release" || kind === "egress" ? "(obligatorio)" : "(opcional)"}
            </Label>
            <textarea
              id="mov-motivo"
              value={motivo}
              onChange={(event) => setMotivo(event.target.value)}
              className="mt-1 w-full min-h-20 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Ej: motivo del movimiento"
            />
          </div>

          {fallos.length > 0 ? (
            <ul className="space-y-1.5 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              {fallosDe(fallos).map((f) => (
                <li key={`${f.guard}-${f.code}`} className="flex gap-2 text-sm">
                  <span className="shrink-0 rounded bg-destructive/10 px-1.5 font-mono text-xs font-medium text-destructive">
                    {f.guard} {f.code}
                  </span>
                  <span className="text-muted-foreground">{f.message}</span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onAbiertoChange(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={() => void registrar()} disabled={guardando || !kind}>
              {guardando ? "Validando…" : "Registrar movimiento"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}