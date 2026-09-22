import { useEffect, useState } from "react"

import { useAuth } from "@/integrations/auth/useAuth"
import { getServices } from "@/services"
import type { LocationRow } from "@/types"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface HoldLocationSelectProps {
  value: string | null
  onValueChange: (value: string | null) => void
  id?: string
  /** Defaults to the lot's current location (keeps it where it is). */
  permitirUbicacionActual?: boolean
  disabled?: boolean
}

/**
 * Destination picker for hold cases (special-areas.md §REZAGO/§SECUESTRO):
 * ACTIVE locations whose `allows_hold` is true (rezago/secuestro staging
 * areas). Guards I3/I5 re-validate activity + allows_hold server-side; this
 * is the UX layer. A load failure degrades to an empty picker — the submit
 * path surfaces the real error.
 */
export function HoldLocationSelect({
  value,
  onValueChange,
  id,
  permitirUbicacionActual = false,
  disabled = false,
}: HoldLocationSelectProps) {
  const { hasPermission } = useAuth()
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!hasPermission("warehouse.read")) {
      setLocations([])
      return
    }
    let activo = true
    setError(null)
    getServices()
      .locations.listarLocations({ activo: true, limit: 200 })
      .then((rows) => {
        if (activo) setLocations(rows.filter((l) => l.allows_hold))
      })
      .catch((cause) => {
        if (!activo) return
        setLocations([])
        setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      activo = false
    }
  }, [hasPermission])

  return (
    <div>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onValueChange((v ?? null) === "" ? null : (v ?? null))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="mt-1 w-full" disabled={disabled}>
          <SelectValue placeholder={permitirUbicacionActual ? "Permanece donde está" : "Seleccioná un área de retención"} />
        </SelectTrigger>
        <SelectContent>
          {permitirUbicacionActual ? <SelectItem value="">Permanece donde está</SelectItem> : null}
          {locations.map((location) => (
            <SelectItem key={location.id} value={location.id}>
              {location.code} · {location.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-muted-foreground">
          No se pudieron cargar las áreas de retención: {error}
        </p>
      ) : null}
    </div>
  )
}