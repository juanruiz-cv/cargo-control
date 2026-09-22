/**
 * CSV export helper — REPORTE CSV contract (es-AR).
 *
 * Contract (documented for the Reports module, E10-2):
 *   - BOM \uFEFF so Excel (Argentina locale) opens UTF-8 without mojibake.
 *   - `;` field separator (es-AR convention; Excel AR expects `;`).
 *   - RFC 4180 escaping: `"` is doubled; a field is wrapped in quotes ONLY
 *     when it contains `;`, `"`, `\n` or `\r`; null/undefined → empty cell.
 *   - filename `reporte-<slug>-YYYY-MM-DD.csv` (local calendar date).
 *
 * The report exports EXACTLY what the table shows: the same
 * `columnas[i].formato` strings, same filters, same order, same bounded
 * page (reportService.ts). There is no second formatting path.
 */

export interface CeldaFormateada {
  /** Column key — used as the CSV header when `formato` is absent. */
  clave: string
  /** Header label (Spanish, es-AR). */
  titulo: string
  formato?: (valor: unknown) => string
}

/** One CSV cell: null/undefined render as empty; everything else via String(). */
function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return ""
  const texto = String(valor)
  const necesitaComillas = texto.includes(";") || texto.includes('"') || texto.includes("\n") || texto.includes("\r")
  if (!necesitaComillas) return texto
  return `"${texto.replaceAll('"', '""')}"`
}

/**
 * Serialize rows to CSV. `columnas.formato` (when present) is the ONLY
 * formatting applied — the same function the table renders with.
 */
export function exportarCsv(columnas: readonly CeldaFormateada[], filas: readonly Record<string, unknown>[]): string {
  const encabezados = columnas.map((columna) => celda(columna.titulo)).join(";")
  const lineas = filas.map((fila) =>
    columnas.map((columna) => celda(columna.formato ? columna.formato(fila[columna.clave]) : fila[columna.clave])).join(";"),
  )
  return `\uFEFF${[encabezados, ...lineas].join("\r\n")}`
}

/** `reporte-<slug>-YYYY-MM-DD.csv` using the LOCAL calendar date (es-AR). */
export function nombreArchivoReporte(slug: string, fecha: Date = new Date()): string {
  const aaa = fecha.getFullYear()
  const mm = String(fecha.getMonth() + 1).padStart(2, "0")
  const dd = String(fecha.getDate()).padStart(2, "0")
  return `reporte-${slug}-${aaa}-${mm}-${dd}.csv`
}

/** Trigger a browser download of `contenido` as UTF-8 CSV (Blob + anchor). */
export function descargarCsv(nombre: string, contenido: string): void {
  const blob = new Blob([contenido], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const ancla = document.createElement("a")
  ancla.href = url
  ancla.download = nombre
  document.body.appendChild(ancla)
  ancla.click()
  ancla.remove()
  URL.revokeObjectURL(url)
}