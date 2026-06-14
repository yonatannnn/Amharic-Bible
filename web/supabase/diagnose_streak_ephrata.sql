-- =====================================================================
--  Diagnose the Yonatan <-> Ephrata streak reset.
--  Run in Supabase -> SQL Editor. All timestamps shown in EAT (Addis).
-- =====================================================================
with f as (
  select fr.id, fr.requester_id, fr.addressee_id
  from friendships fr
  join profiles py on py.id = fr.requester_id  or py.id = fr.addressee_id
  where fr.status = 'accepted'
    and exists (select 1 from profiles a where a.id in (fr.requester_id,fr.addressee_id) and lower(a.username)='yonatan')
    and exists (select 1 from profiles b where b.id in (fr.requester_id,fr.addressee_id) and lower(b.username)='eph_25')
  limit 1
)
-- 1) the streak row, times in EAT
select 'STREAK ROW' as section,
       s.count, s.longest, s.broken,
       s.broken_at      at time zone 'Africa/Addis_Ababa' as broken_at_eat,
       s.window_deadline at time zone 'Africa/Addis_Ababa' as deadline_eat,
       s.last_increment_on,
       s.requester_shared, s.addressee_shared,
       s.last_share_at   at time zone 'Africa/Addis_Ababa' as last_share_eat,
       s.restores_remaining,
       now()             at time zone 'Africa/Addis_Ababa' as now_eat
from streaks s join f on f.id = s.friendship_id;

-- 2) last 15 VERSE shares with sender + EAT time + which streak-day they fall on
select 'VERSE MESSAGES' as section,
       p.username as sender,
       m.created_at at time zone 'Africa/Addis_Ababa'              as sent_eat,
       ((m.created_at at time zone 'Africa/Addis_Ababa') - interval '6 hours')::date as streak_day,
       m.book, m.chapter, m.verse_start, m.verse_end
from messages m
join f on f.id = m.friendship_id
join profiles p on p.id = m.sender_id
where m.type = 'verse'
order by m.created_at desc
limit 15;

-- 3) confirm WHICH version of the function is live (look for '6 hours'/'11:00' = v2)
select 'FUNCTION SRC' as section,
       case when prosrc like '%interval ''6 hours''%' then 'v2 (6AM/11AM)'
            when prosrc like '%24 hours%'             then 'old (24h rolling)'
            else 'unknown' end as deployed_version
from pg_proc where proname = 'register_verse_share';
