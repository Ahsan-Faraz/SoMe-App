-- Step 3, client feedback 261013 (p.s.): basic fields can be moved among the profile fields.
-- profile_layout holds the basic fields' positions in the same order as profile_fields.position, so a
-- profile shows one list, top to bottom. Status (it decides the fields) and "visible in search" (a
-- setting) stay at the top. Age goes in each person's section, at its place among their fields.

create table public.profile_layout (
  community_id uuid not null references public.communities on delete cascade,
  builtin text not null check (builtin in ('photo', 'looking_for', 'age', 'country', 'district', 'place', 'score', 'links')),
  position smallint not null check (position between 0 and 999),
  primary key (community_id, builtin)
);

alter table public.profile_layout enable row level security;
revoke all on public.profile_layout from anon, authenticated;
grant select on public.profile_layout to authenticated;
grant select on public.profile_layout to service_role; -- the cached builder (features/fields/queries.ts)

create policy profile_layout_read on public.profile_layout
  for select to authenticated using (community_id in (select private.member_communities()));

-- Default order: the basic fields first, then the fields as they were.
create function private.add_profile_layout() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profile_layout (community_id, builtin, position)
  select new.id, b.builtin, (b.n - 1)::smallint
  from unnest(array['photo', 'looking_for', 'age', 'country', 'district', 'place', 'score', 'links']) with ordinality as b (builtin, n);
  return new;
end
$$;

create trigger communities_add_profile_layout
  after insert on public.communities
  for each row execute function private.add_profile_layout();

insert into public.profile_layout (community_id, builtin, position)
select c.id, b.builtin, (b.n - 1)::smallint
from public.communities c
cross join unnest(array['photo', 'looking_for', 'age', 'country', 'district', 'place', 'score', 'links']) with ordinality as b (builtin, n);

update public.profile_fields set position = position + 8;

-- The profile's order, top to bottom: each item a field id or 'builtin:<name>'. Replaces
-- reorder_profile_fields. Items left out keep their place.
drop function public.reorder_profile_fields(uuid, uuid[]);

create function public.reorder_profile_layout(p_community uuid, p_items text[])
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_community_admin(p_community);
  if cardinality(p_items) > 1000 then
    raise exception 'too many items' using errcode = '22023';
  end if;
  update public.profile_fields f
  set position = (o.n - 1)::smallint
  from unnest(p_items) with ordinality as o (item, n)
  where f.community_id = p_community and f.id = case when o.item like 'builtin:%' then null else o.item::uuid end;
  update public.profile_layout l
  set position = (o.n - 1)::smallint
  from unnest(p_items) with ordinality as o (item, n)
  where l.community_id = p_community and o.item = 'builtin:' || l.builtin;
end
$$;

create or replace function public.save_profile_field(p_community uuid, p_field jsonb, p_options jsonb default '[]')
returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_locale text;
  v_id uuid := (p_field ->> 'id')::uuid;
  v_label text := btrim(p_field ->> 'label');
  v_statuses uuid[] := case when jsonb_typeof(p_field -> 'for_statuses') = 'array' and jsonb_array_length(p_field -> 'for_statuses') > 0
    then array(select jsonb_array_elements_text(p_field -> 'for_statuses')::uuid) end;
  v_substatuses uuid[] := case when jsonb_typeof(p_field -> 'for_substatuses') = 'array' and jsonb_array_length(p_field -> 'for_substatuses') > 0
    then array(select jsonb_array_elements_text(p_field -> 'for_substatuses')::uuid) end;
  v_kind text;
  v_active boolean;
  v_count integer;
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_field) is distinct from 'object' then
    raise exception 'field must be an object' using errcode = '22023';
  end if;
  if jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) > 200 then
    raise exception 'options must be an array of at most 200' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_options) as e (item)
    where coalesce((e.item ->> 'active')::boolean, true)
    group by lower(btrim(e.item ->> 'label')) having count(*) > 1
  ) then
    raise exception 'two choices have the same name' using errcode = '23505';
  end if;

  select default_locale into v_locale from public.communities where id = p_community;

  if v_id is null then
    insert into public.profile_fields (
      community_id, key, label, kind, required, searchable, on_card, for_statuses, for_substatuses, max_length, position, active
    ) values (
      p_community,
      private.field_key(p_community, v_label),
      jsonb_build_object(v_locale, v_label),
      p_field ->> 'kind',
      coalesce((p_field ->> 'required')::boolean, false),
      coalesce((p_field ->> 'searchable')::boolean, false),
      coalesce((p_field ->> 'on_card')::boolean, false),
      v_statuses,
      v_substatuses,
      (p_field ->> 'max_length')::integer,
      -- Last, after the fields and the basic fields.
      (select coalesce(max(x.position) + 1, 0) from (
        select position from public.profile_fields where community_id = p_community
        union all select position from public.profile_layout where community_id = p_community
      ) as x)::smallint,
      coalesce((p_field ->> 'active')::boolean, true)
    )
    returning id, kind, active into v_id, v_kind, v_active;
  else
    update public.profile_fields f
    set label = f.label || jsonb_build_object(v_locale, v_label),
        required = coalesce((p_field ->> 'required')::boolean, f.required),
        searchable = coalesce((p_field ->> 'searchable')::boolean, f.searchable),
        on_card = coalesce((p_field ->> 'on_card')::boolean, f.on_card),
        for_statuses = v_statuses,
        for_substatuses = v_substatuses,
        max_length = (p_field ->> 'max_length')::integer,
        active = coalesce((p_field ->> 'active')::boolean, f.active)
    where f.id = v_id and f.community_id = p_community
    returning f.kind, f.active into v_kind, v_active;
    if not found then
      raise exception 'unknown field' using errcode = '22023';
    end if;
  end if;

  update public.profile_field_options o
  set label = o.label || jsonb_build_object(v_locale, btrim(e.item ->> 'label')),
      position = (e.n - 1)::smallint,
      active = coalesce((e.item ->> 'active')::boolean, o.active)
  from jsonb_array_elements(p_options) with ordinality as e (item, n)
  where e.item ->> 'id' is not null and o.id = (e.item ->> 'id')::uuid and o.field_id = v_id;
  get diagnostics v_count = row_count;
  if v_count <> (select count(*) from jsonb_array_elements(p_options) as e (item) where e.item ->> 'id' is not null) then
    raise exception 'unknown choice' using errcode = '22023';
  end if;

  -- A choice on a field that isn't pick one / pick several is refused by its trigger.
  insert into public.profile_field_options (community_id, field_id, label, position, active)
  select p_community, v_id, jsonb_build_object(v_locale, btrim(e.item ->> 'label')),
    (e.n - 1)::smallint, coalesce((e.item ->> 'active')::boolean, true)
  from jsonb_array_elements(p_options) with ordinality as e (item, n)
  where e.item ->> 'id' is null;

  if v_active and v_kind in ('pick_one', 'pick_several') and not exists (
    select 1 from public.profile_field_options where field_id = v_id and active
  ) then
    raise exception 'a pick field needs at least one choice' using errcode = '23514';
  end if;

  return v_id;
end
$$;

revoke execute on function private.add_profile_layout() from public;
revoke execute on function public.reorder_profile_layout(uuid, text[]) from public, anon;
grant execute on function public.reorder_profile_layout(uuid, text[]) to authenticated;
