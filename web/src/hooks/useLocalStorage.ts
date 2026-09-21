import { useCallback, useState } from "react"

/**
 * Local persistent preference (optimistic-safe per ADR 0016):
 * sidebar collapse, density, column presets. JSON-serialized.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((previous: T) => T)) => void] {
  const [stored, setStored] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  const setValue = useCallback(
    (value: T | ((previous: T) => T)) => {
      setStored((previous) => {
        const next =
          typeof value === "function"
            ? (value as (prev: T) => T)(previous)
            : value
        try {
          window.localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Storage unavailable (private mode / quota) — keep in-memory value.
        }
        return next
      })
    },
    [key],
  )

  return [stored, setValue]
}