-- =====================================================================
-- Cargo Control — 0004_rls.sql
-- =====================================================================
-- Row Level Security: enabled on every business table, DEFAULT DENY, policies
-- evaluated exclusively through public.has_permission(code) / has_role(code)
-- (0003_authorization_helpers.sql). No bypassrls for the data API; service
-- role / owner writes (engine, triggers) bypass RLS by PostgreSQL design.
-- Matrix: docs/security/rls.md. Helpers: docs/security/authorization.md.
-- ADR 0007 (permission-driven RLS), ADR 0014 (audit), ADR 0011 (append-only
-- ops).
--
-- =====================================================================
-- CONTRADICTION #1 (cargo.transfer vs operator) — RESOLUTION
--   * rls.md §Fase 8/§Fase 9 and rbac.md §3 (CANONICAL decision home) grant
--     `cargo.transfer` to admin/supervisor/operator; return_to_truck maps to
--     `cargo.transfer` (movement-engine.md §Type map, ADR 0010).
--   * QA docs claim DENIED: movement-engine-tests ME-33 ("needs cargo.transfer,
--     supervisor-level per RBAC matrix") and cargo-module-tests M-46
--     ("cargo.transfer not granted to operator").
--   * RESOLUTION: follow rls.md/rbac.md — operator CAN transfer (and
--     return_to_truck). The QA tension is registered as a follow-up, NOT a
--     doc change, per orchestration decision.
-- =====================================================================
-- CONTRADICTION #2 (locations writes) — RESOLUTION
--   * rls.md matrix (CANONICAL): locations INSERT/UPDATE = warehouse.configure
--     (admin + supervisor per rbac.md §3).
--   * capacity-occupancy-tests T-35 asserts "admin/supervisor/operator per
--     rls.md".
--   * RESOLUTION: follow rls.md — operator does NOT write locations; T-35's
--     parenthetical is a QA wording issue (registered as follow-up).
-- =====================================================================
-- TENSION (item_lots writes; registered, not a doc change)
--   * rls.md matrix: item_lots INSERT/UPDATE = cargo.update (placement
--     changes via movements).
--   * movement-engine-tests ME-14 asserts "permission denied (no UPDATE
--     grant; placement only through movements)".
--   * RESOLUTION: matrix (canonical) is applied below; placement-only-
--     through-movements is enforced by the ENGINE protocol (movement-engine.md
--     §Transactional), not by RLS. QA follow-up registered.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enable RLS (default deny) on every business table
-- ---------------------------------------------------------------------
alter table public.organizations        enable row level security;
alter table public.facilities           enable row level security;
alter table public.locations            enable row level security;
alter table public.layouts              enable row level security;
alter table public.layout_elements      enable row level security;
alter table public.users                enable row level security;
alter table public.roles                enable row level security;
alter table public.permissions          enable row level security;
alter table public.user_roles           enable row level security;
alter table public.role_permissions     enable row level security;
alter table public.transport_companies  enable row level security;
alter table public.drivers              enable row level security;
alter table public.trucks               enable row level security;
alter table public.parties              enable row level security;
alter table public.cargo_manifests      enable row level security;
alter table public.cargo_items          enable row level security;
alter table public.item_lots            enable row level security;
alter table public.movements            enable row level security;
alter table public.movement_items       enable row level security;
alter table public.scanner_operations   enable row level security;
alter table public.scale_operations     enable row level security;
alter table public.quarantine_operations enable row level security;
alter table public.seizure_operations   enable row level security;
alter table public.attachments          enable row level security;
alter table public.audit_log            enable row level security;

-- ---------------------------------------------------------------------
-- Tenancy (rls.md matrix rows)
-- ---------------------------------------------------------------------
-- organizations: own-org profile readable by any authenticated profile of
-- the org (rls.md policy shape); writes require has_role('admin').
-- NOTE: has_role is NOT org-scoped (documented helper semantics, rls.md
-- examples). Tenant-table policies follow the documented shape verbatim;
-- org-scoping them further is a possible hardening follow-up.
create policy org_profile_read on public.organizations
  for select using (
    exists (select 1 from public.users u
            where u.auth_user_id = auth.uid()
              and u.organization_id = public.organizations.id));
create policy organizations_insert on public.organizations
  for insert with check (public.has_role('admin'));
create policy organizations_update on public.organizations
  for update using (public.has_role('admin'));

-- facilities / locations / layouts / layout_elements: warehouse.* codes
create policy facility_read on public.facilities
  for select using (public.has_permission('warehouse.read'));
