-- =====================================================================
--  Allow a user to delete a friendship they're part of — needed to
--  CANCEL a sent request (and to unfriend later).
--  Run in Supabase → SQL Editor. Safe to re-run.
-- =====================================================================

drop policy if exists friendships_delete on friendships;
create policy friendships_delete on friendships
  for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
