import { describe, expect, it } from "vitest"

import { exportarCsv, nombreArchivoReporte, type CeldaFormateada } from "@/lib/csv"

describe("exportarCsv", () => {
  it("emits BOM + es-AR ';' separator + CRLF", () => {
    const columnas: CeldaFormateada[] = [
      { clave: "code", titulo: "Código" },
      { clave: "qty", titulo: "Cantidad" },
    ]
    const filas = [{ code: "M-1", qty: 3 }]
    const out = exportarCsv(columnas, filas)
    expect(out.charCodeAt(0)).toBe(0xfeff)
    expect(out).toBe("\uFEFFCódigo;Cantidad\r\nM-1;3")
  })

  it("quotes only fields containing separator, quote or newline (RFC 4180)", () => {
    const columnas: CeldaFormateada[] = [
      { clave: "desc", titulo: "Descripción" },
      { clave: "note", titulo: "Nota" },
    ]
    const filas = [
      { desc: "plain", note: "has;semi" },
      { desc: 'say "hi"', note: "line\nbreak" },
    ]
    const out = exportarCsv(columnas, filas)
    expect(out).toContain("plain;\"has;semi\"")
    expect(out).toContain('"say ""hi""";"line\nbreak"')
  })

  it("renders null/undefined as empty cells", () => {
    const columnas: CeldaFormateada[] = [
      { clave: "a", titulo: "A" },
      { clave: "b", titulo: "B" },
    ]
    expect(exportarCsv(columnas, [{ a: null, b: undefined }])).toBe("\uFEFFA;B\r\n;")
  })

  it("uses the SAME formato function as the table renders (no second path)", () => {
    const columnas: CeldaFormateada[] = [
      { clave: "qty", titulo: "Cantidad", formato: (v) => `${v} kg` },
    ]
    const out = exportarCsv(columnas, [{ qty: 12 }])
    expect(out).toBe("\uFEFFCantidad\r\n12 kg")
  })
})

describe("nombreArchivoReporte", () => {
  it("formats local date with zero-padding", () => {
    const fecha = new Date(2026, 8, 5) // Sep 5, 2026 local
    expect(nombreArchivoReporte("movimientos", fecha)).toBe("reporte-movimientos-2026-09-05.csv")
  })

  it("defaults to the current date", () => {
    const hoy = new Date()
    const esperado = `reporte-op-${String(hoy.getFullYear())}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}.csv`
    expect(nombreArchivoReporte("op")).toBe(esperado)
  })
})