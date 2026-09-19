# RLS Permission Matrix — Cargo Control

RLS is enabled on every business table. Policy type per role — `Y` allows the
operation, `-` denies. **Default deny**: anything not listed is denied.
Table names follow the Fase 3 schema (rename map: `docs/architecture/database.md` §7).

## Roles

- `admin` — full CRUD incl. settings, user management and floor plan editor
- `supervisor` — operational + quarantine/seizure decisions
- `operator` — cargo manifests, lots, locations, movements
- `guard` — scanner/scale operations only
- `auditor` — read-only audit and reports

## Matrix (reads)

| Table                          | admin | supervisor | operator | guard | auditor |
| ------------------------------ | :---: | :--------: | :------: | :---: | :-----: |
| organizations                  | Y     | Y          | Y        | Y     | Y       |
| facilities                     | Y     | Y          | Y        | Y     | Y       |
| locations                      | Y     | Y          | Y        | Y     | Y       |
| layouts, layout_elements       | Y     | Y          | Y        | Y     | Y       |
| users                          | Y     | –          | –        | –     | –       |
| roles, permissions, user_roles, role_permissions | Y | –    | –        | –     | –       |
| parties                        | Y     | Y          | Y        | Y     | Y       |
| transport_companies            | Y     | Y          | Y        | Y     | Y       |
| drivers                        | Y     | Y          | Y        | Y     | Y       |
| trucks                         | Y     | Y          | Y        | Y     | Y       |
| cargo_manifests                | Y     | Y          | Y        | Y     | Y       |
| cargo_items                    | Y     | Y          | Y        | Y     | Y       |
| item_lots                      | Y     | Y          | Y        | Y     | Y       |
| movements, movement_items      | Y     | Y          | Y        | Y     | Y       |
| scanner_operations             | Y     | Y          | Y        | Y     | Y       |
| scale_operations               | Y     | Y          | Y        | Y     | Y       |
| quarantine_operations          | Y     | Y          | Y        | –     | Y       |
| seizure_operations             | Y     | Y          | Y        | –     | Y       |
| attachments                    | Y     | Y          | Y        | Y     | Y       |
| audit_log                      | Y     | –          | –        | –     | Y       |

## Matrix (writes)

| Operation                            | admin | supervisor | operator | guard |
| ------------------------------------ | :---: | :--------: | :------: | :---: |
| users / settings / RBAC              | Y     | –          | –        | –     |
| facilities                           | Y     | Y          | –        | –     |
| parties, transport_companies, trucks, locations, drivers | Y | Y | Y | – |
| layouts, layout_elements (editor)    | Y     | Y          | –        | –     |
| cargo_manifests, cargo_items, item_lots | Y  | Y          | Y        | –     |
| movements (append)                   | Y     | Y          | Y        | Y     |
| movement_items (append)              | Y     | Y          | Y        | Y     |
| scanner_operations, scale_operations (append) | Y | Y | Y | Y |
| quarantine open/resolve              | Y     | Y          | –        | –     |
| seizure open/resolve                 | Y     | Y          | –        | –     |
| attachments (upload)                 | Y     | Y          | Y        | –     |
| audit_log                            | –     | –          | –        | –     (trigger-only, append)

## Policy rules

- Every policy filters by `org_id` of the acting operator.
- Event log: INSERT only, no UPDATE/DELETE policies (append-only).
- Guard cannot read quarantine/seizure detail or audit; appends scanner/scale
  operations only (was `checkpoint_events` in Fase 0–2).
- Auditor is strictly read-only.
- Triggers enforce that sensitive transitions require `reason` and valid source
  states, independent of RLS.
- Floor plan editor (`layouts`, `layout_elements`) is a planning tool: writes
  are admin/supervisor-only; operator and guard read the published map.
- `attachments` rows are readable in the table via signed Storage URLs only;
  direct reads follow the matrix.

Referenced by `SECURITY.md`; changes require the RLS review checklist.