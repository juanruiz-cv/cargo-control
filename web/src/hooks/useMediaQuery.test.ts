import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { useMediaQuery } from "@/hooks/useMediaQuery"

type Listener = (event: { matches: boolean }) => void

describe("useMediaQuery", () => {
  let listeners: Listener[] = []
  let matches: boolean

  beforeEach(() => {
    matches = false
    listeners = []
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_type: string, cb: Listener) => {
        listeners.push(cb)
      },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reports the initial match state", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"))
    expect(result.current).toBe(false)
  })

  it("subscribes and switches with the media query", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"))
    expect(result.current).toBe(false)

    act(() => {
      matches = true
      listeners.forEach((cb) => cb({ matches: true }))
    })
    expect(result.current).toBe(true)
  })
})