-- ============================================================
-- Migration: SECURITY DEFINER "set_profile" function
-- Lets the app save the sign-up role choice (student/teacher)
-- even when email confirmation has not completed yet (no
-- session -> Row Level Security would otherwise block the
-- client-side profile upsert on the default trigger row).
-- Idempotent: safe to run on the linked project.
-- ============================================================

create or replace function public.set_profile(
  uid uuid,
  user_email text,
  user_full_name text,
  user_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if user_role not in ('student', 'teacher') then
    raise exception 'Invalid role: %', user_role;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (uid, user_email, user_full_name, user_role)
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    updated_at = now();
end;
$$;

grant execute on function public.set_profile(uuid, text, text, text)
  to anon, authenticated;