create policy facility_insert on public.facilities
  for insert with check (public.has_permission('warehouse.configure'));
create policy facility_update on public.facilities
  for update using (public.has_permission('warehouse.configure'))
             with check (public.has_permission('warehouse.configure'));

-- locations writes: warehouse.configure only (contradiction #2 resolution)
create policy location_read on public.locations
  for select using (public.has_permission('warehouse.read'));
create policy location_insert on public.locations
  for insert with check (public.has_permission('warehouse.configure'));
create policy location_update on public.locations
  for update using (public.has_permission('warehouse.configure'))
             with check (public.has_permission('warehouse.configure'));

create policy layout_read on public.layouts
  for select using (public.has_permission('warehouse.read'));
create policy layout_insert on public.layouts
  for insert with check (public.has_permission('warehouse.configure'));
create policy layout_update on public.layouts
  for update using (public.has_permission('warehouse.configure'))
             with check (public.has_permission('warehouse.configure'));

create policy layout_element_read on public.layout_elements
  for select using (public.has_permission('warehouse.read'));
create policy layout_element_insert on public.layout_elements
  for insert with check (public.has_permission('warehouse.configure'));
create policy layout_element_update on public.layout_elements
  for update using (public.has_permission('warehouse.configure'))
             with check (public.has_permission('warehouse.configure'));

-- ---------------------------------------------------------------------
-- Identity & RBAC tables: has_role('admin') only (rls.md matrix)
-- ---------------------------------------------------------------------
create policy user_read on public.users
  for select using (public.has_role('admin'));
create policy user_insert on public.users
  for insert with check (public.has_role('admin'));
-- "(not self-editable by target)": an admin cannot edit their OWN profile row
-- (identity is auth_user_id; profile id <> auth.uid() by design).
create policy user_update on public.users
  for update using (public.has_role('admin'))
             with check (public.has_role('admin')
                         and auth_user_id is distinct from auth.uid());

create policy role_read on public.roles
  for select using (public.has_role('admin'));
create policy role_insert on public.roles
  for insert with check (public.has_role('admin'));
create policy role_update on public.roles
  for update using (public.has_role('admin'));

create policy permission_read on public.permissions
  for select using (public.has_role('admin'));
create policy permission_insert on public.permissions
  for insert with check (public.has_role('admin'));
create policy permission_update on public.permissions
  for update using (public.has_role('admin'));

create policy user_role_read on public.user_roles
  for select using (public.has_role('admin'));
create policy user_role_insert on public.user_roles
  for insert with check (public.has_role('admin'));
create policy user_role_update on public.user_roles
  for update using (public.has_role('admin'));

create policy role_permission_read on public.role_permissions
  for select using (public.has_role('admin'));
create policy role_permission_insert on public.role_permissions
  for insert with check (public.has_role('admin'));
create policy role_permission_update on public.role_permissions
  for update using (public.has_role('admin'));

-- ---------------------------------------------------------------------
-- Fleet & counterparties: truck.* codes
-- ---------------------------------------------------------------------
create policy transport_company_read on public.transport_companies
  for select using (public.has_permission('truck.read'));
create policy transport_company_insert on public.transport_companies
  for insert with check (public.has_permission('truck.create'));
create policy transport_company_update on public.transport_companies
  for update using (public.has_permission('truck.update'));

create policy driver_read on public.drivers
  for select using (public.has_permission('truck.read'));
create policy driver_insert on public.drivers
  for insert with check (public.has_permission('truck.create'));
create policy driver_update on public.drivers
  for update using (public.has_permission('truck.update'));

create policy truck_read on public.trucks
  for select using (public.has_permission('truck.read'));
create policy truck_insert on public.trucks
  for insert with check (public.has_permission('truck.create'));
create policy truck_update on public.trucks
  for update using (public.has_permission('truck.update'));

create policy party_read on public.parties
  for select using (public.has_permission('truck.read'));
create policy party_insert on public.parties
  for insert with check (public.has_permission('truck.create'));
create policy party_update on public.parties
  for update using (public.has_permission('truck.update'));

-- ---------------------------------------------------------------------
-- Cargo: cargo.* codes
-- ---------------------------------------------------------------------
create policy cargo_manifest_read on public.cargo_manifests
  for select using (public.has_permission('cargo.read'));
create policy cargo_manifest_insert on public.cargo_manifests
  for insert with check (public.has_permission('cargo.create'));
create policy cargo_manifest_update on public.cargo_manifests
  for update using (public.has_permission('cargo.update'));

create policy cargo_item_read on public.cargo_items
  for select using (public.has_permission('cargo.read'));
create policy cargo_item_insert on public.cargo_items
  for insert with check (public.has_permission('cargo.create'));
create policy cargo_item_update on public.cargo_items
  for update using (public.has_permission('cargo.update'));

-- item_lots: matrix (canonical) — see header TENSION note re ME-14.
create policy item_lot_read on public.item_lots
  for select using (public.has_permission('cargo.read'));
create policy item_lot_insert on public.item_lots
  for insert with check (public.has_permission('cargo.update'));
create policy item_lot_update on public.item_lots
  for update using (public.has_permission('cargo.update'))
             with check (public.has_permission('cargo.update'));

-- ---------------------------------------------------------------------
-- Movement spine: append-only. SELECT per matrix; INSERT via the kind ->
-- permission map; NO UPDATE/DELETE policies anywhere (movements and
-- movement_items are immutable by construction).
-- ---------------------------------------------------------------------
create policy movement_select on public.movements
  for select using (
    public.has_permission('cargo.read')
    or public.has_permission('scanner.create')
    or public.has_permission('scale.create')
    or public.has_permission('quarantine.read')
    or public.has_permission('seizure.read'));
create policy movement_insert on public.movements
  for insert with check (public.movement_kind_permitted(kind));

create policy movement_item_select on public.movement_items
  for select using (
    public.has_permission('cargo.read')
    or public.has_permission('scanner.create')
    or public.has_permission('scale.create')
    or public.has_permission('quarantine.read')
    or public.has_permission('seizure.read'));
-- mirrors the movement kind map: the item inherits its parent movement's kind
create policy movement_item_insert on public.movement_items
  for insert with check (
    exists (select 1 from public.movements m
            where m.id = movement_items.movement_id
              and public.movement_kind_permitted(m.kind)));

-- ---------------------------------------------------------------------
-- Specialized operations (ADR 0011): append-only history; holds are never
-- deleted and their status is updated ONLY by the server-side resolution
-- flow (security-definer engine path), so no UPDATE/DELETE policies exist.
-- ---------------------------------------------------------------------
create policy scanner_op_read on public.scanner_operations
  for select using (public.has_permission('scanner.read'));
create policy scanner_op_insert on public.scanner_operations
  for insert with check (public.has_permission('scanner.create'));

create policy scale_op_read on public.scale_operations
  for select using (public.has_permission('scale.read'));
create policy scale_op_insert on public.scale_operations
  for insert with check (public.has_permission('scale.create'));

create policy quarantine_op_read on public.quarantine_operations
  for select using (public.has_permission('quarantine.read'));
create policy quarantine_op_insert on public.quarantine_operations
  for insert with check (public.has_permission('quarantine.create'));

create policy seizure_op_read on public.seizure_operations
  for select using (public.has_permission('seizure.read'));
create policy seizure_op_insert on public.seizure_operations
  for insert with check (public.has_permission('seizure.create'));

-- ---------------------------------------------------------------------
-- Attachments (rls.md matrix): read = any read of the owner entity;
-- insert = the owner entity's create permission.
-- TODO DECISION: the matrix does NOT pin a per-entity_type permission
-- mapping; the union below maps each documented entity_type
-- (cargo_manifest|cargo_item|item_lot|quarantine_operation|
--  seizure_operation|movement) to its catalog create code, with
-- warehouse.configure standing in for warehouse-owned targets. Validate
-- against the service layer when attachments flows are implemented.
-- ---------------------------------------------------------------------
create policy attachment_select on public.attachments
  for select using (
    public.has_permission('cargo.read')
    or public.has_permission('truck.read')
    or public.has_permission('warehouse.read'));
create policy attachment_insert on public.attachments
  for insert with check (
    public.has_permission('cargo.create')
    or public.has_permission('truck.create')
    or public.has_permission('quarantine.create')
    or public.has_permission('seizure.create')
    or public.has_permission('warehouse.configure'));

-- ---------------------------------------------------------------------
-- audit_log (ADR 0014): SELECT via audit.read (admin + auditor);
-- INSERT is trigger/engine-only — NO insert policy exists, so clients are
-- denied by default; UPDATE/DELETE policies do not exist (append-only).
-- ---------------------------------------------------------------------
create policy audit_log_select on public.audit_log
  for select using (public.has_permission('audit.read'));