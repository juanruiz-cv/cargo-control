import { LogOutIcon, UserRoundIcon } from "lucide-react"
import { Link, useNavigate } from "react-router-dom"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuPortal,
  MenuPositioner,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { ROUTES } from "@/config/routes"
import { useAuth } from "@/integrations/auth/useAuth"
import { cn } from "@/lib/utils"

function initialsOf(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.trim() || "?"
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

/**
 * User menu (professional-ux.md §1): avatar with initials, profile link,
 * DEMO marker (dev adapter), sign-out. Menu is the base-ui wrapper used by
 * the rest of the app.
 */
export function UserMenu({ className }: { className?: string }) {
  const { user, isDemo, signOut } = useAuth()
  const navigate = useNavigate()

  if (!user) return null

  async function handleSignOut() {
    try {
      await signOut()
    } finally {
      navigate(ROUTES.login, { replace: true })
    }
  }

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className={cn("rounded-full", className)}
            aria-label={`Menú de usuario: ${user.name ?? user.email ?? "cuenta"}`}
          >
            {initialsOf(user.name, user.email)}
          </Button>
        }
      />
      <MenuPortal>
        <MenuPositioner>
          <MenuPopup className="min-w-56">
            <div className="flex flex-col gap-0.5 px-2 py-2">
              <span className="truncate text-sm font-medium text-foreground">
                {user.name ?? user.email}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user.email}
              </span>
              {isDemo ? (
                <Badge variant="secondary" className="mt-1 w-fit">
                  Demo
                </Badge>
              ) : null}
            </div>
            <MenuSeparator />
            <MenuItem render={<Link to={ROUTES.settings} />}>
              <UserRoundIcon />
              Mi perfil
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={handleSignOut}>
              <LogOutIcon />
              Cerrar sesión
            </MenuItem>
          </MenuPopup>
        </MenuPositioner>
      </MenuPortal>
    </Menu>
  )
}