import { Link } from "react-router-dom"
import { KeyboardIcon, LifeBuoyIcon, ShieldCheckIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NAV_GROUPS, ROUTES } from "@/config/routes"
import { CONTACT_EMAIL } from "@/config/seo"

const SECTIONS = [
  {
    icon: KeyboardIcon,
    title: "Atajos de teclado",
    body: "Navegación global con Alt+Shift (solo cuando el foco no está en un campo de texto):",
    shortcutTable: true,
  },
  {
    icon: ShieldCheckIcon,
    title: "Permisos por rol",
    body: "Cada módulo se visible según tu rol. Si una ruta no está habilitada para tu cuenta, la app muestra la pantalla de acceso restringido — el permiso real siempre lo decide el servidor.",
  },
  {
    icon: LifeBuoyIcon,
    title: "¿Necesitás ayuda?",
    body: "Si olvidaste tu contraseña usa el enlace en el login. Para cualquier otra consulta, escribinos.",
    contactLink: true,
  },
] as const

const shortcuts = NAV_GROUPS.flatMap((group) =>
  group.items
    .filter((item) => item.keyshortcut)
    .map((item) => ({ label: item.label, shortcut: item.keyshortcut! })),
)

/** Public /help page (T16). SEO tags come from the router-root <Seo />. */
export function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Ayuda</h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        Guía rápida para usar Cargo Control.
      </p>

      <div className="flex flex-col gap-4">
        {SECTIONS.map((section) => (
          <Card key={section.title}>
            <CardHeader>
              <span className="mb-1 flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                <section.icon className="size-4" />
              </span>
              <CardTitle className="text-sm">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm leading-6 text-muted-foreground">
              <p>{section.body}</p>

              {"shortcutTable" in section && section.shortcutTable ? (
                <table className="mt-3 w-full text-sm">
                  <caption className="sr-only">
                    Atajos de teclado por módulo
                  </caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-1.5 font-medium">Módulo</th>
                      <th className="py-1.5 font-medium">Atajo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortcuts.map((row) => (
                      <tr key={row.shortcut} className="border-b border-border/50">
                        <td className="py-1.5">{row.label}</td>
                        <td className="py-1.5">
                          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                            {row.shortcut}
                          </kbd>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}

              {"contactLink" in section && section.contactLink ? (
                <p className="mt-3">
                  Escribinos a{" "}
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    {CONTACT_EMAIL}
                  </a>{" "}
                  o revisá la página de{" "}
                  <Link
                    to={ROUTES.contact}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    contacto
                  </Link>
                  .
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
