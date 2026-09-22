import { LoadingState } from "@/components/shared/LoadingState"

/**
 * Full-page gate loading state (professional-ux.md §2: skeletons on cold
 * paths) shown while the AuthProvider restores the persisted session.
 */
export function GateLoading() {
  return (
    <div className="flex min-h-dvh items-start justify-center bg-background p-6 pt-24">
      <div className="w-full max-w-md">
        <LoadingState rows={3} label="Verificando sesión" />
      </div>
    </div>
  )
}