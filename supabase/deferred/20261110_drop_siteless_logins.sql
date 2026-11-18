-- Run after the build with logins per site (step 17) is deployed everywhere that uses the database.
-- The lookups by Auth email, which only the older build calls.
drop function if exists public.member_email(uuid, text);
drop function if exists public.join_check(uuid, text, text);
