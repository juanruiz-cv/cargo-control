# RLS Policy Matrix — Cargo Control (Fase 6 / Prompt 07)

RLS is enabled on every business table. **Default deny**: anything not listed
is denied. Policies evaluate **permission codes** through
`public.has_permission(code)` (and `has_role` for tenant tables), never a
hardcoded role list per table and never a client flag. Grant changes are data
(`role_permissions` seeds), not policy edits.

Helpers: `docs/security/authorization.md`. Catalog & matrix:
`docs/security/rbac.md`.

## Policy shape

```sql
-- read: any grant that includes the read code
create policy location_read on public.locations
  for select using (public.has_permission('warehouse.read'));

-- write: configure gates layout/capacity edits (floor plan editor, Fase 5)
create policy location_configure on public.locations
  for insert with check (public.has_permission('warehouse.configure'));
create policy location_configure_upd on public.locations
  for update using (public.has_permission('warehouse.configure'))
             with check (public.has_permission('warehouse.configure'));

-- tenant-level row (own org) readable by any authenticated profile of it
create policy org_profile_read on public.organizations
  for select using (
    exists (select 1 from public.users u
            where u.auth_user_id = auth.uid()
              and u.organization_id = public.organizations.id));
create policy org_admin_write on public.organizations
  for update using (public.has_role('admin'));
```

## Matrix

`S` = SELECT · `I` = INSERT · `U` = UPDATE · `D` = DELETE
— every cell is a `has_permission(...)` gate unless noted.

| Table | SELECT | INSERT | UPDATE | DELETE |
| ----- | ------ | ------ | ------ | ------ |
| organizations | own org profile (any auth) | has_role('admin') | has_role('admin') | – |
| facilities | warehouse.read | warehouse.configure | warehouse.configure | – |
| locations | warehouse.read | warehouse.configure | warehouse.configure | – |
| layouts | warehouse.read | warehouse.configure | warehouse.configure | – |
| layout_elements | warehouse.read | warehouse.configure | warehouse.configure | – |
| users | has_role('admin') (profile rows) | has_role('admin') | has_role('admin') (not self-editable by target) | – |
| roles | has_role('admin') | has_role('admin') | has_role('admin') | – |
| permissions | has_role('admin') | has_role('admin') | has_role('admin') | – |
| user_roles | has_role('admin') | has_role('admin') | has_role('admin') | – |
| role_permissions | has_role('admin') | has_role('admin') | has_role('admin') | – |
| parties | truck.read | truck.create | truck.update | – |
| transport_companies | truck.read | truck.create | truck.update | – |
| drivers | truck.read | truck.create | truck.update | – |
| trucks | truck.read | truck.create | truck.update | – |
| cargo_manifests | cargo.read | cargo.create | cargo.update | – |
| cargo_items | cargo.read | cargo.create | cargo.update | – |
| item_lots | cargo.read | cargo.update (via movements — see §Spine) | cargo.update (placement changes) | – |
| movements | (any of cargo.read / scanner.create / scale.create / quarantine.read / seizure.read) | kind → permission map (§Authorization) | **— append-only** | **—** |
| movement_items | same as movements | mirrors movement kind map | **— append-only** | **—** |
| scanner_operations | scanner.read | scanner.create | – | – |
| scale_operations | scale.read | scale.create | – | – |
| quarantine_operations | quarantine.read | quarantine.create | – | – |
| seizure_operations | seizure.read | seizure.create | – | – |
| attachments | any read of owner entity (cargo.read / truck.read / warehouse.read) | owner entity create permission | – | – |
| audit_log | audit.read | **trigger-only** (no client policy) | **—** | **—** |
| location_occupancy (view) | security_invoker → base tables | — | — | — |

Notes:
- **Soft lifecycle:** no DELETE policies anywhere — catalogs deactivate
  (`status`/`active`), business records close, the spine never mutates (D6).
- **Movement spine:** the INSERT policy for `movements` and `movement_items`
  is one comprehensive `with check` that branches on `kind` (documented in
  `docs/security/authorization.md` §3). UPDATE/DELETE policies do not exist.
- **Read context for stations:** scanner/scale operators read `cargo.*` and
  `truck.*` rows (matrix above) so the station can display context, but write
  only their event types.
- **Auditor/Viewer:** read-only by construction — no insert/update codes are
  granted in `rbac.md` §3.
