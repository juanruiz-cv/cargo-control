import { Link, NavLink, Outlet } from "react-router-dom"
import { BoxesIcon } from "lucide-react"

import { ROUTES } from "@/config/routes"
import { cn } from "@/lib/utils"

const PUBLIC_LINKS = [
  { to: ROUTES.about, label: "Acerca de" },
  { to: ROUTES.help, label: "Ayuda" },
  { to: ROUTES.contact, label: "Contacto" },
] as const

/**
 * Chrome for the public pages (/about, /help, /contact): brand header,
 * public nav with active state, content outlet, footer. No app-shell,
 * no session required (T16 public surface; SEO is handled by the
 * router-root <Seo />, not here).
 */
export function PublicLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-(--cc-z-sticky) border-b border-border bg-surface">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-4 px-4">
          <Link
            to="/"
            className="flex items-center gap-2"
            aria-label="Cargo Control — inicio"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <BoxesIcon className="size-4" />
            </span>
            <span className="text-md font-semibold text-foreground">
              Cargo Control
            </span>
          </Link>

          <nav aria-label="Navegación pública" className="flex items-center gap-1">
            {PUBLIC_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-2 py-1 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
            <Link
              to={ROUTES.login}
              className="ml-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
            >
              Iniciar sesión
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border py-4">
        <p className="mx-auto max-w-5xl px-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Cargo Control — control y trazabilidad
          de camiones y mercadería
        </p>
      </footer>
    </div>
  )
}
