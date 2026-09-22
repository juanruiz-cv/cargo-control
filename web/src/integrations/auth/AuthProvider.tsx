import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { AuthContext, type AuthContextValue, type AuthUser } from "@/integrations/auth/auth-context"
import { getSupabaseClient } from "@/integrations/supabase/client"
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/services/demo/seed"
import { getServices } from "@/services/index"
import type { SesionInfo } from "@/services/authService"
import type { PermissionCode, RoleCode, UserRow } from "@/types"

/** Demo session persistence marker (services/demo localStorage contract). */
const DEMO_SESSION_KEY = "cc.auth.demo-session"

interface AuthSnapshot {
  sesion: SesionInfo
  perfil: UserRow | null
  roles: RoleCode[]
  permissions: PermissionCode[]
  isLoading: boolean
}

const EMPTY_SNAPSHOT: AuthSnapshot = {
  sesion: { accessToken: null, userId: null, email: null, expiresAt: null },
  perfil: null,
  roles: [],
  permissions: [],
  isLoading: true,
}

function toAuthUser(sesion: SesionInfo, perfil: UserRow | null): AuthUser | null {
  if (!sesion.userId) return null
  return {
    id: perfil?.id ?? sesion.userId,
    email: perfil?.email ?? sesion.email,
    name: perfil?.full_name ?? null,
  }
}

/**
 * Global auth provider (docs/security/authentication.md):
 *
 * - Bootstraps the persisted session through the auth service: Supabase
 *   keeps its session in localStorage via supabase-js; the demo adapter
 *   session is restored from `cc.auth.demo-session` (demo store resets on
 *   reload, so "persistence" means an automatic demo sign-in).
 * - Resolves the session's roles/permissions as UX flags (authorization.md
 *   §3 — the SPA never authorizes; RLS is the authority).
 * - Subscribes to GoTrue `onAuthStateChange` when a Supabase client exists
 *   (multi-tab sync, authentication.md §3).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const services = useMemo(() => getServices(), [])
  const auth = services.auth
  const isDemo = services.mode === "demo"

  const [state, setState] = useState<AuthSnapshot>(EMPTY_SNAPSHOT)

  const loadGrants = useCallback(async () => {
    const [roles, permissions] = await Promise.all([
      auth.rolesActuales(),
      auth.permisosActuales(),
    ])
    return { roles, permissions }
  }, [auth])

  const signIn = useCallback(
    async (email: string, password: string) => {
      const { sesion, perfil } = await auth.iniciarSesion(email, password)
      const { roles, permissions } = await loadGrants()
      setState({ sesion, perfil, roles, permissions, isLoading: false })
      if (isDemo) {
        try {
          window.localStorage.setItem(DEMO_SESSION_KEY, "1")
        } catch {
          // Storage unavailable — session survives only in memory.
        }
      }
    },
    [auth, isDemo, loadGrants],
  )

  const signOut = useCallback(async () => {
    await auth.cerrarSesion()
    if (isDemo) {
      try {
        window.localStorage.removeItem(DEMO_SESSION_KEY)
      } catch {
        // Storage unavailable — nothing to clean.
      }
    }
    setState({ ...EMPTY_SNAPSHOT, isLoading: false })
  }, [auth, isDemo])

  const resetPassword = useCallback(
    (email: string) => auth.recuperarPassword(email),
    [auth],
  )

  const actualizarPassword = useCallback(
    (nuevaPassword: string) => auth.actualizarPassword(nuevaPassword),
    [auth],
  )

  const verificarToken = useCallback(
    (tokenHash: string) => auth.verificarTokenRecuperacion(tokenHash),
    [auth],
  )

  // Session bootstrap + GoTrue subscription (authentication.md §3).
  useEffect(() => {
    let active = true

    async function bootstrap() {
      if (isDemo) {
        try {
          if (window.localStorage.getItem(DEMO_SESSION_KEY) === "1") {
            await signIn(DEMO_EMAIL, DEMO_PASSWORD)
            return
          }
        } catch {
          // Corrupt marker → treat as signed out and clean it.
          try {
            window.localStorage.removeItem(DEMO_SESSION_KEY)
          } catch {
            // Storage unavailable — ignore.
          }
        }
        if (active) setState({ ...EMPTY_SNAPSHOT, isLoading: false })
        return
      }

      try {
        const sesion = await auth.sesionActual()
        if (!sesion.userId) {
          if (active) setState({ ...EMPTY_SNAPSHOT, isLoading: false })
          return
        }
        const [perfil, { roles, permissions }] = await Promise.all([
          auth.perfilActual(),
          loadGrants(),
        ])
        if (active) setState({ sesion, perfil, roles, permissions, isLoading: false })
      } catch {
        // Session restore failed (e.g. revoked refresh token) → signed out.
        if (active) setState({ ...EMPTY_SNAPSHOT, isLoading: false })
      }
    }

    void bootstrap()

    // Multi-tab sync / TOKEN_REFRESHED / SIGNED_IN / SIGNED_OUT events.
    // The callback re-resolves the snapshot; sign-out is detected via
    // sesionActual (safe from inside handlers per auth-js docs).
    let unsubscribe: (() => void) | null = null
    const client = getSupabaseClient()
    if (client) {
      const { data } = client.auth.onAuthStateChange(() => {
        void auth.sesionActual().then((sesion) => {
          if (!active) return
          if (!sesion.userId) {
            setState({ ...EMPTY_SNAPSHOT, isLoading: false })
            return
          }
          void auth
            .perfilActual()
            .then(async (perfil) => {
              const { roles, permissions } = await loadGrants()
              if (active) setState({ sesion, perfil, roles, permissions, isLoading: false })
            })
            .catch(() => {
              if (active) setState({ ...EMPTY_SNAPSHOT, isLoading: false })
            })
        })
      })
      unsubscribe = data.subscription.unsubscribe
    }

    return () => {
      active = false
      unsubscribe?.()
    }
  }, [auth, isDemo, loadGrants, signIn])

  const permissionSet = useMemo(() => new Set(state.permissions), [state.permissions])
  const roleSet = useMemo(() => new Set(state.roles), [state.roles])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: toAuthUser(state.sesion, state.perfil),
      roles: state.roles,
      permissions: state.permissions,
      isLoading: state.isLoading,
      isDemo,
      signIn,
      signOut,
      resetPassword,
      actualizarPassword,
      verificarToken,
      hasPermission: (permission: PermissionCode) => permissionSet.has(permission),
      hasRole: (role: RoleCode) => roleSet.has(role),
    }),
    [
      state.sesion,
      state.perfil,
      state.roles,
      state.permissions,
      state.isLoading,
      isDemo,
      signIn,
      signOut,
      resetPassword,
      actualizarPassword,
      verificarToken,
      permissionSet,
      roleSet,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}