- **Views:** created with `security_invoker = true` so base policies apply
  (`location_occupancy`, future read models).

## Fase 7 trucks module — no policy change (ASSERTED)

The CAMIONES module (Fase 7, ADR 0008) reuses the existing `truck.*`
permissions and policies verbatim: `trucks` row policy remains
`truck.read | truck.create | truck.update` (matrix above), exit remains the
`egress` movement gated by kind → `truck.exit` (authorization map).
**No policy edits or new codes**; display states are derived read-side and
carry no RLS meaning.

## Fase 8 cargo module — no policy change (ASSERTED)

The CARGAMENTOS module (Fase 8, ADR 0009) reuses the existing `cargo.*`
permissions and policies verbatim: `cargo_manifests`/`cargo_items`/
`item_lots` keep their matrix rows (`cargo.read | cargo.create |
cargo.update`, item_lots `cargo.read` + placement writes via movements);
split → `cargo.update`, transfer → `cargo.transfer` (authorization map).
**No policy edits or new codes**; `currentLocation` is a read-side rollup
of `item_lots` and carries no RLS meaning.

## Fase 9 movement engine — no policy change (ASSERTED)

The MOTOR DE MOVIMIENTOS (Fase 9, ADR 0010) formalizes a transactional
protocol over the existing append-only spine; it introduces no new
permission codes and no policy edits: `movements`/`movement_items` keep
their existing RLS (insert via engine, read for `cargo.read`, strict
append-only — no UPDATE/DELETE grants), and the new `return_to_truck`
kind maps to the existing `cargo.transfer` permission. Timeline reads use
existing row policies; movements are never directly writable by the
client. `operation_key` is a data column, not an authorization axis.
**No policy edits or new codes.**

## Fase 10 special operational areas — no policy change (ASSERTED)

The SCANNER/BALANZA/REZAGO/SECUESTRO areas (Fase 10, ADR 0011) reuse the
existing `scanner.*`, `scale.*`, `quarantine.*`, `seizure.*` permissions
and row policies verbatim: `scanner_operations`, `scale_operations`
remain append-only (no UPDATE/DELETE grants); `quarantine_operations`/
`seizure_operations` cases are never deleted, resolution is server-side
(`release` via the Fase 9 engine) and only updates case status.
Derived views (`station_queue`, `hold_open`) are read-only through
existing policies. **No policy edits or new codes.**

## Fase 11 operational map — no policy change (ASSERTED)

The MAPA OPERATIVO (Fase 11, ADR 0012) is a read projection of the
published layout plus occupancy/trucks/holds; it adds only the data
flag `locations.maintenance` (schema v7), an operational field with no
RLS meaning. Map read = existing `warehouse.read` on
facilities/locations/layouts; detail panels reuse the module read
permissions they belong to (`truck.read`, `cargo.read`, `scanner.read`,
`scale.read`, `quarantine.read`, `seizure.read`). Visual states are
derived read-side and carry no RLS meaning. **No policy edits or new
codes.**

## Fase 12 operational dashboard — no policy change (ASSERTED)

The DASHBOARD (Fase 12, ADR 0013) is a read-only aggregation layer:
derived dashboard views (schema v8) expose aggregated rows only and are
filtered through existing row policies — the client never receives raw
movement history for statistics. Dashboard read reuses the module read
codes (`warehouse.read`, `truck.read`, `cargo.read`, `scanner.read`,
`scale.read`, `quarantine.read`, `seizure.read`); a card the user cannot
read is hidden, never served as a partial mix. Append-only doctrine
unchanged (movements/movement_items still have no UPDATE/DELETE
grants). **No policy edits or new codes.**

## Isolation guarantees

1. Cross-org: `has_permission` binds to the caller's own `organization_id`;
   a row from another org never satisfies a policy (no `org_id` in the client
   query can override it).
2. Disabled profile: helpers check `users.status = 'active'` → zero grants.
3. Grant change ≠ policy change: `role_permissions` rows are data; RLS picks
   them up immediately.
4. Bypass: no `bypassrls` role for the data API; service-key functions run
   with explicit `security definer` intent only (audit, capacity triggers).

## Files

- Decision: `docs/adr/0007-identity-access-supabase-auth.md`
- Roles & catalog: `docs/security/rbac.md`
- Enforcement: `docs/security/authorization.md`
- Tests: `docs/qa/security-tests.md`