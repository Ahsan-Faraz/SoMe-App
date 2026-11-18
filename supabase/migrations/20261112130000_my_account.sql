-- Step 18b: the caller's own account in a community, with their profile image, in one query.
-- Every member screen reads it (the app's getViewer) to know the role and, since client feedback
-- 261111, to show the profile image as the round icon. Clients have no grant on `photos` (photos are
-- only read through functions), so the image can't be joined from the browser's side.
-- One row by the members primary key and one by the photos primary key; no row = no account here.
create function public.my_account(p_community uuid)
returns table (username text, role text, state text, can_create_groups boolean, icon text)
language sql stable security definer set search_path = '' as $$
  select m.username, m.role, m.state, m.can_create_groups, p.thumb_path
  from public.members m
  left join public.photos p on p.id = m.photo_id
  where m.community_id = p_community and m.user_id = (select auth.uid())
$$;

revoke execute on function public.my_account(uuid) from public, anon;
grant execute on function public.my_account(uuid) to authenticated;
