import {
  ArrowRightLeftIcon,
  ClipboardListIcon,
  FileBarChartIcon,
  MapIcon,
  ScaleIcon,
  ScanLineIcon,
  ShieldCheckIcon,
  TruckIcon,
} from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

const FEATURES = [
  {
    icon: MapIcon,
    title: "Mapa operativo",
    description:
      "Vista en tiempo real del playón, sectores y ubicaciones, con el estado de cada camión y su mercadería.",
  },
  {
    icon: TruckIcon,
    title: "Gestión de camiones",
    description:
      "Registro de entrada y salida, estados documentados y trazabilidad completa de cada unidad.",
  },
  {
    icon: ClipboardListIcon,
    title: "Cargamentos",
    description:
      "Manifiestos, ítems y splits de lotes con control de capacidad y transferencias auditables.",
  },
  {
    icon: ArrowRightLeftIcon,
    title: "Movimientos",
    description:
      "Quince tipos de movimiento transaccionales e idempotentes, con guardas de negocio y auditoría.",
  },
  {
    icon: ScanLineIcon,
    title: "Scanner y balanza",
    description:
      "Colas operativas en estaciones de escaneo y pesaje, con confirmación explícita del operador.",
  },
  {
    icon: ShieldCheckIcon,
    title: "Rezago y secuestro",
    description:
      "Holds de cuarentena y flujos de secuestro con adjuntos, motivos y liberación controlada.",
  },
  {
    icon: ScaleIcon,
    title: "Planos dinámicos",
    description:
      "Editor de planta con versionado, publicación y restauración de layouts.",
  },
  {
    icon: FileBarChartIcon,
    title: "Reportes y auditoría",
    description:
      "Reportes por módulo con exportación CSV y bitácora de auditoría de solo lectura.",
  },
] as const

/** Public /about page (T16). SEO tags come from the router-root <Seo />. */
export function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <section className="mb-10 max-w-2xl">
        <h1 className="text-2xl font-semibold text-foreground">
          Acerca de Cargo Control
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Cargo Control es una plataforma de control y trazabilidad de
          camiones y mercadería para playones y depósitos: desde la entrada de
          la unidad hasta la salida de la carga, con mapa operativo,
          movimientos auditables, control de rezago y secuestro, reportes y
          bitácora completa.
        </p>
      </section>

      <section aria-labelledby="about-features">
        <h2 id="about-features" className="mb-4 text-lg font-semibold">
          Qué incluye
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <li key={feature.title}>
              <Card className="h-full">
                <CardHeader className="pb-2">
                  <span className="mb-1 flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <feature.icon className="size-4" />
                  </span>
                  <CardTitle className="text-sm">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-xs leading-5 text-muted-foreground">
                  {feature.description}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 max-w-2xl">
        <h2 className="mb-2 text-lg font-semibold">Cómo funciona</h2>
        <p className="text-sm leading-6 text-muted-foreground">
          La visualización y la logística son capas distintas: editar o
          publicar un plano nunca registra un movimiento de mercadería. Todos
          los movimientos son append-only, transaccionales e idempotentes, y
          la seguridad vive en permisos por rol y políticas de fila a nivel de
          base de datos — no en la visibilidad de los botones.
        </p>
      </section>
    </div>
  )
}
