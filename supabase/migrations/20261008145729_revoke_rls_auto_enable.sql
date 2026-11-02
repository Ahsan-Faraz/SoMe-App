-- Supabase's "auto-enable RLS" event trigger function (created with the project) sits in public,
-- so the API exposes it as an RPC. It only runs as a trigger; nobody needs to call it.
-- Only projects created with "Enable automatic RLS" have it (dev does, prod doesn't), so skip it
-- when it isn't there. Every table enables RLS itself either way.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
