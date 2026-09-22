import { useEffect, useState } from "react"

/**
 * Returns the input value after a trailing delay.
 *
 * Normative per professional-ux.md §3: search inputs debounce 300 ms
 * trailing, cancelable. While debouncing, previous results stay visible.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}