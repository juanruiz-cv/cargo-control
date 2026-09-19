# Authentication — Cargo Control (Fase 6 / Prompt 07)

Identity lives in **Supabase Auth** (`auth.users`). The app never stores
passwords or sessions; it delegates to GoTrue and trusts only signed JWTs.
What is documented here: login, logout, session persistence, session
expiration, password recovery, and protected routes.

Decision record: `docs/adr/0007-identity-access-supabase-auth.md`.
Authorization/RBAC: `docs/security/authorization.md`, `docs/security/rbac.md`.

## 1. Identity model

- `auth.users` — credentials, email confirmation, password hash (GoTrue).
- `public.users` — the app profile: `auth_user_id (1:1)`, `organization_id`,
  `email`, `full_name`, `status`. Created **automatically** by the
  `on_auth_user_created` trigger on signup; never created from client input.

```sql
create or replace function public.handle_new_auth_user() returns trigger as $$
begin
  insert into public.users (id, organization_id, auth_user_id, email, full_name, status)
  values (gen_random_uuid(),
          (select id from public.organizations limit 1), -- provisioning hook: invite flow assigns the org
          new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'active')
  on conflict (auth_user_id) do nothing;
  return new;
end $$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
```

Org assignment is a **provisioning decision** (admin invite), never a
self-declared field.

## 2. Login

- HTTP: `supabase.auth.signInWithPassword({ email, password })` (GoTrue
  `/auth/v1/token?grant_type=password`).
- On success the client holds an **access token (JWT)** and a **refresh
  token** (GoTrue). The profile row must be `status='active'` (or the session
  is rejected by the client guard as a UX shortcut — RLS does not care; a
  disabled profile simply has no active grants).
- **One session per client:** no anonymous sessions in the MVP.

## 3. Session persistence

| Client | Mechanism |
| ------ | --------- |
| SPA (default) | `supabase-js` with `localStorage` persistence; access + refresh tokens survive reloads |
| SSR / Next-style | cookies (`sb-*`), secure + httpOnly in production, same-site Lax; server reads the session server-side |

- Persistence is transport hygiene — it never authorizes anything by itself.
- Multi-tab: GoTrue `onAuthStateChange` (`SIGNED_IN`/`TOKEN_REFRESHED`/
  `SIGNED_OUT`) keeps tabs in sync.
- Signing out clears local token storage **and** calls `signOut()` so GoTrue
  revokes the refresh token.

## 4. Session expiration

- Access token TTL = **1 hour** (JWT `exp`), controlled by the Supabase
  project (default). The client refreshes automatically with the refresh
  token (rotation: each refresh issues a new pair and invalidates the old
  refresh token).
- Refresh token TTL = **30 days** fixed; inactivity beyond it requires login.
- On a **401 / expired session**: user is sent to the login page with
  `returnTo=<current path>`, preserving the intended destination after login.
- **Server-side expiry:** every Edge Function verifies the JWT signature and
  `exp` before trusting `auth.uid()` — a stale client token is useless.

```ts
// client guard example (UX only — authority lives in RLS)
export async function requireAuth(returnTo = location.pathname) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    return null;
  }
  return session;
}
```

## 5. Password recovery

- Flow: `supabase.auth.resetPasswordForEmail(email)` → GoTrue sends a
  branded email with a recovery link (one-time token) → user lands on the
  **Reset password** route with the token → `supabase.auth.updateUser
  ({ password })` completes the flow → session refreshes.
- Security rules:
  - Never log or return the recovery token to the client state store.
  - Rates: GoTrue enforces throttling/rate limits; do not build custom retry
    loops client-side.
  - Recovery link expiry is GoTrue-managed (default 1 hour, project setting).
- Route: `/auth/reset-password?token=<one-time>` (consumed once; a reused
  token fails).

## 6. Protected routes

Route guards are **UX only** (permission checks are re-done by RLS and Edge
Functions). Guard table for the shell:

| Route | Requires (UX) | RLS backstop |
| ----- | -------------- | ------------ |
| `/login`, `/auth/reset-password` | public (redirect to app when session exists) | — |
| `/` (dashboard) | any authenticated session | read row of the user's org |
| `/settings/users`, RBAC screens | `admin` role | `has_role('admin')` |
| Cargo screens (`/cargo*`) | `cargo.read` UX flag | `has_permission('cargo.read')` |
| Truck/parties screens | `truck.read` | `has_permission('truck.read')` |
| Warehouse/layout screens | `warehouse.read` | `has_permission('warehouse.read')` |
| Scanner station | `scanner.create` | movement `scan_*` INSERT map |
| Scale station | `scale.create` | movement `scale` INSERT map |
| Quarantine screens | `quarantine.read` | `has_permission('quarantine.read')` |
| Seizure screens | `seizure.read` | `has_permission('seizure.read')` |
| Audit screens | `audit.read` | `audit_log` SELECT policy |

Rules:
- A permitted route with a forbidden action still fails **server-side**
  (404/403 pattern: UI hides what is not granted, backend rejects what is not
  allowed).
- Session-expired redirect preserves `returnTo`; login success navigates back.
- `VIEWER`/`AUDITOR` see the read-only shell only; no action buttons render
  (cosmetic) and no action endpoint accepts them (real).

## Files

- Decision: `docs/adr/0007-identity-access-supabase-auth.md`
- Roles & permissions: `docs/security/rbac.md`
- Enforcement: `docs/security/authorization.md`
- Policies: `docs/security/rls.md`
- Tests: `docs/qa/security-tests.md`