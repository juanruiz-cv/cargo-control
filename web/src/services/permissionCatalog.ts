/**
 * RBAC catalog mirrors — the 7 roles and 20 permission codes of
 * docs/security/rbac.md §1–§2 (seeded in 0002_rbac_seed.sql).
 *
 * The enums in types/enums.ts are the type-level mirror; these arrays let
 * the auth services enumerate the catalog at runtime (client UX flags only:
 * authorization.md §3 — RLS and Edge Functions are the authority).
 */

import type { PermissionCode, RoleCode } from "@/types"

export const PERMISSION_CODES: readonly PermissionCode[] = [
  "truck.read",
  "truck.create",
  "truck.update",
  "truck.exit",
  "cargo.read",
  "cargo.create",
  "cargo.update",
  "cargo.transfer",
  "warehouse.read",
  "warehouse.configure",
  "warehouse.transfer",
  "scanner.read",
  "scanner.create",
  "scale.read",
  "scale.create",
  "quarantine.read",
  "quarantine.create",
  "seizure.read",
  "seizure.create",
  "audit.read",
]

export const ROLE_CODES: readonly RoleCode[] = [
  "admin",
  "supervisor",
  "operator",
  "scanner_operator",
  "scale_operator",
  "auditor",
  "viewer",
]

/** UI labels for the role catalog (used by the profile screen). */
export const ROLE_LABELS: Record<RoleCode, string> = {
  admin: "Administrador",
  supervisor: "Supervisor",
  operator: "Operador de patio",
  scanner_operator: "Operador de scanner",
  scale_operator: "Operador de báscula",
  auditor: "Auditor",
  viewer: "Consulta",
}