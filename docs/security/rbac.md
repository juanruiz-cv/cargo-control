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

## Fase 7 trucks module — no RBAC change (ASSERTED)

The CAMIONES module (Fase 7, ADR 0008) uses the existing `truck.*`
permissions from the catalog above: `truck.read` (list/details),
`truck.create` (create dialog), `truck.update` (edit dialog),
`truck.exit` (egress action). **No new permission codes** — the 13 display
states are a UX projection, not an authorization axis.

## Fase 8 cargo module — no RBAC change (ASSERTED)

The CARGAMENTOS module (Fase 8, ADR 0009) uses the existing `cargo.*`
permissions: `cargo.read` (list/details/timeline), `cargo.create` (new
manifest/item), `cargo.update` (edit + split), `cargo.transfer`
(transfer). **No new permission codes** — `category` is a display label,
not an authorization axis.

## Fase 9 movement engine — no RBAC change (ASSERTED)

The MOTOR DE MOVIMIENTOS (Fase 9, ADR 0010) reuses the kind → permission
map verbatim: every new engine operation is gated by the existing code
for its kind (split → `cargo.update`, transfer/return_to_truck →
`cargo.transfer`, scan → `scanner.create`, weigh → `scale.create`, holds
→ `quarantine.create`/`seizure.create`, egreso → `truck.exit`).
**No new permission codes** — `operation_key` is engine data, not an
authorization axis.

## Fase 10 special operational areas — no RBAC change (ASSERTED)

The SCANNER/BALANZA/REZAGO/SECUESTRO areas (Fase 10, ADR 0011) use the
existing catalog: `scanner.read/create`, `scale.read/create`,
`quarantine.read/create`, `seizure.read/create`; hold resolution remains
a server-side supervisor flow (no new codes). Derived queues and
history are read projections of the same permissions. **No new
permission codes.**

## Fase 11 operational map — no RBAC change (ASSERTED)

The MAPA OPERATIVO (Fase 11, ADR 0012) composes existing read
permissions: map read = `warehouse.read` (facilities, locations,
layouts); truck detail = `truck.read` (+`cargo.read` for merchandise);
sector/galpón panels = `cargo.read` (+`warehouse.read`); special-area
panels = `scanner.read`/`scale.read`/`quarantine.read`/`seizure.read`.
Actions in panels use the same kind→permission map as the module routes
(Fase 9) — e.g. egreso requires `truck.exit`, scan requires
`scanner.create`, hold requires `quarantine.create`/`seizure.create`.
The `maintenance` flag is data, not an authorization axis (maintenance
entry is an admin-write flow on `locations`). **No new permission
codes.**

## Fase 12 operational dashboard — no RBAC change (ASSERTED)

The DASHBOARD (Fase 12, ADR 0013) reuses the existing catalog for every
card: `warehouse.read` (facilities/locations/layouts), `truck.read` +
`cargo.read` (camiones/mercadería), `scanner.read`/`scale.read`
(queues), `quarantine.read`/`seizure.read` (holds). Cards hidden when
the caller lacks the module's read code; chart series come from the
same read-permissioned views. **No new permission codes.**

## Fase 13 audit system — no RBAC change (ASSERTED)

The AUDITORÍA screen (Fase 13, ADR 0014) uses the existing
`audit.read` (admin + auditor) with read-only rendering; normal
operators/viewers never see or touch the audit UI. The action catalog
is data naming (entity.verb codes), not permission codes. **No new
permission codes.**

## Fase 14 layout versioning — no RBAC change (ASSERTED)

The floor plan versioning (Fase 14, ADR 0015) reuses `warehouse.read`
for viewing/compare and `warehouse.configure` (admin + supervisor) for
create/publish/restore/edit. Version metadata columns are data, not
permission codes; `layout.create/publish/restore` are audit action
names, not RBAC codes. **No new permission codes.**

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