import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ESTADO_OPERATIVO } from "@/components/map/shared/estadoOperativo"
import { EstadoOperativoBadge } from "@/components/map/shared/EstadoOperativoBadge"
import { ZoomControls } from "@/components/map/shared/ZoomControls"

describe("EstadoOperativoBadge", () => {
  it("renders the Spanish label for the state", () => {
    render(<EstadoOperativoBadge estado={ESTADO_OPERATIVO.OCUPADO} />)
    expect(screen.getByText("Ocupado")).toBeInTheDocument()
  })

  it("applies the state color as text and dot", () => {
    const { container } = render(<EstadoOperativoBadge estado={ESTADO_OPERATIVO.BLOQUEADO} />)
    const label = screen.getByText("Bloqueado")
    expect(label).toHaveStyle({ color: "#7C3AED" })
    const dot = container.querySelector("span[aria-hidden]")
    expect(dot).toHaveStyle({ backgroundColor: "#7C3AED" })
  })
})

describe("ZoomControls", () => {
  it("shows the zoom percent and wires the three actions", async () => {
    const onZoomIn = vi.fn()
    const onZoomOut = vi.fn()
    const onFit = vi.fn()
    const user = userEvent.setup()

    render(
      <ZoomControls
        zoom={1.5}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onFit={onFit}
      />,
    )

    expect(screen.getByText("150%")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Acercar" }))
    await user.click(screen.getByRole("button", { name: "Alejar" }))
    await user.click(screen.getByRole("button", { name: "Ajustar a pantalla" }))
    expect(onZoomIn).toHaveBeenCalledTimes(1)
    expect(onZoomOut).toHaveBeenCalledTimes(1)
    expect(onFit).toHaveBeenCalledTimes(1)
  })

  it("disables zoom buttons at their limits", () => {
    render(
      <ZoomControls zoom={1} onZoomIn={vi.fn()} onZoomOut={vi.fn()} onFit={vi.fn()} atMinZoom atMaxZoom={false} />,
    )
    expect(screen.getByRole("button", { name: "Alejar" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Acercar" })).toBeEnabled()
  })
})