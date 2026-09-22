import { z } from "zod"

/**
 * Environment schema (Vite).
 *
 * Only public, non-secret variables live here. Supabase credentials are
 * wired by configuration (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY),
 * never committed (GIT-AS-5). When the variables are absent, the app runs
 * without a Supabase client; the DEMO adapter (dev-only, ADR 0023) is
 * activated by the services layer once business services exist.
 */
const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url().optional(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1).optional(),
})

const parsed = envSchema.safeParse(import.meta.env)

export const env = {
  supabaseUrl: parsed.success ? parsed.data.VITE_SUPABASE_URL : undefined,
  supabaseAnonKey: parsed.success
    ? parsed.data.VITE_SUPABASE_ANON_KEY
    : undefined,
}

/** True only when both Supabase env vars are present and valid. */
export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
)