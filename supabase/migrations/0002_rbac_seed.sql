-- =====================================================================
-- Cargo Control — 0002_rbac_seed.sql
-- =====================================================================
-- RBAC seed data — the DOCUMENTED catalog, not demo data:
--   * 7 role codes             (docs/security/rbac.md §1)
--   * 20-permission catalog    (docs/security/rbac.md §2)
--   * role_permissions matrix  (docs/security/rbac.md §3)
-- Grant changes are DATA (role_permissions rows), never policy edits
-- (ADR 0007/§2, rls.md). RLS evaluates through has_permission()/has_role()
-- (0003_authorization_helpers.sql).
--
-- No organizations/facilities/locations/trucks/cargo seeds exist here:
-- the docs define NO demo data, and the repository doctrine forbids
-- fictional seeds that could be confused with production data
-- (docs/domain/business-rules.md §9). Org provisioning is the admin
-- invite flow (docs/security/authentication.md); a future demo channel
-- must be a SEPARATE, clearly-labelled `-- DEMO ONLY` migration.
-- =====================================================================

-- Roles (code matches schema convention; UI labels uppercase)
insert into public.roles (code, name) values
 ('admin', 'ADMIN'), ('supervisor', 'SUPERVISOR'),
 ('operator', 'OPERATOR'), ('scanner_operator', 'SCANNER_OPERATOR'),
 ('scale_operator', 'SCALE_OPERATOR'), ('auditor', 'AUDITOR'),
 ('viewer', 'VIEWER');

-- Permissions (the 20-code catalog)
insert into public.permissions (code, name) values
 ('truck.read','Read fleet'), ('truck.create','Create truck/party/driver'),
 ('truck.update','Update fleet catalog'), ('truck.exit','Authorize truck egress'),
 ('cargo.read','Read cargo data'), ('cargo.create','Register cargo'),
 ('cargo.update','Update cargo/lots'), ('cargo.transfer','Transfer cargo between places'),
 ('warehouse.read','Read warehouse data'), ('warehouse.configure','Configure warehouse/layouts'),
 ('warehouse.transfer','Move stock within warehouse'),
 ('scanner.read','Read scanner data'), ('scanner.create','Create scan events'),
 ('scale.read','Read scale data'), ('scale.create','Create weigh events'),
 ('quarantine.read','Read rezago cases'), ('quarantine.create','Open rezago case'),
 ('seizure.read','Read secuestro cases'), ('seizure.create','Open secuestro case'),
 ('audit.read','Read audit log');

-- role_permissions matrix seed — mirrors rbac.md §3 exactly (Y cells).
-- Admin -> all 20 codes; supervisor -> 19 (no audit.read);
-- operator -> 13; scanner_operator / scale_operator -> 5 each;
-- auditor -> 8; viewer -> 7. Total 77 matrix rows.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where (r.code, p.code) in (
  ('admin','truck.read'), ('admin','truck.create'), ('admin','truck.update'),
  ('admin','truck.exit'), ('admin','cargo.read'), ('admin','cargo.create'),
  ('admin','cargo.update'), ('admin','cargo.transfer'),
  ('admin','warehouse.read'), ('admin','warehouse.configure'),
  ('admin','warehouse.transfer'), ('admin','scanner.read'),
  ('admin','scanner.create'), ('admin','scale.read'), ('admin','scale.create'),
  ('admin','quarantine.read'), ('admin','quarantine.create'),
  ('admin','seizure.read'), ('admin','seizure.create'), ('admin','audit.read'),

  ('supervisor','truck.read'), ('supervisor','truck.create'),
  ('supervisor','truck.update'), ('supervisor','truck.exit'),
  ('supervisor','cargo.read'), ('supervisor','cargo.create'),
  ('supervisor','cargo.update'), ('supervisor','cargo.transfer'),
  ('supervisor','warehouse.read'), ('supervisor','warehouse.configure'),
  ('supervisor','warehouse.transfer'), ('supervisor','scanner.read'),
  ('supervisor','scanner.create'), ('supervisor','scale.read'),
  ('supervisor','scale.create'), ('supervisor','quarantine.read'),
  ('supervisor','quarantine.create'), ('supervisor','seizure.read'),
  ('supervisor','seizure.create'),

  ('operator','truck.read'), ('operator','truck.create'),
  ('operator','truck.update'), ('operator','cargo.read'),
  ('operator','cargo.create'), ('operator','cargo.update'),
  ('operator','cargo.transfer'), ('operator','warehouse.read'),
  ('operator','warehouse.transfer'), ('operator','scanner.read'),
  ('operator','scale.read'), ('operator','quarantine.read'),
  ('operator','seizure.read'),

  ('scanner_operator','truck.read'), ('scanner_operator','cargo.read'),
  ('scanner_operator','warehouse.read'), ('scanner_operator','scanner.read'),
  ('scanner_operator','scanner.create'),

  ('scale_operator','truck.read'), ('scale_operator','cargo.read'),
  ('scale_operator','warehouse.read'), ('scale_operator','scale.read'),
  ('scale_operator','scale.create'),

  ('auditor','truck.read'), ('auditor','cargo.read'),
  ('auditor','warehouse.read'), ('auditor','scanner.read'),
  ('auditor','scale.read'), ('auditor','quarantine.read'),
  ('auditor','seizure.read'), ('auditor','audit.read'),

  ('viewer','truck.read'), ('viewer','cargo.read'),
  ('viewer','warehouse.read'), ('viewer','scanner.read'),
  ('viewer','scale.read'), ('viewer','quarantine.read'),
  ('viewer','seizure.read')
);

-- Notes (rbac.md §3):
--   * Hold RESOLUTION (quarantine/seizure) requires supervisor + server-side
--     validation: the operation is a movement of kind 'release', gated via
--     the originating hold's create permission AND has_role('supervisor')
--     checked in the Edge Function — no extra code exists for it.
--   * truck.exit (egress) is admin/supervisor only.
--   * qa docs movement-engine-tests ME-33 and cargo-module-tests M-46 claim
--     operator is DENIED cargo.transfer; rbac.md §3 (canonical) grants it
--     (see contradiction #1 resolution in 0004_rls.sql).