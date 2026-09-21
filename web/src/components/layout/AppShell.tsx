import { useEffect, useState } from "react"
import { Outlet, useNavigate } from "react-router-dom"

import { Header } from "@/components/layout/Header"
import { Sidebar } from "@/components/layout/Sidebar"
import { NAV_GROUPS } from "@/config/routes"
import { useLocalStorage } from "@/hooks/useLocalStorage"
import { useMediaQuery } from "@/hooks/useMediaQuery"

const DESKTOP_QUERY = "(min-width: 1024px)"

/**
 * Application shell: sidebar + header + main (professional-ux.md §1).
 * - Sidebar collapse is a local preference (optimistic-safe).
 * - Mobile navigation is off-canvas; Esc closes the overlay.
 * - Global keyboard navigation per the shortcuts table.
 */
export function AppShell() {
  const [collapsed, setCollapsed] = useLocalStorage("cc.sidebar.collapsed", false)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  // The off-canvas nav only applies below the desktop breakpoint.
  const mobileNavOpen = mobileOpen && !isDesktop

  useEffect(() => {
    if (!mobileNavOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileNavOpen])

  useEffect(() => {
    const shortcuts = new Map(
      NAV_GROUPS.flatMap((group) => group.items)
        .filter((item) => item.keyshortcut)
        .map((item) => [item.keyshortcut!, item.path]),
    )

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return
      }

      if (!event.altKey || !event.shiftKey) return

      const path = shortcuts.get(`Alt+Shift+${event.key}`)
      if (path) {
        event.preventDefault()
        setMobileOpen(false)
        navigate(path)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [navigate])

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((previous) => !previous)}
          onToggleMobile={() => setMobileOpen((previous) => !previous)}
        />
        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}