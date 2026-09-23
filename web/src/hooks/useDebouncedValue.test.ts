import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns the initial value immediately", () => {
    const { result } = renderHook(() => useDebouncedValue("a"))
    expect(result.current).toBe("a")
  })

  it("updates only after the trailing delay", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), { initialProps: { v: "a" } })
    rerender({ v: "b" })
    expect(result.current).toBe("a") // still debouncing

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe("b")
  })

  it("cancels the previous timer when the value changes again (trailing only)", () => {
    const { result, rerender } = renderHook(({ v }) => useDebouncedValue(v), { initialProps: { v: "a" } })
    rerender({ v: "b" })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    rerender({ v: "c" })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe("c") // "b" never became the debounced value
  })

  it("honors a custom delay", () => {
    const { result, rerender } = renderHook(({ v, d }) => useDebouncedValue(v, d), {
      initialProps: { v: "a", d: 500 },
    })
    rerender({ v: "b", d: 500 })
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(result.current).toBe("a")
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe("b")
  })
})