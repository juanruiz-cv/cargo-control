import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useLocalStorage } from "@/hooks/useLocalStorage"

describe("useLocalStorage", () => {
  const key = "test.pref"

  beforeEach(() => {
    window.localStorage.clear()
  })

  it("reads an existing JSON value", () => {
    window.localStorage.setItem(key, JSON.stringify({ compact: true }))
    const { result } = renderHook(() => useLocalStorage<{ compact: boolean }>(key, { compact: false }))
    expect(result.current[0]).toEqual({ compact: true })
  })

  it("uses the initial value when storage is empty", () => {
    const { result } = renderHook(() => useLocalStorage(key, "default"))
    expect(result.current[0]).toBe("default")
  })

  it("writes JSON back to storage when the setter runs", () => {
    const { result } = renderHook(() => useLocalStorage(key, "default"))
    act(() => {
      result.current[1]("updated")
    })
    expect(result.current[0]).toBe("updated")
    expect(window.localStorage.getItem(key)).toBe(JSON.stringify("updated"))
  })

  it("supports the functional updater form", () => {
    const { result } = renderHook(() => useLocalStorage<number>(key, 0))
    act(() => {
      result.current[1]((prev) => prev + 1)
    })
    expect(result.current[0]).toBe(1)
  })

  it("falls back to the initial value when JSON is corrupt", () => {
    window.localStorage.setItem(key, "{not-json")
    const { result } = renderHook(() => useLocalStorage(key, "safe"))
    expect(result.current[0]).toBe("safe")
  })

  it("keeps the in-memory value when storage throws (private mode)", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "setItem").mockImplementation(() => {
      throw new Error("quota")
    })
    const { result } = renderHook(() => useLocalStorage(key, "default"))
    act(() => {
      result.current[1]("updated")
    })
    expect(result.current[0]).toBe("updated")
    spy.mockRestore()
  })
})