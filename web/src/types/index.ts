/**
 * Data layer types — Cargo Control frontend.
 *
 * Source of truth: supabase/migrations/0001_schema.sql (25 tables, CHECK
 * enums), 0002_rbac_seed.sql (roles/permissions), 0005_views.sql (read-side
 * views). Column names keep the exact snake_case of the schema (identity
 * mapping, documented in database.ts).
 */

export * from "@/types/enums"
export * from "@/types/database"
export * from "@/types/views"