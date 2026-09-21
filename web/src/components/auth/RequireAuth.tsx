import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { GateLoading } from "@/components/auth/GateLoading"
import { ROUTES } from "@/config/routes"
import { useAuth } from "@/integrations/auth/useAuth"

/**
 * Authentication guard (authentication.md §2, §4, §6 — UX only; RLS and
 * Edge Functions are the authority).
 *
 * - No session → /login?returnTo=<path> preserving the destination
 *   (expired-session redirect contract).
 * - While the provider restores the session → skeleton (no flash of the
 *   public shell).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) return <GateLoading />

  if (!user) {
    const returnTo = `${location.pathname}${location.search}`
    return (
      <Navigate
        to={`${ROUTES.login}?returnTo=${encodeURIComponent(returnTo)}`}
        replace
        state={{ from: location }}
      />
    )
  }

  return children
}