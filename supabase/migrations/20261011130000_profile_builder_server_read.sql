-- The server caches each community's profile builder (features/fields/queries.ts). The cache can't
-- read cookies, so it reads as service_role, which this project grants nothing by default.
-- Read only: every write goes through the admin RPCs under the admin's own login.
grant select on public.community_options, public.profile_fields, public.profile_field_options to service_role;
