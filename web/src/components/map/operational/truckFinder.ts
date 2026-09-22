import type { TransportCompanyRow, TruckRow } from "@/types"

/**
 * Truck finder search predicate (docs/ux/operational-map.md §"Truck finder
 * panel (right)"): match by plate OR transporter name, case-insensitive and
 * trimmed. Same semantics both adapters expose through `listar({ buscar })`
 * (Supabase `ilike %q%` vs demo `includes`), plus the company join the
 * panel needs. Kept pure so the debounced panel filtering stays testable.
 */
export function buscarCamiones(
  camiones: TruckRow[],
  companias: TransportCompanyRow[],
  query: string,
): TruckRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return camiones
  const companiaPorId = new Map(companias.map((c) => [c.id, c.name]))
  return camiones.filter((camion) => {
    if (camion.plate.toLowerCase().includes(q)) return true
    const compania = companiaPorId.get(camion.transport_company_id ?? "") ?? ""
    return compania.toLowerCase().includes(q)
  })
}