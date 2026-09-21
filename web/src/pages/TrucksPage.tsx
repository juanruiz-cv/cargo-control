import { useParams } from "react-router-dom"

import { TruckDetailsPage } from "@/components/trucks/TruckDetailsPage"
import { TruckListView } from "@/components/trucks/TruckListView"

/**
 * Trucks module shell. Both /trucks and /trucks/:id land here
 * (routes registry → TrucksPage); the param decides list vs details.
 */
export function TrucksPage() {
  const { id } = useParams()
  if (id) {
    return <TruckDetailsPage truckId={id} />
  }
  return <TruckListView />
}