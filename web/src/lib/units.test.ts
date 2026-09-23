import { describe, expect, it } from "vitest"

import { formatDocUnit } from "@/lib/units"

describe("formatDocUnit", () => {
  it("metric: meters when cm >= 100", () => {
    expect(formatDocUnit(50, 2, true)).toBe("1 m")
    expect(formatDocUnit(60, 2, true)).toBe("1.2 m")
  })

  it("metric: centimeters below 100 cm", () => {
    expect(formatDocUnit(25, 2, true)).toBe("50 cm")
    expect(formatDocUnit(12.5, 2, true)).toBe("25 cm")
  })

  it("imperial: inches below 12 in", () => {
    expect(formatDocUnit(12.7, 2, false)).toBe("10 in")
  })

  it("imperial: feet + inches split at 12", () => {
    expect(formatDocUnit(60.96, 2, false)).toBe("4 ft") // 48 in
    expect(formatDocUnit(76.2, 2, false)).toBe("5 ft")
  })

  it("imperial: rounded fractional inches truncate trailing .0", () => {
    // 48 in exactly → "4 ft"; 50.8 cm = 20 in → "1 ft 8 in"
    expect(formatDocUnit(50.8, 1, false)).toBe("1 ft 8 in")
  })

  it("imperial: keeps 1 decimal when needed", () => {
    // 1 in = 2.54 cm; 5 cm = 1.9685... in → 2 in
    expect(formatDocUnit(5, 1, false)).toBe("2 in")
  })
})