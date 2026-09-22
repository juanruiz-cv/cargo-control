import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { cn } from "cn"

/**
 * Menu primitives (Base UI) — used by the header user menu and any
 * dropdown that follows the professional-ux.md §1 header contract.
 * Follows the project's base-ui wrapper pattern (tooltip/dialog).
 */

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />
}

function MenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" {...props} />
}

function MenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="menu-portal" {...props} />
}

function MenuPositioner({
  className,
  align = "end",
  sideOffset = 6,
  side = "bottom",
  ...props
}: MenuPrimitive.Positioner.Props) {
  return (
    <MenuPrimitive.Positioner
      data-slot="menu-positioner"
      align={align}
      alignOffset={0}
      side={side}
      sideOffset={sideOffset}
      className={cn("isolate z-50", className)}
      {...props}
    />
  )
}

function MenuPopup({ className, ...props }: MenuPrimitive.Popup.Props) {
  return (
    <MenuPrimitive.Popup
      data-slot="menu-popup"
      className={cn(
        "z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
        "duration-100 origin-(--transform-origin)",
        "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
        "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      className={cn(
        "relative flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none select-none",
        "data-highlighted:bg-muted data-highlighted:text-foreground",
        "data-disabled:pointer-events-none data-disabled:opacity-50",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
      {...props}
    />
  )
}

export { Menu, MenuTrigger, MenuPortal, MenuPositioner, MenuPopup, MenuItem, MenuSeparator }