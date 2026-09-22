/** Format a doc-unit dimension using layouts.scale (cm per doc unit). */
export function formatDocUnit(value: number, escalaCmPorUnidad: number, metric: boolean): string {
  const cm = value * escalaCmPorUnidad
  if (metric) {
    if (cm >= 100) return `${trim1(cm / 100)} m`
    return `${trim1(cm)} cm`
  }
  // Imperial: convert cm → inches (1 in = 2.54 cm).
  const inch = cm / 2.54
  if (inch >= 12) {
    const ft = Math.floor(inch / 12)
    const rest = trim1(inch % 12)
    return rest === "0" ? `${ft} ft` : `${ft} ft ${rest} in`
  }
  return `${trim1(inch)} in`
}

function trim1(n: number): string {
  const r = Math.round(n * 10) / 10
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(/\.0$/, "")
}