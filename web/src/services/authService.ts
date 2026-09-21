/**
 * Auth service — Supabase Auth (docs/security/authentication.md).
 *
 * Identity lives in auth.users; `public.users` is the profile created by
 * the signup trigger (0003_authorization_helpers.sql). NOTE: the users
 * table is SELECT-gated by `has_role('admin')` in RLS (0004_rls.sql), so
 * `perfilActual()` returns `null` for non-admin profiles until the
 * engine/profile read path lands — the signup/invite flow owns that gap.
 */

import type { SupabaseClient } from "@supabase/supabase-js"

import { USER_COLUMNS } from "@/services/columns"
import type { UserRow } from "@/types"

function requireClient(client: SupabaseClient | null): SupabaseClient {
  if (!client) {
    throw new Error("Supabase no configurado — activá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY")
  }
  return client
}

/** Opaque session projection (no raw tokens leak to UI code). */
export interface SesionInfo {
  accessToken: string | null
  userId: string | null
  email: string | null
  expiresAt: number | null
}

export interface LoginResult {
  sesion: SesionInfo
  perfil: UserRow | null
}

export interface AuthService {
  iniciarSesion(email: string, password: string): Promise<LoginResult>
  cerrarSesion(): Promise<void>
  sesionActual(): Promise<SesionInfo>
  recuperarPassword(email: string): Promise<void>
  perfilActual(): Promise<UserRow | null>
}

function toSesionInfo(session: {
  access_token: string
  user: { id: string; email?: string | null }
  expires_at?: number | null
} | null): SesionInfo {
  return {
    accessToken: session?.access_token ?? null,
    userId: session?.user.id ?? null,
    email: session?.user.email ?? null,
    expiresAt: session?.expires_at ?? null,
  }
}

export class SupabaseAuthService implements AuthService {
  private readonly client: SupabaseClient | null

  constructor(client: SupabaseClient | null) {
    this.client = client
  }

  async iniciarSesion(email: string, password: string): Promise<LoginResult> {
    const client = requireClient(this.client)
    const { data, error } = await client.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    const perfil = await this.perfilActual()
    return { sesion: toSesionInfo(data.session), perfil }
  }

  async cerrarSesion(): Promise<void> {
    const client = requireClient(this.client)
    const { error } = await client.auth.signOut()
    if (error) throw new Error(error.message)
  }

  async sesionActual(): Promise<SesionInfo> {
    const client = requireClient(this.client)
    const { data } = await client.auth.getSession()
    return toSesionInfo(data.session)
  }

  async recuperarPassword(email: string): Promise<void> {
    const client = requireClient(this.client)
    const { error } = await client.auth.resetPasswordForEmail(email)
    if (error) throw new Error(error.message)
  }

  async perfilActual(): Promise<UserRow | null> {
    const client = requireClient(this.client)
    const { data: session } = await client.auth.getSession()
    const authUserId = session.session?.user.id
    if (!authUserId) return null

    // RLS caveat (documented in the file header): users is admin-read only,
    // so non-admin profiles obtain null here — expected until the profile
    // read path lands.
    const { data } = await client
      .from("users")
      .select(USER_COLUMNS)
      .eq("auth_user_id", authUserId)
      .maybeSingle()
    return (data as UserRow | null) ?? null
  }
}