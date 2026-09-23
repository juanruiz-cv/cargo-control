import { ROUTES } from "@/config/routes"

/**
 * Single source of truth for public-page SEO metadata (T16).
 *
 * SITE_URL is a TEMPORARY placeholder (maintainer decision 2026-09-23):
 * when the production domain is chosen, change it HERE and mirror it in
 * web/public/robots.txt (Sitemap line) and web/public/sitemap.xml (locs).
 *
 * PUBLIC_SEO declares exactly which routes are indexable. Every other
 * route is forced noindex,nofollow by <Seo /> (mounted on AppShell and
 * on PublicLayout) plus the fail-closed static default in index.html.
 *
 * "/" is intentionally NOT listed: it client-redirects to /dashboard or
 * /login and never renders indexable content, so it must not appear in
 * the sitemap either (recorded in odd/tasks/web-app.md T16).
 */

export const SITE_URL = "https://cargo-control.example.com"

/** Single place to change the contact address (ContactPage + HelpPage). */
export const CONTACT_EMAIL = "contacto@cargo-control.example.com"

export const DEFAULT_DESCRIPTION =
  "Cargo Control — plataforma de control y trazabilidad de camiones y mercadería"

export interface PublicPageSeo {
  title: string
  description: string
}

export const PUBLIC_SEO: Record<string, PublicPageSeo> = {
  [ROUTES.login]: {
    title: "Iniciar sesión — Cargo Control",
    description: DEFAULT_DESCRIPTION,
  },
  [ROUTES.about]: {
    title: "Acerca de — Cargo Control",
    description:
      "Cargo Control: mapa operativo, camiones, cargamentos, movimientos, scanner, balanza, rezago, secuestro, reportes y auditoría en una sola plataforma.",
  },
  [ROUTES.help]: {
    title: "Ayuda — Cargo Control",
    description:
      "Cómo usar Cargo Control: navegación, atajos de teclado, permisos por rol y soporte.",
  },
  [ROUTES.contact]: {
    title: "Contacto — Cargo Control",
    description: "Canales de contacto y soporte de Cargo Control.",
  },
}
