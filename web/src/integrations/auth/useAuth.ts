import { useContext } from "react"

import { AuthContext } from "@/integrations/auth/auth-context"

/**
 * Global auth accessor. Throws outside <AuthProvider> (wired in main.tsx).
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth debe usarse dentro de <AuthProvider>")
  }
  return context
}