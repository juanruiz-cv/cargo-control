import { HoldModulePage } from "@/components/special-areas/HoldModulePage"

/**
 * Rezago (quarantine holds) module shell — special-areas.md §REZAGO.
 * /quarantine and /quarantine/:id land here; the param is not used yet
 * (routes registry → QuarantinePage).
 */
export function QuarantinePage() {
  return <HoldModulePage kind="quarantine" />
}