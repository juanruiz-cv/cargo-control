-- =====================================================================
-- Cargo Control — 0003_authorization_helpers.sql
-- =====================================================================
-- Authorization helpers — the single source of truth consumed by every RLS
-- policy (0004_rls.sql) and by server-side Edge Functions.
-- Sources: docs/security/authorization.md §1 (helpers) and §3 (kind ->
-- permission map), docs/security/authentication.md (signup trigger),
-- ADR 0007.
--
-- Hardening note: helpers are SECURITY DEFINER (they must read the RBAC
-- catalog regardless of the caller's RLS grants) with `set search_path = ''`
-- and fully-qualified object names so a malicious earlier schema in the
-- search path cannot hijack the joins. This preserves the documented logic
-- verbatim (authorization.md §1); the doc's SQL is otherwise reproduced
-- as-is, including the org-scoping subquery.
-- =====================================================================

-- permission check, org-scoped by construction (caller's own org)
create or replace function public.has_permission(_code text) returns boolean
language sql stable security definer set search_path = '' as $$
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
      and  p.code = _code
  );
$$;

-- direct role gate (tenant-level tables only: organizations, RBAC tables)
create or replace function public.has_role(_role text) returns boolean
language sql stable security definer set search_path = '' as $$
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

-- Movement kind -> permission map (authorization.md §3 + rls.md Fase 9
-- assert + movement-engine.md §Type map). Single function used by BOTH the
-- movements INSERT policy and the movement_items INSERT policy, so the
-- server (Edge Function) and RLS agree on the same catalog.
--
-- `release` maps to the originating hold's create permission; the
-- supervisor gate lives in the Edge Function (rbac.md §3,
-- authorization.md §3), not in RLS.
create or replace function public.movement_kind_permitted(_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case _kind
    when 'arrival'       then public.has_permission('cargo.update')
    when 'discharge'     then public.has_permission('cargo.update')
    when 'split'         then public.has_permission('cargo.update')
    when 'store'         then public.has_permission('cargo.update')
    when 'correction'    then public.has_permission('cargo.update')
    when 'transfer'      then public.has_permission('cargo.transfer')
    when 'load_out'      then public.has_permission('cargo.transfer')
    when 'return_to_truck' then public.has_permission('cargo.transfer')
    when 'scan_in'       then public.has_permission('scanner.create')
    when 'scan_out'      then public.has_permission('scanner.create')
    when 'scale'         then public.has_permission('scale.create')
    when 'quarantine'    then public.has_permission('quarantine.create')
    when 'seizure'       then public.has_permission('seizure.create')
    when 'release'       then public.has_permission('quarantine.create')
                              or public.has_permission('seizure.create')
    when 'egress'        then public.has_permission('truck.exit')
    else false
  end;
$$;

-- Profile creation on signup (authentication.md §1): identity lives in
-- auth.users; public.users is created automatically, never from client
-- input. Org assignment is a provisioning hook (admin invite flow assigns
-- the org later).
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.users (id, organization_id, auth_user_id, email, full_name, status)
  values (gen_random_uuid(),
          (select id from public.organizations limit 1), -- provisioning hook: invite flow assigns the org
          new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'active')
  on conflict (auth_user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();