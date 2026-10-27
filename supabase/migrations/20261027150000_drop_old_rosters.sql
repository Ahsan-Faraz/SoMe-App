-- After the step 11 deploy only (docs/prod-db-changes-steps-9-11.md): push this once the live site
-- runs the step 9–11 code. The older build listed members and applications with admin_roster and
-- group_roster (at most 2,000 rows, searched and counted on the phone); the new code uses
-- roster_members, roster_applications and scope_stats.

drop function public.admin_roster(uuid, boolean);
drop function public.group_roster(uuid, uuid, boolean);
