# Cargo Module — UX Specification (Fase 8)

User-facing behavior of the cargo (CARGAMENTOS Y MERCADERÍA) module.
Architecture and data model: `docs/architecture/database.md` §4.6,
`docs/domain/entities.md` (Cargo); divisibility and traceability rules:
`docs/adr/0009-cargo-module-divisible-merchandise.md`, `docs/adr/0003-item-lot-quantity-model.md`.

## Route map

```
/cargo                          — CargoList (this spec)
/cargo/:manifestId              — CargoManifestDetail (items + actions)
/cargo/items/:itemId            — CargoItemDetails
```

Linked from `/trucks/:id` ("Mercadería") and main nav "Mercadería".

| Route / action | Required permission (Fase 6 rbac) |
| -------------- | --------------------------------- |
| `/cargo`, `/cargo/:manifestId`, `/cargo/items/:itemId` | `cargo.read` |
| Create manifest / item | `cargo.create` |
| Edit item | `cargo.update` |
| Split item (dialogs) | `cargo.update` |
| Transfer item (dialogs) | `cargo.transfer` |
| Movements timeline | `cargo.read` (rows gated by kind → permission map) |

## CargoList

```
┌──────────────────────────────────────────────────────────────────┐
│ Mercadería — (count when full page)                               │
│ [Buscar…]  [Estado: Todos ▾]  [Manifiesto: Todos ▾]  [+ Nuevo]    │
├──────────────────────────────────────────────────────────────────┤
│ CargoManifestCard ── CargoManifestCard ── CargoManifestCard       │
│ (manifests grouped by truck / date; "Cargar más" at end)          │
└──────────────────────────────────────────────────────────────────┘
```

- **Search** (`Buscar…`): debounced (300 ms) substring on `code`,
  `description`, `sku`.
- **Filter** (`Estado`): cargo manifest rollup (`received | in_playon |
  in_control | discharging | discharged | distributed | closed`).
- **Manifiesto** filter: per-manifest view.
- **Sort**: `arrival_date` desc default; alternative by `code`.
- **Pagination / lazy load**: page size 20, cursor on `arrival_date desc,
  id`; infinite list with `Cargar más`; row count fetched only when the
  rendered page is full (per ADR 0008 §4 contract).
- **Create** (`+ Nuevo`): creates a `cargo_manifest` with first item(s);
  visible with `cargo.create`.

Each manifest card: `code`, truck (`plate` when set), facility, arrival
date, rollup status badge, item count, total expected weight, progress
(`X/Y` items distributed or closed), "Ver" → detail.

## CargoManifestDetail

Header (manifest fields) + item list section:

- Manifest fields read-only: `code`, `truck_id` (plate), `driver_id`,
  `transport_company_id`, shipper/client parties, `origin`, `destination`,
  `expected_weight_kg`, `arrival_date`, `departure_date`, rollup `status`,
  `notes`.
- Items table: line number, `sku` (Identificador), `description`,
  `category` chip, quantity × uom, weight (qty × unit weight), volume (qty
  × unit volume), item `status`, **placements** (currentLocation rollup:
  active lots with location/truck + qty), [Split] [Transfer] [Editar]
  per row (permission-gated).
- Manifest-level action: "Agregar ítem" (`cargo.create`);
  edit manifest (`cargo.update`).

## CargoItemCard / CargoItemDetails

Card (list view): `sku`+`description`, category chip, quantity, status
badge, placements summary (e.g. "Sector 3: 40 · Scanner: 20 · Camión: 10").

Details page:

- Header: `sku` (Identificador), `description`, category, edit action
  (`cargo.update`).
- **Fields read-only** (from item): `total_quantity`, `uom`,
  `unit_weight_kg`, `unit_volume_m3`, `status`, `observations`.
- **Placements (currentLocation — derived)**: table of active lots:
  location/truck, quantity, `parent_lot_id` chain indicator, created-via
  movement. **No editable location here** — placement changes only via
  split/transfer (server-authorized movements).
- **CargoMovementsTimeline**: read-only, newest first (kind label,
  `occurred_at`, operator, from → to location/truck, quantity, notes,
  doc references); links to related module records where the actor has read
  permission. No write actions (append-only, ADR 0004).

## CargoCreateDialog / CargoEditDialog

Fields (create: all shown; edit: per permissions):

| Field | Create | Edit | Notes |
| ----- | ------ | ---- | ----- |
| `description` | required | editable | free text |
| `category` | optional | editable | autocomplete from recent values |
| `quantity` | required (>0) | editable (total) | per-lot edits happen via split, not here |
| `unit` (uom) | required (default `unit`) | editable | |
| `unit_weight_kg` | optional | editable | ≥ 0; derived totals update |
| `unit_volume_m3` | optional | editable | > 0 if set (Fase 5) |
| `identifier` (sku) | optional | editable | unique per org per item set; UI label "Identificador" |
| `observations` | optional | editable | item-level notes |
| `currentLocation` / placements | **never** | **never** | derived from lots (ADR 0009 §4) |
| `status` | default `pending` | not offered | status follows operations/spine |

## SplitDialog (Dividir)

Requires `cargo.update`. Purpose: divide merchandise into destinations.

- Select source lot (defaults to truck remnant / selected lot).
- **Quantity to split** (must be < source lot quantity; remainder stays).
- **Destination**: `location_id` (Sector/Scann/Scale/… via location
  picker) or truck (for remanente), from the same org; target must be
  active and not frozen (transfer rule from `docs/domain/flows.md`).
- Adds `split` movement + child lot(s); Σ invariant enforced by trigger.

## TransferDialog (Transferir)

Requires `cargo.transfer`. Purpose: move an existing lot to another
physical place without quantity change.

- Source lot (read-only quantity), target location or truck (same org,
  active, not frozen).
- Adds `transfer` movement + updates placement; quantity unchanged; Σ
  invariant holds.

All writes go through RLS + Edge Function permission re-check (ADR 0007).

## Movements timeline row contract

Every operation the user performs from this module must appear as a
movement with: `kind`, `occurred_at`, `operator_id` (user), quantity,
from → to (`movement_items` location/truck), truck (via manifest/lots),
merchandise (`item_lot_id`), observations (`movement_items.notes` /
`movements.reason`). This is the traceability contract the QA spec asserts.

## Empty and error states

- Empty list: "No hay mercadería" + create CTA (if `cargo.create`).
- Item without placements: show item fields + "Sin lotes activos".
- Split with quantity ≥ source: inline error; no movement created.
- Load failure: retry CTA; keep rendered rows.
- Insufficient permission: route guard redirects; RLS guarantees empty sets
  server-side.

## Loading and measurement targets

- First page ≤ 2 s p95 on 50k manifests; subsequent pages ≤ 1 s.
- Placements rollup for an item: single query over its active lots (indexed
  by `cargo_item_id`), no per-lot N+1.
- Count queries only on full-page condition; never on mount.