import { MailIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CONTACT_EMAIL } from "@/config/seo"

/** Public /contact page (T16). SEO tags come from the router-root <Seo />. */
export function ContactPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-foreground">Contacto</h1>
      <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">
        Estamos para ayudarte con tu cuenta, integraciones o cualquier
        consulta sobre la plataforma.
      </p>

      <Card>
        <CardHeader>
          <span className="mb-1 flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MailIcon className="size-4" />
          </span>
          <CardTitle className="text-sm">Soporte y consultas</CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-6 text-muted-foreground">
          <p>
            Escribinos a{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="font-medium text-primary underline underline-offset-2"
            >
              {CONTACT_EMAIL}
            </a>
            . Respondemos dentro de los días hábiles.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
