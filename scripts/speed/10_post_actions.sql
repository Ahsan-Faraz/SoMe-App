-- Step 8 speed check: post actions and chat images on seeded data, rolled back at the end.
-- 2,000 members in one group chat with 5,000 posts: every 5th has a photo, every 3rd comments on the
-- post before it, the newest 30 have 50 reactions each, post 4,000 has 500 and 100 comments under it.
-- Timed as member 1 (best of 5).
-- Run: npx supabase db query --linked -f scripts/speed/10_post_actions.sql
begin;

create temp table speed (name text, ms numeric, target_ms numeric);
grant all on speed to authenticated;
create temp table seed as select (select id from public.communities where slug = 'biking-stockholm') as biking, '78000000-0000-4000-8000-000000000001'::uuid as chat;
grant select on seed to authenticated;

create function pg_temp.u(n integer) returns uuid language sql immutable as $$
  select ('77000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid
$$;

insert into auth.users (id, email, raw_user_meta_data)
select pg_temp.u(n), 'speed8-' || n || '@test.invalid',
  jsonb_build_object('community_id', seed.biking, 'username', 'Test speed8 ' || n,
    'consents', jsonb_build_object('privacy', (select privacy_version from public.communities where id = seed.biking), 'age_18', true))
from seed, generate_series(1, 2000) as n;
update public.members set state = 'approved' where user_id::text like '77000000-%';

insert into public.chats (id, community_id, kind, name, created_by, last_seq, last_message_at)
select seed.chat, seed.biking, 'group', 'Test speed8', pg_temp.u(1), 5000, now() from seed;
insert into public.chat_members (chat_id, community_id, user_id, role)
select seed.chat, seed.biking, pg_temp.u(n), case when n = 1 then 'admin' else 'member' end from seed, generate_series(1, 2000) as n;

-- Photos (rows only; storage files are not needed to time the queries).
insert into public.photos (id, community_id, owner_id, bucket, path, thumb_path, width, height, purpose)
select ('79000000-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid, seed.biking, pg_temp.u(1 + s % 2000), 'private',
  'speed8/' || s || '.webp', 'speed8/' || s || '_t.webp', 1600, 1200, 'chat'
from seed, generate_series(5, 5000, 5) as s;
insert into public.messages (chat_id, seq, community_id, author_id, body, photo_id, reply_to_seq, reply_snippet)
select seed.chat, s, seed.biking, pg_temp.u(1 + s % 2000), 'Test post ' || s,
  case when s % 5 = 0 then ('79000000-0000-4000-8000-' || lpad(s::text, 12, '0'))::uuid end,
  case when s % 3 = 0 then s - 1 end, case when s % 3 = 0 then 'Test post ' || (s - 1) end
from seed, generate_series(1, 5000) as s;
-- 100 comments under post 4,000 (the post 'Delete' removes with it).
update public.messages set reply_to_seq = 4000 where chat_id = (select chat from seed) and seq between 4001 and 4100 and seq % 3 <> 0;
insert into public.reactions (chat_id, seq, community_id, user_id, emoji)
select seed.chat, s, seed.biking, pg_temp.u(u), (array['👍', '❤️', '😂', '🔥'])[1 + u % 4]
from seed, generate_series(4971, 5000) as s, generate_series(2, 51) as u;
insert into public.reactions (chat_id, seq, community_id, user_id, emoji)
select seed.chat, 4000, seed.biking, pg_temp.u(u), '🎉' from seed, generate_series(2, 501) as u;
analyze public.messages, public.reactions, public.photos, public.chat_members, public.members;

create function pg_temp.time(p_name text, p_sql text, p_target numeric) returns void language plpgsql as $$
declare
  v_plan json;
  v_best numeric;
  v_ms numeric;
begin
  for i in 1..5 loop
    execute 'explain (analyze, format json) ' || replace(p_sql, '$i', i::text) into v_plan;
    v_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    v_best := least(coalesce(v_best, v_ms), v_ms);
  end loop;
  insert into pg_temp.speed values (p_name, round(v_best, 2), p_target);
end
$$;
grant execute on function pg_temp.time(text, text, numeric), pg_temp.u(integer) to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', pg_temp.u(1), 'role', 'authenticated')::text, true);
select pg_temp.time('list_messages newest 30 (photos, comments, 50 reactions each)',
  format('select * from public.list_messages(%L, %L, null, null, 30)', (select biking from seed), (select chat from seed)), 15);
select pg_temp.time('list_messages older page',
  format('select * from public.list_messages(%L, %L, 2500, null, 30)', (select biking from seed), (select chat from seed)), 15);
select pg_temp.time('set_reaction (post with 50)', format('select public.set_reaction(%L, %L, 5000, %L)', (select biking from seed), (select chat from seed), '🙏'), 15);
select pg_temp.time('reaction_details (500 on one post, first 100)', format('select * from public.reaction_details(%L, %L, 4000)', (select biking from seed), (select chat from seed)), 15);
select pg_temp.time('edit_message (own post)', format('select public.edit_message(%L, %L, 2000, %L)', (select biking from seed), (select chat from seed), 'Test edited'), 15);
select pg_temp.time('can_read_chat_photo (storage check per signed file)', format('select private.can_read_chat_photo(%L)', 'speed8/4000_t.webp'), 5);
-- Deleting: post 4,000 with its 100 comments and 500 reactions (once; the rest have no comments).
select pg_temp.time('delete_message (a post with 100 comments, 500 reactions)',
  format('select public.delete_message(%L, %L, 4000 - ($i - 1) * 7)', (select biking from seed), (select chat from seed)), 30);

reset role;
select name, ms, target_ms, case when ms <= target_ms then 'ok' else 'SLOW' end as result from speed;
rollback;
