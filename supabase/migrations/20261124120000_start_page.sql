-- Step 20 (client guide 261123): the community admin edits the community's start page
-- (/{community}): a headline, a subheadline, an image and a longer info text. Only adds: one
-- nullable column, one storage policy, one function.
--
-- Headline    = communities.start_title (new; empty = the community's name, as before)
-- Subheadline = communities.headline (as before)
-- Image       = communities.hero_path (empty = the built-in picture, as before)
-- Info text   = communities.about (paragraphs, as before)

alter table public.communities
  add column start_title text check (char_length(start_title) <= 120);

-- The start page image lives in the public `profile` bucket at {community}/start/{uuid}.webp, a
-- path never reused, so browsers cache it for a year. Only that community's admin uploads there; no
-- update policy (a file is never overwritten). The old image is removed by the server after a save,
-- using the path save_community_start returns. Not under a person's folder, so it stays when the
-- admin who uploaded it deletes their account.
create policy community_start_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'profile'
    -- case: the uuid cast runs only on a name the pattern has already checked.
    and case when name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/start/[0-9a-f-]{36}\.(webp|jpg)$'
      then private.is_community_admin(split_part(name, '/', 1)::uuid) else false end
  );

-- "Save" on the start page section of the community settings. p_start:
--   {title: text, headline: text, about: [text], image?: text | null}
-- title at most 120 characters, headline at most 200, about at most 10 paragraphs and 4000
-- characters in all. image left out keeps the current one; null goes back to the built-in picture;
-- a text is a file the admin has just uploaded to {community}/start/. Returns the replaced image's
-- path when it was an uploaded file (for the server to delete), else null.
create function public.save_community_start(p_community uuid, p_start jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_title text := private.text_of(p_start, 'title');
  v_headline text := btrim(coalesce(p_start ->> 'headline', ''));
  v_about jsonb := p_start -> 'about';
  v_paragraphs text[];
  v_image text := p_start ->> 'image';
  v_old text;
begin
  perform private.require_community_admin(p_community);
  if jsonb_typeof(p_start) is distinct from 'object'
    or jsonb_typeof(p_start -> 'headline') is distinct from 'string'
    or jsonb_typeof(v_about) is distinct from 'array'
    or (p_start ? 'title' and jsonb_typeof(p_start -> 'title') not in ('string', 'null'))
    or (p_start ? 'image' and jsonb_typeof(p_start -> 'image') not in ('string', 'null'))
    or exists (select 1 from jsonb_array_elements(v_about) as a where jsonb_typeof(a) is distinct from 'string') then
    raise exception 'start page is incomplete' using errcode = '22023';
  end if;

  select coalesce(array_agg(p order by n), '{}') into v_paragraphs
  from jsonb_array_elements_text(v_about) with ordinality as a (raw, n)
  cross join lateral (select btrim(a.raw) as p) as t
  where t.p <> '';

  if char_length(v_title) > 120 or char_length(v_headline) > 200
    or cardinality(v_paragraphs) > 10
    or coalesce((select sum(char_length(p)) from unnest(v_paragraphs) as p), 0) > 4000 then
    raise exception 'start page text is too long' using errcode = '22001';
  end if;

  -- A new image: in this community's start folder, and really uploaded.
  if v_image is not null and (
    v_image !~ ('^' || p_community || '/start/[0-9a-f-]{36}\.(webp|jpg)$')
    or not exists (select 1 from storage.objects where bucket_id = 'profile' and name = v_image)
  ) then
    raise exception 'start page image not found' using errcode = '22023';
  end if;

  select hero_path into v_old from public.communities where id = p_community for update;

  update public.communities
  set start_title = v_title,
      headline = v_headline,
      about = v_paragraphs,
      hero_path = case when p_start ? 'image' then v_image else hero_path end
  where id = p_community;

  -- Only an uploaded file is deleted, never a built-in picture (those start with '/').
  if p_start ? 'image' and v_old is distinct from v_image and v_old like p_community || '/start/%' then
    return v_old;
  end if;
  return null;
end
$$;

revoke execute on function public.save_community_start(uuid, jsonb) from public, anon;
grant execute on function public.save_community_start(uuid, jsonb) to authenticated;
