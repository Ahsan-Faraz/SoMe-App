-- Run after the build with sites (step 17) is deployed everywhere that uses the database.
-- The versions without a site, which only the older build calls.
drop function if exists public.platform_communities();
drop function if exists public.create_community(text, text, text);
