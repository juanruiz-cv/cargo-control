# RLS Permission Matrix — Cargo Control

RLS is enabled on every business table. Policy type per role — `Y` allows the
operation, `-` denies. **Default deny**: anything not listed is denied.

## Roles

- `admin` — full CRUD incl. settings and user management
- `supervisor` — operational + quarantine/seizure decisions
- `operator` — cargo, units, locations, movements
- `guard` — scanner/scale checkpoint events only
- `auditor` — read-only audit and reports

## Matrix (reads)

| Table               | admin | supervisor | operator | guard | auditor |
| ------------------- | :---: | :--------: | :------: | :---: | :-----: |
| orgs                | Y     | Y          | Y        | Y     | Y       |
| operators           | Y     | –          | –        | –     | –       |
| parties             | Y     | Y          | Y        | Y     | Y       |
| drivers             | Y     | Y          | Y        | Y     | Y       |
| trucks              | Y     | Y          | Y        | Y     | Y       |
| cargo               | Y     | Y          | Y        | Y     | Y       |
| cargo_items         | Y     | Y          | Y        | Y     | Y       |
| item_lots           | Y     | Y          | Y        | Y     | Y       |
| warehouse_locations| Y     | Y          | Y        | Y     | Y       |
| checkpoint_events   | Y     | Y          | Y        | Y     | Y       |
| scale_readings      | Y     | Y          | Y        | Y     | Y       |
| quarantine_cases    | Y     | Y          | Y        | –     | Y       |
| seizure_records     | Y     | Y          | Y        | –     | Y       |
| documents           | Y     | Y          | Y        | Y     | Y       |
| audit_log           | Y     | –          | –        | –     | Y       |

## Matrix (writes)

| Operation                    | admin | supervisor | operator | guard |
| ---------------------------- | :---: | :--------: | :------: | :---: |
| operators / settings          | Y     | –          | –        | –     |
| parties, trucks, locations, drivers | Y     | Y          | Y        | –     |
| cargo, cargo_items, item_lots       | Y     | Y          | Y        | –     |
| checkpoint_events (append)    | Y     | Y          | Y        | Y     |
| quarantine resolve            | Y     | Y          | –        | –     |
| seizure open/resolve          | Y     | Y          | –        | –     |
| audit_log                     | –     | –          | –        | –     (trigger-only, append)

## Policy rules

- Every policy filters by `org_id` of the acting operator.
- Event log: INSERT only, no UPDATE/DELETE policies (append-only).
- Guard cannot read quarantine/seizure detail or audit; writes events only.
- Auditor is strictly read-only.
- Triggers enforce that sensitive transitions require `reason` and valid source
  states, independent of RLS.

Referenced by `SECURITY.md`; changes require the RLS review checklist.