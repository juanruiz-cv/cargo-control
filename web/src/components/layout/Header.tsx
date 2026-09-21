import { useLocation, Link } from "react-router-dom"
import {
  MenuIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  UserRoundIcon,
} from "lucide-react"

import { ROUTES, NAV_GROUPS } from "@/config/routes"
import { Breadcrumbs, type BreadcrumbItemData } from "@/components/shared/Breadcrumbs"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface HeaderProps {
  collapsed: boolean
  onToggleCollapse: () => void
  onToggleMobile: () => void
}

/**
 * Sticky app header (professional-ux.md §1): module breadcrumb on the
 * left, shell toggles and user menu anchor on the right. Never scrolls
 * with the body.
 */
export function Header({
  collapsed,
  onToggleCollapse,
  onToggleMobile,
}: HeaderProps) {
  const { pathname } = useLocation()

  const current = NAV_GROUPS.flatMap((group) => group.items).find(
    (item) =>
      pathname === item.path || pathname.startsWith(`${item.path}/`),
  )

  const breadcrumb: BreadcrumbItemData[] =
    current && current.path !== ROUTES.dashboard
      ? [
          { label: "Inicio", to: ROUTES.dashboard },
          { label: current.label },
        ]
      : [{ label: "Inicio" }]

  return (
    <header className="sticky top-0 z-(--cc-z-sticky) flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3 md:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={onToggleMobile}
        aria-label="Abrir menú de navegación"
      >
        <MenuIcon />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="hidden lg:inline-flex"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
        title={collapsed ? "Expandir menú lateral" : "Colapsar menú lateral"}
      >
        {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
      </Button>

      <div className="min-w-0 flex-1">
        <Breadcrumbs items={breadcrumb} />
      </div>

      <Tooltip>
        <TooltipTrigger>
          <Button
            variant="ghost"
            size="icon"
            render={<Link to={ROUTES.login} />}
            className={cn(collapsed && "hidden")}
            aria-label="Iniciar sesión"
          >
            <UserRoundIcon />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Iniciar sesión · fase Auth</TooltipContent>
      </Tooltip>
    </header>
  )
}