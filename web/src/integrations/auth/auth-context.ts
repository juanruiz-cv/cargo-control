import { createContext } from "react"

import type { PermissionCode, RoleCode } from "@/types"

/** Public identity projection exposed to the UI (no raw tokens). */
export interface AuthUser {
  id: string
  email: string | null
  name: string | null
}

export interface AuthContextValue {
  user: AuthUser | null
  roles: RoleCode[]
  permissions: PermissionCode[]
  /** True while the provider restores/checks the persisted session. */
  isLoading: boolean
  /** True when the DEMO dev adapter is active (marked DEMO in the UI). */
  isDemo: boolean
  signIn(email: string, password: string): Promise<void>
  signOut(): Promise<void>
  resetPassword(email: string): Promise<void>
  actualizarPassword(nuevaPassword: string): Promise<void>
  /** Consume a one-time recovery token (authentication.md §5). */
  verificarToken(tokenHash: string): Promise<void>
  hasPermission(permission: PermissionCode): boolean
  hasRole(role: RoleCode): boolean
}

export const AuthContext = createContext<AuthContextValue | null>(null)