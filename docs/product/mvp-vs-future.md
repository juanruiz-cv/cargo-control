# MVP vs Future — Cargo Control

## MVP (P0)

The core operational loop must work end-to-end with full traceability:

- Arrival registration (truck, driver, carrier, manifest with items & quantities)
- Playón / control and total/partial discharge (remnant `on_truck`)
- Storage: item splitting into lots and lot transfers
- Scanner and scale checkpoints with tolerance alerts
- Rezago (hold/warning) and Secuestro (seizure/blocked) open + resolve
- Movement trail (immutable events) and corrections
- Users, roles, permissions, audit log
- Working read of the RLS matrix (org-scoped)

## Out of MVP (P1)

- KPIs dashboard, exportable reports
- Chained-split UX polish, scan mismatch alerts, evidence attachments
- Truck capacity/load planning

## Future features (P2)

- Route planning / geofencing
- Billing and invoicing
- Consumer-facing tracking portal
- Dark mode (token roles, not raw palette)
- Georeferenced playón maps and facility visualization

## Build order (suggested)

1. Domain base: arrivals, discharge, splitting, lots (E1, E2, E3)
2. Checkpoints: scanner + scale (E4, E5)
3. Holds: rezago + secuestro (E6, E7)
4. Traceability & corrections (E8)
5. Identity: users/roles/audit (E9)
6. Reports/dashboard (E10, P1)