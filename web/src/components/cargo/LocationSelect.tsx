import { useEffect, useState } from "react"

import { getServices } from "@/services"
import type { LocationRow } from "@/types"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

/** Human type label for the destination picker (cargo-module.md §Transfer). */
export function locationTipoLabel(location: LocationRow): string {
  if (location.type === "checkpoint") {
    if (location.checkpoint_kind === "scan") return "Scanner"
    if (location.checkpoint_kind === "scale") return "Balanza"
    return "Checkpoint"
  }
  if (location.type === "playon") return "Playa"
  if (location.type === "bin") return "Bín"
  return "Sector"
}

interface LocationSelectProps {
  value: string | null
  onValueChange: (value: string | null) => void
  id?: string
  /** Null placeholder = "Sin destino" (split remainder stays put). */
  permitirSinDestino?: boolean
  disabled?: boolean
}

/**
 * Destination picker for split/transfer/discharge (cargo-module.md). Lists
 * ACTIVE locations only (the services re-validate activity + frozen lots
 * server-side; this is the UX layer). A failure to load locations degrades
 * to an empty picker — the submit path surfaces the real error.
 */
export function LocationSelect({
  value,
  onValueChange,
  id,
  permitirSinDestino = false,
  disabled = false,
}: LocationSelectProps) {
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    setError(null)
    getServices()
      .locations.listarLocations({ activo: true, limit: 200 })
      .then((rows) => {
        if (activo) setLocations(rows)
      })
      .catch((cause) => {
        if (!activo) return
        setLocations([])
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      activo = false
    }
  }, [])

  return (
    <div>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onValueChange((v ?? null) === "" ? null : (v ?? null))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="mt-1 w-full" disabled={disabled}>
          <SelectValue placeholder={permitirSinDestino ? "Sin destino (permanece donde está)" : "Seleccioná una ubicación"} />
        </SelectTrigger>
        <SelectContent>
          {permitirSinDestino ? <SelectItem value="">Sin destino</SelectItem> : null}
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.code} · {locationTipoLabel(location)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-muted-foreground">
          No se pudieron cargar las ubicaciones: {error}
        </p>
      ) : null}
    </div>
  )
}