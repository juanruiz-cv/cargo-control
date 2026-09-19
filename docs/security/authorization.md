# Authorization — Cargo Control (Fase 6 / Prompt 07)

**Never trust the client.** Role/permission decisions are evaluated in three
layers, in this order, and the client route guard is not one of them.

1. **Edge Functions (server-side)** — decode & verify the JWT, set the actor
   GUC, call `require_permission(...)` before business logic.
2. **RLS (database)** — every table policy evaluates the same permission
   codes through stable helpers; the final line of defense.
3. **Client guards (UX only)** — hide routes/actions; they authorize nothing.

Role matrix and seeds: `docs/security/rbac.md`. Policy matrix:
`docs/security/rls.md`.

## 1. Helpers (single source of truth)

```sql
-- permission check, org-scoped by construction (caller's own org)
create or replace function public.has_permission(_code text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from   public.users u
    join   public.user_roles      ur on ur.user_id = u.id
    join   public.roles           r  on r.id       = ur.role_id
    join   public.role_permissions rp on rp.role_id = r.id
    join   public.permissions     p  on p.id       = rp.permission_id
    where  u.auth_user_id = auth.uid()
      and  u.status       = 'active'
      and  u.organization_id = (select organization_id from public.users
                                where auth_user_id = auth.uid())
      and  p.code exists in catalog: p.code = _code
  );
$$;

-- direct role gate (tenant-level tables only: organizations, RBAC tables)
create or replace function public.has_role(_role text) returns boolean
language sql stable security definer as $$
  select exists (
    select 1
    from   public.users u
    join   public.user_roles ur on ur.user_id = u.id
    join   public.roles      r  on r.id       = ur.role_id
    where  u.auth_user_id = auth.uid()
      and  u.status       = 'active'
      and  r.code         = _role
  );
$$;
```

Notes:
- `auth.uid()` can be null (anonymous/bypass) → helpers return false →
  default deny holds.
- `status='active'` on the profile is checked **inside the helpers**, so a
  disabled user loses every grant at once.
- The org subquery binds every permission to the caller's own
  `organization_id` — cross-org rows are invisible by construction.

## 2. Server-side enforcement (Edge Functions)

Every function follows the same skeleton:

```ts
// require_permission: verify JWT, set actor, authorize, else 403
export async function requirePermission(supabase, code: string) {
  const { data: { user } } = await supabase.auth.getUser();   // verifies exp/sig
  if (!user) throw new HttpError(401, 'unauthenticated');
  const { error } = await supabase.rpc('has_permission', { _code: code });
  // (or a direct SQL check via the service key with RLS applied)
  if (error || !perm) throw new HttpError(403, `permission denied: ${code}`);
  return user;
}
```

- The function **sets the session GUC** `app.actor_id = user.id` before any
  write, so `audit_log` and the capacity audit (Fase 5) record the real
  actor. Client-supplied actor values are ignored.
- Business-rule validation lives here too (state transitions, `reason`
  requirements) — RLS is row-level, functions are operation-level.

## 3. Movement kind → permission (server + RLS agreement)

`movements` is append-only; the INSERT policy and the Edge Function both use
this map:

| movement kind | permission required |
| ------------- | ------------------- |
| `arrival`, `discharge`, `split`, `store`, `correction` | `cargo.update` |
| `transfer`, `load_out` | `cargo.transfer` |
| `scan_in`, `scan_out` | `scanner.create` |
| `scale` | `scale.create` |
| `quarantine` | `quarantine.create` |
| `seizure` | `seizure.create` |
| `release` | originating hold's create (`quarantine.create`/`seizure.create`) + supervisor check in function |
| `egress` | `truck.exit` |

Same map drives the `movement_items` INSERT policy (inherits the movement).

## 4. RLS + views

- Business views (`location_occupancy`) are created with
  `security_invoker = true` so the base tables' policies apply — no
  accidental read path around RLS.
- `audit_log` INSERT is **trigger-only** (security-definer function used by
  the audit machinery); client INSERT/UPDATE/DELETE policies do not exist,
  regardless of role.
- The `organizations` row is read by any authenticated profile of that org
  (their own tenant row); writes require `has_role('admin')`.

## 5. Defense-in-depth checklist

- [ ] JWT verified server-side on every Edge Function (never trust the body).
- [ ] `app.actor_id` GUC set from the token, never from the request body.
- [ ] Same permission codes in the function and in RLS (single catalog).
- [ ] Client guards render/hide only; they never decide.
- [ ] Disabled profile = zero grants (helper-level check).
- [ ] Append-only tables expose no UPDATE/DELETE policies.
- [ ] Views are `security_invoker` (no RLS bypass).

## Files

- Decision: `docs/adr/0007-identity-access-supabase-auth.md`
- Roles: `docs/security/rbac.md`
- Policies: `docs/security/rls.md`
- Auth flows: `docs/security/authentication.md`
- Tests: `docs/qa/security-tests.md`