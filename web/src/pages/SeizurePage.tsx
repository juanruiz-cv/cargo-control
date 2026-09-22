import { HoldModulePage } from "@/components/special-areas/HoldModulePage"

/**
 * Secuestro (seizure holds) module shell — special-areas.md §SECUESTRO.
 * /seizure and /seizure/:id land here; the param is not used yet
 * (routes registry → SeizurePage).
 */
export function SeizurePage() {
  return <HoldModulePage kind="seizure" />
}