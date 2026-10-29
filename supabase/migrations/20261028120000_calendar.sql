-- Step 12: a group's calendar (B2). Events per group and date; the group's admins (group admin or
-- community admin) add, edit and delete them; the group's approved members read them while the
-- group's calendar is on. "DM Admin" opens a DM with the event's creator.
-- No client grants: one read (a month) and two writes, each a security definer RPC that checks the
-- caller. A group has at most 20 events a day, so a month is a small, bounded read on one index.

create table public.events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null,
  chat_id uuid not null,
  on_date date not null check (on_date between '2000-01-01' and '2199-12-31'),
  headline text not null check (char_length(headline) between 1 and 120 and headline = btrim(headline)), -- HEADLINE_MAX
  body text not null default '' check (char_length(body) <= 4000), -- LONG_TEXT_MAX
  created_by uuid, -- "DM Admin"; null once their account is gone
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (community_id, chat_id) references public.chats (community_id, id) on delete cascade,
  foreign key (community_id, created_by) references public.members on delete set null (created_by)
);

-- A month of one group: the only read.
create index events_chat_date on public.events (chat_id, on_date);
-- Deleting a member sets their events' creator to null without scanning every event.
create index events_creator on public.events (community_id, created_by);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- The calendar of a group the caller may see: its admins always, its approved members while the
-- calendar is on.
create function private.can_read_calendar(p_community uuid, p_chat uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.can_manage_group(p_community, p_chat))
    or (exists (select 1 from public.chats where id = p_chat and community_id = p_community and kind = 'group' and calendar)
      and (select private.is_approved(p_community)) and private.is_chat_member(p_chat))
$$;

-- B2: the events of the month that p_month falls in, by date. The marked dates are their dates.
-- created_by only when "DM Admin" can open a DM: someone else, still approved, no block either way;
-- checked once per creator, not per event (a busy month has 600 events and a few creators).
create function public.calendar_month(p_community uuid, p_chat uuid, p_month date)
returns table (id uuid, on_date date, headline text, body text, created_by uuid)
language sql stable security definer set search_path = '' as $$
  with month as materialized (
    select e.id, e.on_date, e.headline, e.body, e.created_by, e.created_at
    from public.events e
    where (select private.can_read_calendar(p_community, p_chat))
      and e.chat_id = p_chat
      and e.on_date >= date_trunc('month', p_month)::date
      and e.on_date < (date_trunc('month', p_month) + interval '1 month')::date
    order by e.on_date, e.created_at, e.id
    limit 1000
  ),
  -- Its own step, so the checks below run per creator (the planner otherwise ran them per event).
  creators as materialized (
    select distinct created_by from month where created_by is not null and created_by <> (select auth.uid())
  ),
  -- Key lookups per creator: their membership, and a block either way.
  reachable as materialized (
    select c.created_by
    from creators c
    where (select m.state from public.members m where m.community_id = p_community and m.user_id = c.created_by) = 'approved'
      and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = (select auth.uid()) and b.blocked_id = c.created_by)
      and not exists (select 1 from public.blocks b where b.community_id = p_community and b.blocker_id = c.created_by and b.blocked_id = (select auth.uid()))
  )
  select m.id, m.on_date, m.headline, m.body, r.created_by
  from month m
  left join reachable r on r.created_by = m.created_by
  order by m.on_date, m.created_at, m.id
$$;

-- Add (p_event null) or edit an event: {"on_date": "2026-11-02", "headline": "…", "body": "…"}.
-- The creator stays the one who added it. Returns the event's id.
create function public.save_event(p_community uuid, p_chat uuid, p_event uuid, p_data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_date date;
  v_headline text := btrim(coalesce(p_data ->> 'headline', ''));
  v_body text := btrim(coalesce(p_data ->> 'body', ''));
  v_id uuid;
begin
  perform private.require_manage_group(p_community, p_chat);
  if not exists (select 1 from public.chats where id = p_chat and calendar) then
    raise exception 'the group''s calendar is off' using errcode = '42501';
  end if;
  -- YYYY-MM-DD only (a cast alone also takes words like 'tomorrow').
  begin
    v_date := case when p_data ->> 'on_date' ~ '^\d{4}-\d{2}-\d{2}$' then (p_data ->> 'on_date')::date end;
  exception when others then
    raise exception 'not a date' using errcode = '22023';
  end;
  if v_date is null or v_date not between '2000-01-01' and '2199-12-31' then
    raise exception 'not a date' using errcode = '22023';
  end if;
  if char_length(v_headline) not between 1 and 120 or char_length(v_body) > 4000 then
    raise exception 'headline 1 to 120 characters, text up to 4000' using errcode = '22023';
  end if;
  -- One group admin at a time per group, so the count can't race past the cap in practice.
  if (select count(*) from public.events
      where chat_id = p_chat and on_date = v_date and (p_event is null or id <> p_event)) >= 20 then
    raise exception 'at most 20 events a day' using errcode = '22023';
  end if;

  if p_event is null then
    insert into public.events (community_id, chat_id, on_date, headline, body, created_by)
    values (p_community, p_chat, v_date, v_headline, v_body, (select auth.uid()))
    returning id into v_id;
  else
    update public.events set on_date = v_date, headline = v_headline, body = v_body, updated_at = now()
    where id = p_event and chat_id = p_chat
    returning id into v_id;
    if v_id is null then
      raise exception 'no such event' using errcode = '22023';
    end if;
  end if;
  return v_id;
end
$$;

-- Delete an event (asked first in the app).
create function public.delete_event(p_community uuid, p_chat uuid, p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_manage_group(p_community, p_chat);
  delete from public.events where id = p_event and chat_id = p_chat;
  if not found then
    raise exception 'no such event' using errcode = '22023';
  end if;
end
$$;

revoke execute on function private.can_read_calendar(uuid, uuid) from public, anon, authenticated;
revoke execute on function
  public.calendar_month(uuid, uuid, date), public.save_event(uuid, uuid, uuid, jsonb), public.delete_event(uuid, uuid, uuid)
from public, anon;
grant execute on function
  public.calendar_month(uuid, uuid, date), public.save_event(uuid, uuid, uuid, jsonb), public.delete_event(uuid, uuid, uuid)
to authenticated;
