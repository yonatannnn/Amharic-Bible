-- =====================================================================
--  One-time seed: set the Yonatan ↔ Ephrata streak to 2 (through June 10,
--  2026). Ephrata has already shared today (June 11), so once Yonatan
--  shares today the streak ticks to 3.
--
--  Run ONCE in Supabase → SQL Editor (after migration_streak_v2.sql).
--  Adjust the two usernames below if they differ.
-- =====================================================================
do $$
declare
  v_yon uuid;
  v_eph uuid;
  v_fid uuid;
  v_eph_is_requester boolean;
begin
  select id into v_yon from profiles where lower(username) = 'yonatan';
  select id into v_eph from profiles where lower(username) = 'eph_25';
  if v_yon is null then raise exception 'username "yonatan" not found'; end if;
  if v_eph is null then raise exception 'username "eph_25" not found'; end if;

  select id, (requester_id = v_eph)
    into v_fid, v_eph_is_requester
  from friendships
  where status = 'accepted'
    and ((requester_id = v_yon and addressee_id = v_eph)
      or (requester_id = v_eph and addressee_id = v_yon))
  limit 1;
  if v_fid is null then raise exception 'accepted friendship between yonatan and eph_25 not found'; end if;

  insert into streaks (friendship_id, restore_period)
    values (v_fid, to_char(now(), 'YYYY-MM'))
    on conflict (friendship_id) do nothing;

  update streaks set
    count             = 2,
    longest           = greatest(longest, 2),
    broken            = false,
    broken_at         = null,
    last_increment_on = date '2026-06-10',
    -- not expired; today's exchange (June 11) will bump the count to 3
    window_deadline   = (date '2026-06-12' + time '11:00') at time zone 'Africa/Addis_Ababa',
    -- Ephrata already shared today; only Yonatan's share is needed for day 3
    requester_shared  = case when v_eph_is_requester then true  else false end,
    addressee_shared  = case when v_eph_is_requester then false else true  end,
    updated_at        = now()
  where friendship_id = v_fid;

  raise notice 'Seeded streak for friendship %, ephrata is requester = %', v_fid, v_eph_is_requester;
end $$;
