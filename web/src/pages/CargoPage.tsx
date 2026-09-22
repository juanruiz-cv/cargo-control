import { useParams } from "react-router-dom"

import { ManifestDetailPage } from "@/components/cargo/ManifestDetailPage"
import { ManifestList } from "@/components/cargo/ManifestList"

/**
 * Cargo module shell. Both /cargo and /cargo/:id land here (routes
 * registry → CargoPage); the param decides list vs details. NOTE:
 * /cargo/items/:itemId is declared in cargo-module.md but was NOT
 * registered by the scaffold — per-lot history arrives later (documented
 * pending; the detail page covers lots now).
 */
export function CargoPage() {
  const { id } = useParams()
  if (id) {
    return <ManifestDetailPage manifestId={id} />
  }
  return <ManifestList />
}