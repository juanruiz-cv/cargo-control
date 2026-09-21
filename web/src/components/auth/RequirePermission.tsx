import type { ReactNode } from "react"
import { Navigate, useLocation } from "react-router-dom"

import { GateLoading } from "@/components/auth/GateLoading"
import { ROUTES } from "@/config/routes"
import { useAuth } from "@/integrations/auth/useAuth"
import type { PermissionCode } from "@/types"

/**
 * Permission guard per module (authentication.md §6 guard table).
 *
 * UX only: a permitted route with a forbidden action still fails
 * server-side (authorization.md §3). The UI hides what is not granted;
 * RLS rejects what is not allowed.
 *
 * - Not signed in → /login?returnTo=<path>.
 * - Signed in without the module permission → /403 (ForbiddenPage).
 */
export function RequirePermission({
  permission,
  children,
}: {
  permission: PermissionCode
  children: ReactNode
}) {
  const { user, isLoading, hasPermission } = useAuth()
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

  if (!hasPermission(permission)) {
    return <Navigate to={ROUTES.forbidden} replace state={{ from: location }} />
  }

  return children
}