import type { ReactNode } from "react"
import { BadgeCheckIcon, MailIcon, ShieldCheckIcon, UserIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useAuth } from "@/integrations/auth/useAuth"
import { ROLE_LABELS } from "@/services/permissionCatalog"

/**
 * Profile (authentication.md): read-only identity + the session's roles
 * and permissions as UX flags (authorization.md §3 — RLS is authority).
 *
 * The public `users` table is RLS-restricted to read-only access; the
 * settings/users + RBAC management screens belong to later admin phases.
 */
export function SettingsPage() {
  const { user, roles, permissions, isDemo } = useAuth()

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Mi perfil
        </h1>
        <p className="text-sm text-muted-foreground">
          Datos de la sesión y permisos asignados a tu cuenta
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserIcon className="size-4" />
            Datos personales
          </CardTitle>
          <CardDescription>
            Qué ve el sistema sobre tu identidad
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Dato
            icon={<BadgeCheckIcon className="size-4" />}
            label="Nombre"
            value={user?.name ?? "—"}
          />
          <Dato
            icon={<MailIcon className="size-4" />}
            label="Correo electrónico"
            value={user?.email ?? "—"}
          />
          <Dato icon={<ShieldCheckIcon className="size-4" />} label="ID de usuario" value={user?.id ?? "—"} mono />
          {isDemo ? (
            <p className="text-xs text-muted-foreground">
              Sesión demo de desarrollo — los datos no son reales.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheckIcon className="size-4" />
            Roles
          </CardTitle>
          <CardDescription>
            Roles activos en esta sesión (asignados por el administrador)
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {roles.length ? (
            roles.map((role) => (
              <Badge key={role} variant="secondary">
                {ROLE_LABELS[role] ?? role}
              </Badge>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin roles asignados en esta sesión.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheckIcon className="size-4" />
            Permisos
          </CardTitle>
          <CardDescription>
            Qué acciones habilitó el sistema para tu cuenta
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {permissions.length ? (
            permissions.map((permission) => (
              <div
                key={permission}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {permission}
                </span>
                <Badge variant="outline" className="font-normal">
                  concedido
                </Badge>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Sin permisos explícitos — el acceso se resuelve por rol y por
              reglas del lado del servidor.
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        La administración de usuarios, roles y permisos se habilita en una
        fase posterior (gestión central en el panel de administrador).
      </p>
    </div>
  )
}

function Dato({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: ReactNode
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className={mono ? "font-mono text-xs" : "text-sm text-foreground"}>
        {value}
      </span>
    </div>
  )
}