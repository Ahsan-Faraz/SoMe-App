-- Step 19 (client feedback 261115): leaving a group yourself also deletes the images the group kept
-- from your application (keep_application_images, 20261117120000_feedback_261115.sql).
-- leave_chat (20261022120000_post_actions.sql) returned no files for a group; that one line is
-- swapped in place, so the DM branches stay exactly as they are. Same arguments and result type.

do $migration$
declare
  v_old constant text := $old$    delete from public.chat_members where chat_id = p_chat and user_id = v_uid;
    return jsonb_build_object('files', '[]'::jsonb);$old$;
  v_new constant text := $new$    delete from public.chat_members where chat_id = p_chat and user_id = v_uid;
    -- (community, user) leads, so applications_member finds the person's few rows.
    return jsonb_build_object('files', to_jsonb(coalesce((
      select array_agg(f.path) from public.applications a
      cross join lateral unnest(private.drop_application_media(a.id)) as f (path)
      where a.community_id = p_community and a.user_id = v_uid and a.chat_id = p_chat and a.media_deleted_at is null
    ), '{}')));$new$;
  v_def text;
  v_count integer := 0;
begin
  for v_def in
    select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'leave_chat' and strpos(p.prosrc, v_old) > 0
  loop
    execute replace(v_def, v_old, v_new);
    v_count := v_count + 1;
  end loop;
  if v_count <> 1 then
    raise exception 'expected to rewrite leave_chat once, rewrote % functions', v_count;
  end if;
end
$migration$;
