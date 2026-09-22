-- ============================================================
-- Migration: allow teachers to delete the events they created
-- Idempotent: safe to run on the linked project.
-- ============================================================

drop policy if exists "Users can delete their own events" on public.events;
create policy "Users can delete their own events"
  on public.events for delete
  using (auth.uid() = created_by);