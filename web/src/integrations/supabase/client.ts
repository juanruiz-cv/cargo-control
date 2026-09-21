import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { env, isSupabaseConfigured } from "@/config/env"

/**
 * Supabase client, connected by configuration only (ADR 0023 §3).
 *
 * - Active only when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are set.
 * - Never holds real secrets: anon key is a public, RLS-protected key.
 * - While unconfigured the app runs without a client; the dev-only DEMO
 *   adapter is provided by the services layer (future phase).
 */
let client: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null

  client ??= createClient(env.supabaseUrl!, env.supabaseAnonKey!)
  return client
}

export { isSupabaseConfigured }