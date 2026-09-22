import { NavLink } from "react-router-dom"
import { BoxesIcon } from "lucide-react"

import { NAV_GROUPS, ROUTES, type NavItem } from "@/config/routes"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useAuth } from "@/integrations/auth/useAuth"
import { cn } from "@/lib/utils"

interface SidebarProps {
  collapsed: boolean
  mobileOpen: boolean
  onCloseMobile: () => void
}

/**
 * App sidebar (professional-ux.md §1):
 * - Modules grouped Operación / Control; dense 28px rows.
 * - Active module: filled pill + icon + label (never color alone).
 * - Collapsible to an icon rail (local preference, optimistic-safe).
 * - Mobile: off-canvas overlay, Esc closes (handled by AppShell).
 * - Navigation items are filtered by route permission (authentication.md
 *   §6 guard table) — UX only, RLS stays the authority.
 */
export function Sidebar({ collapsed, mobileOpen, onCloseMobile }: SidebarProps) {
  const { hasPermission } = useAuth()

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || hasPermission(item.permission),
    ),
  })).filter((group) => group.items.length > 0)

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Cerrar menú de navegación"
          className="fixed inset-0 z-(--cc-z-overlay) cursor-default bg-black/30 lg:hidden"
          onClick={onCloseMobile}
          tabIndex={-1}
        />
      ) : null}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-(--cc-z-drawer) flex w-60 flex-col border-r border-border bg-surface transition-transform duration-(--cc-motion-base) motion-reduce:transition-none lg:static lg:z-auto lg:translate-x-0",
          collapsed && "w-14 lg:w-14",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Navegación principal"
      >
        <div
          className={cn(
            "flex h-12 shrink-0 items-center gap-2 border-b border-border px-3",
            collapsed && "justify-center px-0",
          )}
        >
          <NavLink
            to={ROUTES.dashboard}
            className="flex items-center gap-2 overflow-hidden"
            aria-label="Cargo Control"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BoxesIcon className="size-4" />
            </span>
            <span
              className={cn(
                "truncate text-md font-semibold text-foreground",
                collapsed && "hidden",
              )}
            >
              Cargo Control
            </span>
          </NavLink>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {groups.length ? (
            <ul className="space-y-4">
              {groups.map((group) => (
                <li key={group.label}>
                  <p
                    className={cn(
                      "px-2 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase",
                      collapsed && "sr-only",
                    )}
                  >
                    {group.label}
                  </p>
                  <ul className="space-y-0.5">
                    {group.items.map((item) => (
                  <li key={item.path} className={cn(collapsed && "w-full")}>
                    <SidebarNavItem
                      item={item}
                      collapsed={collapsed}
                      onNavigate={onCloseMobile}
                    />
                  </li>
                ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-4 text-sm text-muted-foreground">
              Sin secciones habilitadas para tu cuenta.
            </p>
          )}
        </nav>
      </aside>
    </>
  )
}

function SidebarNavItem({
  item,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  collapsed: boolean
  onNavigate: () => void
}) {
  const link = (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      aria-keyshortcuts={item.keyshortcut}
      className={({ isActive }) =>
        cn(
          "flex h-7 items-center gap-2 rounded-md px-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground",
          collapsed && "w-full justify-center px-0",
        )
      }
    >
      <item.icon className="size-4 shrink-0" />
      <span className={cn("truncate", collapsed && "hidden")}>
        {item.label}
      </span>
    </NavLink>
  )

  return collapsed ? (
    <Tooltip>
      <TooltipTrigger>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {item.label}
      </TooltipContent>
    </Tooltip>
  ) : (
    link
  )
}