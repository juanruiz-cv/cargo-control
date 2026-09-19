# RBAC — Roles, Permissions, Seeds (Fase 6 / Prompt 07)

The authorization model: role codes (DB), permission codes, the
role → permission matrix, and the seed data. Enforcement mechanics live in
`docs/security/authorization.md`; per-table policies in `docs/security/rls.md`.

## 1. Roles

Schema codes are **lowercase**; UI labels are uppercase. The Fase 3
`guard` role is retired and split.

| Code (DB) | Label (UI) | Replaces (Fase 3) | Description |
| --------- | ---------- | ----------------- | ----------- |
| `admin` | ADMIN | `admin` | full access incl. RBAC provisioning |
| `supervisor` | SUPERVISOR | `supervisor` | operational control (truck exit, holds, transfer authorizations) |
| `operator` | OPERATOR | `operator` | cargo/warehouse operations (no config, no exit) |
| `scanner_operator` | SCANNER_OPERATOR | `guard` (scanner half) | scanner station: reads context, creates scan events |
| `scale_operator` | SCALE_OPERATOR | `guard` (scale half) | scale station: reads context, creates weigh events |
| `auditor` | AUDITOR | `auditor` | read-only incl. `audit_log` |
| `viewer` | VIEWER | **new** | read-only operational picture (no audit) |

## 2. Permission catalog (20 codes)

| Code | Scope |
| ---- | ----- |
| `truck.read` / `truck.create` / `truck.update` / `truck.exit` | fleet & counterparty catalogs; exit = authorize egress |
| `cargo.read` / `cargo.create` / `cargo.update` / `cargo.transfer` | manifests, items, lots; transfer = move between places |
| `warehouse.read` / `warehouse.configure` / `warehouse.transfer` | facilities, locations, layouts; config = layout/capacity edits |
| `scanner.read` / `scanner.create` | scanner station reads + scan events |
| `scale.read` / `scale.create` | scale station reads + weigh events |
| `quarantine.read` / `quarantine.create` | rezago cases (open; resolve = server-side flow) |
| `seizure.read` / `seizure.create` | secuestro cases (open; resolve = server-side flow) |
| `audit.read` | `audit_log` (read-only) |

The catalog is a floor: extensions (e.g. `quarantine.resolve`) are additive
seed rows with their own RLS gates; they never reuse client flags.

## 3. Role → permission matrix

| Permission | admin | supervisor | operator | scanner_op | scale_op | auditor | viewer |
| ---------- | :---: | :--------: | :------: | :--------: | :------: | :-----: | :----: |
| truck.read | Y | Y | Y | Y | Y | Y | Y |
| truck.create | Y | Y | Y | – | – | – | – |
| truck.update | Y | Y | Y | – | – | – | – |
| truck.exit | Y | Y | – | – | – | – | – |
| cargo.read | Y | Y | Y | Y | Y | Y | Y |
| cargo.create | Y | Y | Y | – | – | – | – |
| cargo.update | Y | Y | Y | – | – | – | – |
| cargo.transfer | Y | Y | Y | – | – | – | – |
| warehouse.read | Y | Y | Y | Y | Y | Y | Y |
| warehouse.configure | Y | Y | – | – | – | – | – |
| warehouse.transfer | Y | Y | Y | – | – | – | – |
| scanner.read | Y | Y | Y | Y | Y | Y | Y |
| scanner.create | Y | Y | – | Y | – | – | – |
| scale.read | Y | Y | Y | Y | Y | Y | Y |
| scale.create | Y | Y | – | – | Y | – | – |
| quarantine.read | Y | Y | Y | – | – | Y | Y |
| quarantine.create | Y | Y | – | – | – | – | – |
| seizure.read | Y | Y | Y | – | – | Y | Y |
| seizure.create | Y | Y | – | – | – | – | – |
| audit.read | Y | – | – | – | – | Y | – |

Notes:
- Hold **resolution** (quarantine/seizure) requires `supervisor` + server-side
  validation (operation is a movement `release` gated via the originating
  hold's create permission and `has_role('supervisor')` in the function).
- `truck.exit` is the egress control point: `admin`/`supervisor` only.

## 4. Seeds

```sql
-- roles (code matches schema convention)
insert into public.roles (code, name) values
 ('admin', 'ADMIN'), ('supervisor', 'SUPERVISOR'),
 ('operator', 'OPERATOR'), ('scanner_operator', 'SCANNER_OPERATOR'),
 ('scale_operator', 'SCALE_OPERATOR'), ('auditor', 'AUDITOR'),
 ('viewer', 'VIEWER');

-- permissions (the catalog)
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
```

The `role_permissions` seed mirrors the matrix above (admin → all 20, etc.)
and lives as data — policy code never enumerates roles except `has_role`
for tenant tables.

## Files

- Decision: `docs/adr/0007-identity-access-supabase-auth.md`
- Auth flows: `docs/security/authentication.md`
- Enforcement: `docs/security/authorization.md`
- Policies: `docs/security/rls.md`
- Schema (§4.4 seeds): `docs/architecture/database.md`