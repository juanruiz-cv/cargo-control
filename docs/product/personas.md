# Personas — Cargo Control

Operational personas of the facility. Internal users authenticate in the app;
external actors interact with the system only through operators.

| # | Persona            | Organization      | Goals                                                                 | Pain points                        | Permissions (role)      |
| - | ------------------ | ----------------- | --------------------------------------------------------------------- | ---------------------------------- | ----------------------- |
| 1 | **Operador de playón** | Internal (guard) | Receive trucks at the yard, record arrival, guide to unloading point   | Paper slips, unclear queue          | `guard` (reduced)       |
| 2 | **Operador scanner**  | Internal (guard) | Scan merchandise quickly, verify identity vs manifest                   | Slow scans, duplicate codes         | `guard`                 |
| 3 | **Operador balanza**  | Internal (operator) | Weigh items, catch tolerance breaches                                  | Manual weight logs                  | `operator`              |
| 4 | **Supervisor**     | Internal          | Decide quarantine/rezago and seizure cases, oversee operations         | No consolidated view of holds       | `supervisor`            |
| 5 | **Administrador**  | Internal          | Manage users, roles, permissions, catalogs and zones                   | Permission sprawl                   | `admin`                 |
| 6 | **Auditor**        | Internal          | Verify traceability end-to-end; read-only evidence                     | Tampered or missing history         | `auditor`               |
| 7 | **Conductor**      | External          | Deliver goods, wait minimal time, know when truck can leave            | Long waits, unclear discharge status| none (operators input)  |
| 8 | **Empresa de transporte** | External    | Fulfill pickups/drop-offs; receive manifests                           | Claim disputes                     | none (operators input)  |

## Detail (internal, core)

### Operador de playón
- **Context:** first point of contact. Registers truck plate, driver, carrier
  company, and cargo manifest at arrival.
- **Goals:** fast check-in; unambiguous cargo identity → unique cargo code.
- **Frustrations:** illegible manifests, driver waiting at wrong bay.

### Operador scanner
- **Context:** scans travel scans the meter of items at checkpoints.
- **Goals:** scan items quickly, get instant confirmation, flag mismatches.
- **Frustrations:** barcodes damaged → manual entry fallback needed.

### Operador balanza
- **Context:** weighs items on arrival and after discharge.
- **Goals:** record gross/tare/net accurately; auto-alert on tolerance breach.
- **Frustrations:** manual transcription errors.

### Supervisor
- **Context:** responsible for holds: **rezago** (leftover/backlog goods,
  warning) and **secuestro** (seized goods, blocked).
- **Goals:** open/resolve cases with evidence; guarantee frozen lots cannot move.
- **Frustrations:** no single list of open cases across zones.

### Administrador
- **Context:** configurator of the system.
- **Goals:** invite users, assign roles, manage locations/catalogs; every
  change auditable.
- **Frustrations:** rigid roles that force reconfig.

### Auditor
- **Context:** post-hoc verification.
- **Goals:** full read-only history: who, what, when, where, why for any lot.
- **Frustrations:** silent corrections or deleted events.

## Conventions

- External actors (conductor, carrier) are **not** app users. Operators record
  their data at arrival (driver registry, carrier party).
- A driver appears in the driver registry (catalog), reusable across trucks.