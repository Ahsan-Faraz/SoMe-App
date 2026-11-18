-- Step 17c: a password reset in two steps, so a refused new password doesn't cost the code.
-- reset_confirm (20261110130000_logins.sql) used the code up before the server set the password; if
-- Supabase Auth then refused the password (too weak, or found in a leak), the person had to ask for
-- a new code. Now reset_confirm only checks the code, and reset_finish uses it up and ends the
-- login's sessions once the new password is saved.
-- Nothing deployed calls these functions yet, so this is safe for every build.

-- p_take: use the code up when it is right (false: leave it for the finishing step).
create function private.try_login_code(p_user uuid, p_kind text, p_code text, p_holder_hash text, p_take boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_row private.login_codes;
begin
  select * into v_row from private.login_codes where user_id = p_user and kind = p_kind for update;
  if not found or v_row.expires_at < now() or v_row.tries >= 5 then
    return false;
  end if;
  if v_row.holder_hash is distinct from p_holder_hash or v_row.code_hash <> private.code_hash(p_user, coalesce(p_code, '')) then
    update private.login_codes set tries = tries + 1 where user_id = p_user and kind = p_kind;
    return false;
  end if;
  if p_take then
    delete from private.login_codes where user_id = p_user and kind = p_kind;
  end if;
  return true;
end
$$;

create or replace function private.take_login_code(p_user uuid, p_kind text, p_code text, p_holder_hash text) returns boolean
language sql security definer set search_path = '' as $$
  select private.try_login_code(p_user, p_kind, p_code, p_holder_hash, true)
$$;

-- The code from the reset email: returns the login when it is right. The code stays until
-- reset_finish, so a wrong try still counts and a right one can't be replayed after the reset.
create or replace function public.reset_confirm(p_site text, p_community uuid, p_login text, p_code text)
returns table (user_id uuid, auth_email text)
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_auth text;
begin
  select k.user_id, k.auth_email into v_user, v_auth from public.login_lookup(p_site, p_community, p_login) k;
  if v_user is null or not private.try_login_code(v_user, 'reset', p_code, null, false) then
    return;
  end if;
  return query select v_user, v_auth;
end
$$;

-- After the new password is saved: the code is used up and every session of the login ends, so
-- whoever had the old password is logged out. The server signs the person in again right after.
create function public.reset_finish(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from private.login_codes where user_id = p_user and kind = 'reset';
  delete from auth.sessions s where s.user_id = p_user;
end
$$;

revoke execute on function private.try_login_code(uuid, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.reset_finish(uuid) from public, anon, authenticated;
grant execute on function public.reset_finish(uuid) to service_role;
