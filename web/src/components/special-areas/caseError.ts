import { MovementEngineError } from "@/services/movementService"
import type { GuardResult } from "@/lib/movement-guards"

/**
 * Normalize any thrown error into the engine's aggregate verdict shape:
 * MovementEngineError carries the guard list (never first-fail); anything
 * else becomes a plain message with no guard rows.
 */
export function errorDe(cause: unknown): { fallos: GuardResult[]; mensaje: string } {
  if (cause instanceof MovementEngineError) {
    return { fallos: cause.validaciones, mensaje: cause.message }
  }
  return { fallos: [], mensaje: cause instanceof Error ? cause.message : String(cause) }
}