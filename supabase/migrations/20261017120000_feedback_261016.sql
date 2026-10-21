-- Steps 3–4, client feedback 261016 (docs/backend-design.md §4.3, §4.4).
-- 1. Linked profiles: a short comment of yours next to each link ("My partner", "Riding buddy"),
--    shown wherever the link is shown.
-- 2. The applicant reads their own community application back (A25 after applying): the image,
--    text and real names they sent, instead of an empty form.

-- ---------------------------------------------------------------------------------------------
-- Linked profiles: comment

alter table public.profile_links
  add column comment text check (char_length(comment) between 1 and 60 and comment = btrim(comment)); -- LINK_COMMENT_MAX

-- A32: the comment on one of your links; empty clears it.
create function public.set_profile_link_comment(p_community uuid, p_linked uuid, p_comment text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.profile_links
  set comment = nullif(btrim(p_comment), '')
  where community_id = p_community and user_id = (select auth.uid()) and linked_user_id = p_linked;
  if not found then
    raise exception 'no such link' using errcode = '22023';
  end if;
end
$$;

-- A3/B1, unchanged except that each link now carries its comment.
create or replace function public.profile(p_community uuid, p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_viewer public.members;
  v_member public.members;
  v_own boolean := p_user = v_uid;
  v_admin boolean;
begin
  select * into v_viewer from public.members
  where community_id = p_community and user_id = v_uid and state in ('profile', 'applied', 'approved');
  if not found then
    return null;
  end if;
  v_admin := v_viewer.state = 'approved' and v_viewer.role = 'admin';

  select * into v_member from public.members
  where community_id = p_community and user_id = p_user and not is_system;
  if not found or not (v_own or v_admin or (v_viewer.state = 'approved' and v_member.state = 'approved')) then
    return null;
  end if;

  return jsonb_build_object(
    'user_id', v_member.user_id,
    'username', v_member.username,
    'state', v_member.state,
    'own', v_own,
    'created_at', case when v_own or v_admin then v_member.created_at end,
    'status_id', v_member.status_id,
    'looking_for', to_jsonb(v_member.looking_for),
    'country_id', v_member.country_id,
    'district_id', v_member.district_id,
    'place', v_member.place,
    'visible_in_search', v_member.visible_in_search,
    'score', v_member.score,
    'last_login_at', v_member.last_login_at,
    'photo', (select private.photo_json(p) from public.photos p where p.id = v_member.photo_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'substatus_id', s.substatus_id, 'n', s.n,
        'birth_date', case when v_own then pp.birth_date end,
        'age', extract(year from age(current_date, pp.birth_date))::integer
      ) order by s.k)
      from private.status_people(v_member.status_id) as s
      left join public.profile_people pp
        on pp.community_id = p_community and pp.user_id = p_user
        and pp.substatus_id is not distinct from s.substatus_id and pp.n = s.n
    ), '[]'),
    'values', coalesce((
      select jsonb_agg(jsonb_build_object(
        'field_id', v.field_id, 'substatus_id', v.substatus_id, 'n', v.n, 'text', v.value_text, 'num', v.value_num,
        'bool', v.value_bool, 'date', v.value_date, 'photo', private.photo_json(p)
      ))
      from public.profile_values v
      join public.profile_fields f on f.id = v.field_id
      left join public.photos p on p.id = v.value_photo_id
      where v.community_id = p_community and v.user_id = p_user
        and private.field_applies(f, v_member.status_id, v.substatus_id, v.n)
    ), '[]'),
    'choices', coalesce((
      select jsonb_agg(jsonb_build_object('field_id', c.field_id, 'substatus_id', c.substatus_id, 'n', c.n, 'option_ids', c.option_ids))
      from (
        select v.field_id, v.substatus_id, v.n, array_agg(v.option_id order by o.position) as option_ids
        from public.profile_value_options v
        join public.profile_fields f on f.id = v.field_id
        join public.profile_field_options o on o.id = v.option_id
        where v.community_id = p_community and v.user_id = p_user
          and private.field_applies(f, v_member.status_id, v.substatus_id, v.n)
        group by v.field_id, v.substatus_id, v.n
      ) as c
    ), '[]'),
    -- Your own: every link you made, confirmed or not. Someone else's: confirmed links only.
    'links', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path, 'confirmed', back.user_id is not null, 'comment', l.comment
      ) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.linked_user_id and m.state = 'approved'
      left join public.photos p on p.id = m.photo_id
      left join public.profile_links back
        on back.community_id = l.community_id and back.user_id = l.linked_user_id and back.linked_user_id = l.user_id
      where l.community_id = p_community and l.user_id = p_user and (v_own or back.user_id is not null)
    ), '[]'),
    -- Your own only: who has linked to you, so you can link back.
    'linked_you', case when v_own then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'username', m.username, 'icon', p.thumb_path) order by l.created_at)
      from public.profile_links l
      join public.members m on m.community_id = l.community_id and m.user_id = l.user_id and m.state = 'approved'
      left join public.photos p on p.id = m.photo_id
      where l.community_id = p_community and l.linked_user_id = p_user
    ), '[]') else '[]'::jsonb end
  );
end
$$;

-- ---------------------------------------------------------------------------------------------
-- A25: your own latest community application, or null. The image's path is returned for the
-- server to sign (private bucket; the file is in your own folder).
create function public.my_application(p_community uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'status', a.status, 'message', a.message, 'real_name_1', a.real_name_1, 'real_name_2', a.real_name_2,
    'created_at', a.created_at, 'photo', private.photo_json(p)
  )
  from public.applications a
  left join public.photos p on p.id = a.photo_id
  where a.community_id = p_community and a.user_id = (select auth.uid()) and a.chat_id is null
  order by a.created_at desc
  limit 1
$$;

revoke execute on function public.set_profile_link_comment(uuid, uuid, text), public.my_application(uuid) from public, anon;
grant execute on function public.set_profile_link_comment(uuid, uuid, text), public.my_application(uuid) to authenticated;
