import { useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2Icon, ShieldAlertIcon, TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

/** Window in which the second confirmation click must land (ADR 0016 §6). */
const ARM_DURATION_MS = 3000

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  /** Danger-red styling + second-click semantics (never instant-click). */
  destructive?: boolean
  /**
   * Server-committed confirmation: the dialog stays open with a loading
   * action until the promise settles (professional-ux.md §5/§6).
   */
  onConfirm: () => void | Promise<void>
}

/**
 * Optimistic-safe confirmation dialog. Destructive confirmations require a
 * second click (arm → confirm), per ADR 0016 §6.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = useState(false)
  const [armed, setArmed] = useState(false)
  const disarmTimer = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (disarmTimer.current !== null) {
        window.clearTimeout(disarmTimer.current)
      }
    }
  }, [])

  const disarm = () => {
    if (disarmTimer.current !== null) {
      window.clearTimeout(disarmTimer.current)
      disarmTimer.current = null
    }
  }

  const handleOpenChange = (next: boolean) => {
    disarm()
    setArmed(false)
    setPending(false)
    onOpenChange(next)
  }

  const handleConfirm = async () => {
    if (destructive && !armed) {
      setArmed(true)
      disarmTimer.current = window.setTimeout(() => setArmed(false), ARM_DURATION_MS)
      return
    }

    disarm()
    setPending(true)
    try {
      await onConfirm()
      onOpenChange(false)
    } finally {
      setPending(false)
    }
  }

  const confirmDisabled = pending

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia
            className={
              destructive
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }
          >
            {destructive ? <TriangleAlertIcon /> : <ShieldAlertIcon />}
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            aria-live="polite"
            variant={destructive ? "destructive" : "default"}
            className={
              armed
                ? "bg-danger text-white hover:bg-danger/90 focus-visible:ring-danger/40"
                : undefined
            }
            disabled={confirmDisabled}
            onClick={handleConfirm}
          >
            {pending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : null}
            {armed ? `${confirmLabel} · 2º clic` : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}