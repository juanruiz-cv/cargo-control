import { useEffect, useState } from "react"
import { getServices } from "@/services"
import { DEMO_FACILITY_ID } from "@/services/demo/seed"
import { getSupabaseClient, isSupabaseConfigured } from "@/integrations/supabase"

/**
 * Resolves the facility the current UI context operates on.
 *
 * The app has no facility switcher yet, so this hook applies the project's
 * single-facility convention: DEMO_FACILITY_ID in demo mode, and the first
 * ACTIVE facility (RLS facility_read = warehouse.read) in supabase mode,
 * cached per session. Provisional until a facility context lands.
 */
let cachedSupabaseFacility: string | null | undefined

export function useFacilityId(): { facilityId: string | null; loading: boolean } {
  const [facilityId, setFacilityId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const resolve = async () => {
      const services = getServices()
      if (services.mode === "demo") {
        setFacilityId(DEMO_FACILITY_ID)
        setLoading(false)
        return
      }
      if (cachedSupabaseFacility !== undefined) {
        setFacilityId(cachedSupabaseFacility)
        setLoading(false)
        return
      }
      const client = getSupabaseClient()
      if (!isSupabaseConfigured || !client) {
        setFacilityId(null)
        setLoading(false)
        return
      }
      const { data, error } = await client
        .from("facilities")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle()
      if (!cancelled) {
        cachedSupabaseFacility = error ? null : (data?.id ?? null)
        setFacilityId(cachedSupabaseFacility ?? null)
        setLoading(false)
      }
    }

    void resolve()
    return () => {
      cancelled = true
    }
  }, [])

  return { facilityId, loading }
}