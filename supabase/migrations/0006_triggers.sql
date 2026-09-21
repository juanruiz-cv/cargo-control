-- =====================================================================
-- Cargo Control — 0006_triggers.sql
-- =====================================================================
-- Database-enforced invariants and maintenance triggers.
--   * set_updated_at + updated_at triggers (database.md §8: "updated_at
--     maintained via the shared trigger").
--   * ADR 0006 capacity guards: lot_placement_capacity_guard (I3/I5),
--     locations_capacity_guard (I4/I6), locations_capacity_audit
--     (capacity.set audit; I7: rejected operations write nothing and are
--     NOT audited). Function bodies follow docs/domain/capacity-occupancy.md
--     §7 and docs/architecture/database.md §4.2.
--   * ADR 0003 quantity balance: Σ leaf lot quantities per item = total,
--     enforced by a DEFERRABLE INITIALLY DEFERRED constraint trigger so a
--     transactional split's intermediate states are legal and the invariant
--     holds at commit (movement-engine.md §Transactional).
--
-- Hardening note (deviation, already applied in 0003): every function is
-- SECURITY DEFINER with `set search_path = ''` and fully-qualified names.
-- The doc outlines run in a superuser context; in the live schema these
-- triggers execute under the CALLER, and the internal SELECTs would be RLS-
-- filtered (wrong occupancy sums / phantom balance violations), while
-- `audit_log` INSERT must bypass the no-client-insert policy. Security
-- definer restores the documented engine semantics. The doc logic is
-- otherwise verbatim.
--
-- TODO DECISION (registered): "Holds freeze lots: no normal stock movement
-- while in_quarantine/seized" (database.md §8) is enforced by the movement
-- ENGINE protocol (movement-engine.md §Transactional), NOT by a trigger —
-- this file only enforces quantity balance and capacity invariants.
--
-- Known QA caveat: ME-*/T-* tests that validate balance by doing a
-- transaction and ROLLBACK never reach the deferred check (it fires at
-- COMMIT). Deferred balance violations surface on commit, by design.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Shared updated_at maintenance (database.md §8)
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger organizations_updated_at_trg
  before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger facilities_updated_at_trg
  before update on public.facilities
  for each row execute function public.set_updated_at();
create trigger locations_updated_at_trg
  before update on public.locations
  for each row execute function public.set_updated_at();
create trigger layouts_updated_at_trg
  before update on public.layouts
  for each row execute function public.set_updated_at();
create trigger layout_elements_updated_at_trg
  before update on public.layout_elements
  for each row execute function public.set_updated_at();
create trigger users_updated_at_trg
  before update on public.users
  for each row execute function public.set_updated_at();
create trigger roles_updated_at_trg
  before update on public.roles
  for each row execute function public.set_updated_at();
create trigger permissions_updated_at_trg
  before update on public.permissions
  for each row execute function public.set_updated_at();
create trigger transport_companies_updated_at_trg
  before update on public.transport_companies
  for each row execute function public.set_updated_at();
create trigger drivers_updated_at_trg
  before update on public.drivers
  for each row execute function public.set_updated_at();
create trigger trucks_updated_at_trg
  before update on public.trucks
  for each row execute function public.set_updated_at();
create trigger parties_updated_at_trg
  before update on public.parties
  for each row execute function public.set_updated_at();
create trigger cargo_manifests_updated_at_trg
  before update on public.cargo_manifests
  for each row execute function public.set_updated_at();
create trigger cargo_items_updated_at_trg
  before update on public.cargo_items
  for each row execute function public.set_updated_at();
create trigger item_lots_updated_at_trg
  before update on public.item_lots
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- I4/I6: capacity reduction guard on locations
-- (capacity-occupancy.md §7, database.md §4.2) — logic verbatim:
--   * value -> NULL always allowed (unlimited);
--   * NULL -> value allowed only if occupancy <= value;
--   * occupancy == capacity allowed (I5);
--   * no-op updates skipped via IS DISTINCT FROM.
-- ---------------------------------------------------------------------
create or replace function public.locations_capacity_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o public.location_occupancy;
begin
  select * into o from public.location_occupancy where location_id = new.id;
  if new.capacity_max_kg is not null
     and (old.capacity_max_kg is distinct from new.capacity_max_kg)
     and o.occupancy_kg > new.capacity_max_kg then
    raise exception 'capacity_max_kg below current occupancy (%)', o.occupancy_kg;
  end if;
  if new.capacity_max_volume_m3 is not null
     and (old.capacity_max_volume_m3 is distinct from new.capacity_max_volume_m3)
     and o.occupancy_m3 > new.capacity_max_volume_m3 then
    raise exception 'capacity_max_volume_m3 below current occupancy (%)', o.occupancy_m3;
  end if;
  if new.capacity_max_units is not null
     and (old.capacity_max_units is distinct from new.capacity_max_units)
     and o.occupancy_units > new.capacity_max_units then
    raise exception 'capacity_max_units below current occupancy (%)', o.occupancy_units;
  end if;
  return new;
end $$;

create trigger locations_capacity_guard_trg
  before update of capacity_max_kg, capacity_max_volume_m3, capacity_max_units
  on public.locations
  for each row execute function public.locations_capacity_guard();

-- ---------------------------------------------------------------------
-- I3/I5: placement guard on item_lots (capacity-occupancy.md §7 outline,
-- database.md §4.2) — serializes per destination location (row lock
-- FOR UPDATE, §8) and rejects a placement that would exceed any known
-- capacity dimension:
--   * occupancy of the destination is read from location_occupancy (which
--     already includes the CURRENT row on UPDATE) and the row's OLD
--     contribution is excluded when it stays at the same location;
--   * then the row's NEW contribution is added (I3); equality allowed (I5);
--   * unknowns (lot + item weight both NULL) leave that dimension unguarded
--     instead of summing zero (capacity-occupancy.md §6, §9).
-- ---------------------------------------------------------------------
create or replace function public.lot_placement_capacity_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  o    public.location_occupancy;
  item public.cargo_items;
  _old_kg numeric; _old_m3 numeric; _old_units numeric;
  _new_kg numeric; _new_m3 numeric; _new_units numeric;
begin
  if new.current_location_id is null then
    return new;                       -- lot on a truck / unplaced: no guard
  end if;

  perform 1 from public.locations      -- serialize (capacity-occupancy.md §8)
    where id = new.current_location_id
    for update;

  select * into o from public.location_occupancy
    where location_id = new.current_location_id;

  select * into item from public.cargo_items where id = new.cargo_item_id;

  if tg_op = 'update'
     and old.current_location_id = new.current_location_id then
    _old_kg    := old.quantity * coalesce(old.unit_weight_kg,   item.unit_weight_kg);
    _old_m3    := old.quantity * coalesce(old.unit_volume_m3,   item.unit_volume_m3);
    _old_units := case when old.uom = 'unit' then old.quantity else 0 end;
  end if;

  _new_kg    := new.quantity * coalesce(new.unit_weight_kg, item.unit_weight_kg);
  _new_m3    := new.quantity * coalesce(new.unit_volume_m3, item.unit_volume_m3);
  _new_units := case when new.uom = 'unit' then new.quantity else 0 end;

  if o.capacity_max_kg is not null
     and (o.occupancy_kg - coalesce(_old_kg, 0) + coalesce(_new_kg, 0)) > o.capacity_max_kg then
    raise exception 'placement would exceed capacity_max_kg (%) at location %',
      o.capacity_max_kg, new.current_location_id;
  end if;
  if o.capacity_max_volume_m3 is not null
     and (o.occupancy_m3 - coalesce(_old_m3, 0) + coalesce(_new_m3, 0)) > o.capacity_max_volume_m3 then
    raise exception 'placement would exceed capacity_max_volume_m3 (%) at location %',
      o.capacity_max_volume_m3, new.current_location_id;
  end if;
  if o.capacity_max_units is not null
     and (o.occupancy_units - coalesce(_old_units, 0) + coalesce(_new_units, 0)) > o.capacity_max_units then
    raise exception 'placement would exceed capacity_max_units (%) at location %',
      o.capacity_max_units, new.current_location_id;
  end if;

  return new;
end $$;

create trigger lot_placement_capacity_guard_trg
  before insert or update of current_location_id, quantity,
                          unit_weight_kg, unit_volume_m3, uom
  on public.item_lots
  for each row execute function public.lot_placement_capacity_guard();

-- ---------------------------------------------------------------------
-- I7-adjacent: audit every ACCEPTED capacity change (capacity-occupancy.md
-- §7, database.md §4.2). Runs AFTER the guard trigger already passed;
-- skips no-op writes with IS DISTINCT FROM semantics on the guarded
-- columns. Actor comes from the session GUC app.actor_id, never from the
-- client body. INSERT bypasses the no-client-insert policy on audit_log via
-- security definer (the documented engine-only path, 0004_rls.sql).
-- ---------------------------------------------------------------------
create or replace function public.locations_capacity_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.capacity_max_kg        is distinct from new.capacity_max_kg
     or old.capacity_max_volume_m3 is distinct from new.capacity_max_volume_m3
     or old.capacity_max_units  is distinct from new.capacity_max_units then
    insert into public.audit_log
      (organization_id, actor_id, action, entity_type, entity_id,
       before, after, reason, created_at)
    values (
      new.organization_id,
      nullif(current_setting('app.actor_id', true), '')::uuid,
      'capacity.set', 'location', new.id::text,
      jsonb_build_object('kg', old.capacity_max_kg, 'm3', old.capacity_max_volume_m3,
                         'units', old.capacity_max_units),
      jsonb_build_object('kg', new.capacity_max_kg, 'm3', new.capacity_max_volume_m3,
                         'units', new.capacity_max_units),
      null, now());
  end if;
  return new;
end $$;

create trigger locations_capacity_audit_trg
  after update of capacity_max_kg, capacity_max_volume_m3, capacity_max_units
  on public.locations
  for each row execute function public.locations_capacity_audit();

-- ---------------------------------------------------------------------
-- ADR 0003 quantity balance: Σ leaf lot quantities per item = total_quantity.
--   * "leaf" = a lot with no children (parent_lot_id references it); split
--     parents keep their quantity and are excluded from the sum, so chained
--     splits stay traceable and the invariant reads exactly as documented
--     (ADR 0003 §Decision: "Σ leaf lot quantities per item = total_quantity").
--   * DEFERRABLE INITIALLY DEFERRED: splits are transactional — intermediate
--     states (parent reduced + children created) are never observable to
--     other transactions and the invariant is verified at COMMIT.
--   * Raises on violation: the whole transaction (including the movement
--     spine rows) rolls back (database.md §8 "rejected by a trigger on
--     violation").
-- ---------------------------------------------------------------------
create or replace function public.enforce_item_lot_balance() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  _item_id  uuid := coalesce(new.cargo_item_id, old.cargo_item_id);
  _total    numeric;
  _leaf_sum numeric;
begin
  if _item_id is null then
    return coalesce(new, old);
  end if;

  select total_quantity into _total
    from public.cargo_items where id = _item_id;

  select coalesce(sum(x.quantity), 0) into _leaf_sum
    from public.item_lots x
    where x.cargo_item_id = _item_id
      and not exists (select 1 from public.item_lots c
                      where c.parent_lot_id = x.id);

  if _total is not null and _leaf_sum <> _total then
    raise exception 'item % quantity balance violated: leaf sum % <> total %',
      _item_id, _leaf_sum, _total;
  end if;

  return coalesce(new, old);
end $$;

create constraint trigger enforce_item_lot_balance_trg
  after insert or update or delete on public.item_lots
  deferrable initially deferred
  for each row execute function public.enforce_item_lot_balance();