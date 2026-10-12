-- Supabase's "auto-enable RLS" event trigger function (created with the project) sits in public,
-- so the API exposes it as an RPC. It only runs as a trigger; nobody needs to call it.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
