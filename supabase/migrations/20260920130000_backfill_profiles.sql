-- ============================================================
-- Backfill: create profile rows for auth users created before
-- the Phase 3 trigger existed (otherwise name updates silently
-- match 0 rows and appear to do nothing).
-- Idempotent.
-- ============================================================

insert into public.profiles (id, email, role)
select u.id, u.email, 'student'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;