-- After the step 9 deploy only (docs/prod-db-changes-steps-9-11.md): push this once the live site
-- runs the step 9–11 code. The older build called profile_cards and group_directory;
-- 20261025140000_live_compat.sql kept them for it. The new code uses search_profiles and find_new.

drop function public.profile_cards(uuid, integer, smallint, uuid);
drop function public.group_directory(uuid, integer);
