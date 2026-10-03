-- ============================================================================
--  Migrate stored references to the EOTC 81-book edition (am-2000).
--
--  Book numbers 1-66 still mean the same books, so nothing needs to move for
--  them. Two things DO change and are fixed here:
--
--   1. PSALMS (book 19) switch from Masoretic to Septuagint numbering.
--      LXX 9   = MT 9 + MT 10          (so MT 10:v -> LXX 9:v+20)
--      LXX n   = MT n+1                for MT 11-113 and MT 117-146
--      LXX 113 = MT 114 + MT 115       (so MT 115:v -> LXX 113:v+8)
--      MT 116  splits into LXX 114 (v1-9) and LXX 115 (v10-19)
--      MT 147  splits into LXX 146 (v1-11) and LXX 147 (v12-20)
--      MT 1-8 and 148-150 are unchanged. LXX 151 is new.
--
--   2. PROVERBS 25-31 are no longer part of Proverbs. In this canon Proverbs
--      ends at chapter 24 and that material is መጽሐፈ ተግሣጽ / Book of
--      Admonition = book 78, chapters 1-6.
--      Pro 25->78:1, 26->78:2, 27->78:3, 28->78:4, 29->78:5, 31:10-31->78:6.
--      Proverbs 30 and 31:1-9 have no chapter of their own in this edition;
--      those rows are left untouched and reported at the end.
--
--  RUN INSIDE A TRANSACTION AND CHECK THE REPORT BEFORE COMMITTING.
--  Take a backup first:  supabase db dump -f pre-eotc81.sql
-- ============================================================================

begin;

-- ---------------------------------------------------------------- helpers --

create or replace function mt_to_lxx_psalm(mt_ch int, mt_v int)
returns table (ch int, v int)
language plpgsql immutable as $$
begin
  if mt_ch between 1 and 9 then          ch := mt_ch;     v := mt_v;
  elsif mt_ch = 10 then                  ch := 9;         v := mt_v + 20;
  elsif mt_ch between 11 and 113 then    ch := mt_ch - 1; v := mt_v;
  elsif mt_ch = 114 then                 ch := 113;       v := mt_v;
  elsif mt_ch = 115 then                 ch := 113;       v := mt_v + 8;
  elsif mt_ch = 116 then
    if mt_v <= 9 then                    ch := 114;       v := mt_v;
    else                                 ch := 115;       v := mt_v - 9;  end if;
  elsif mt_ch between 117 and 146 then   ch := mt_ch - 1; v := mt_v;
  elsif mt_ch = 147 then
    if mt_v <= 11 then                   ch := 146;       v := mt_v;
    else                                 ch := 147;       v := mt_v - 11; end if;
  else                                   ch := mt_ch;     v := mt_v;      end if;

  -- MT 72:20 and MT 136:26 are colophons the LXX does not carry as a separate
  -- verse; clamp them onto the last verse of the target psalm.
  if ch = 71  and v > 19 then v := 19; end if;
  if ch = 135 and v > 25 then v := 25; end if;
  return next;
end $$;

-- Chapter-only rows: map as if the reference were verse 1.
create or replace function mt_to_lxx_chapter(mt_ch int)
returns int language sql immutable as $$
  select ch from mt_to_lxx_psalm(mt_ch, 1);
$$;

-- ------------------------------------------------------- 1. PSALMS: verses --

update saved_verses s set
  chapter     = (select ch from mt_to_lxx_psalm(s.chapter, s.verse_start)),
  verse_start = (select v  from mt_to_lxx_psalm(s.chapter, s.verse_start)),
  verse_end   = (select v  from mt_to_lxx_psalm(s.chapter, s.verse_end))
where s.book = 19;

update messages m set
  chapter     = (select ch from mt_to_lxx_psalm(m.chapter, m.verse_start)),
  verse_start = (select v  from mt_to_lxx_psalm(m.chapter, m.verse_start)),
  verse_end   = (select v  from mt_to_lxx_psalm(m.chapter, m.verse_end))
where m.book = 19 and m.chapter is not null and m.verse_start is not null;

update group_messages g set
  chapter     = (select ch from mt_to_lxx_psalm(g.chapter, g.verse_start)),
  verse_start = (select v  from mt_to_lxx_psalm(g.chapter, g.verse_start)),
  verse_end   = (select v  from mt_to_lxx_psalm(g.chapter, g.verse_end))
where g.book = 19 and g.chapter is not null and g.verse_start is not null;

update telegram_queue t set
  chapter = (select ch from mt_to_lxx_psalm(t.chapter, t.verse)),
  verse   = (select v  from mt_to_lxx_psalm(t.chapter, t.verse))
where t.book = 19;

update verse_history h set
  chapter = (select ch from mt_to_lxx_psalm(h.chapter, h.verse)),
  verse   = (select v  from mt_to_lxx_psalm(h.chapter, h.verse))
where h.book = 19;

update daily_verse_override o set
  chapter = (select ch from mt_to_lxx_psalm(o.chapter, o.verse)),
  verse   = (select v  from mt_to_lxx_psalm(o.chapter, o.verse))
where o.book = 19;

-- ------------------------------------------------ 2. PSALMS: chapter-only --

update reading_progress set chapter = mt_to_lxx_chapter(chapter) where book = 19;
update daily_chapter     set chapter = mt_to_lxx_chapter(chapter) where book = 19;
update reading_plan      set start_chapter = mt_to_lxx_chapter(start_chapter)
  where start_book = 19;

-- ------------------------------------------------ 3. PSALMS: the jsonb pool --

update daily_verse_pool p set refs = (
  select jsonb_agg(
    case when (r->>'book')::int = 19
      then jsonb_build_object(
             'book', 19,
             'chapter', (select ch from mt_to_lxx_psalm((r->>'chapter')::int, (r->>'verse')::int)),
             'verse',   (select v  from mt_to_lxx_psalm((r->>'chapter')::int, (r->>'verse')::int)))
      else r end
    order by ord)
  from jsonb_array_elements(p.refs) with ordinality as t(r, ord)
)
where p.refs @> '[{"book": 19}]';

-- ------------------------------------- 4. PROVERBS 25-29, 31:10-31 -> book 78 --

-- Chapters 25-29 map straight across to Admonition 1-5.
update saved_verses   set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update messages       set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update group_messages set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update telegram_queue set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update verse_history  set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update daily_verse_override set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update reading_progress set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update daily_chapter    set book = 78, chapter = chapter - 24 where book = 20 and chapter between 25 and 29;
update reading_plan     set start_book = 78, start_chapter = start_chapter - 24
  where start_book = 20 and start_chapter between 25 and 29;

-- Chapter 31 verses 10-31 become Admonition 6 verses 1-22.
update saved_verses set book = 78, chapter = 6, verse_start = verse_start - 9, verse_end = verse_end - 9
  where book = 20 and chapter = 31 and verse_start >= 10;
update messages set book = 78, chapter = 6, verse_start = verse_start - 9, verse_end = verse_end - 9
  where book = 20 and chapter = 31 and verse_start >= 10;
update group_messages set book = 78, chapter = 6, verse_start = verse_start - 9, verse_end = verse_end - 9
  where book = 20 and chapter = 31 and verse_start >= 10;
update telegram_queue set book = 78, chapter = 6, verse = verse - 9
  where book = 20 and chapter = 31 and verse >= 10;
update verse_history set book = 78, chapter = 6, verse = verse - 9
  where book = 20 and chapter = 31 and verse >= 10;
update daily_verse_override set book = 78, chapter = 6, verse = verse - 9
  where book = 20 and chapter = 31 and verse >= 10;

update daily_verse_pool p set refs = (
  select jsonb_agg(
    case when (r->>'book')::int = 20 and (r->>'chapter')::int between 25 and 29
           then jsonb_set(jsonb_set(r, '{book}', '78'), '{chapter}',
                          to_jsonb((r->>'chapter')::int - 24))
         when (r->>'book')::int = 20 and (r->>'chapter')::int = 31 and (r->>'verse')::int >= 10
           then jsonb_set(jsonb_set(jsonb_set(r, '{book}', '78'), '{chapter}', '6'),
                          '{verse}', to_jsonb((r->>'verse')::int - 9))
      else r end
    order by ord)
  from jsonb_array_elements(p.refs) with ordinality as t(r, ord)
)
where p.refs @> '[{"book": 20}]';

-- ------------------------------------------------------------- 5. report --

-- Rows that could NOT be moved: Proverbs 30 and 31:1-9 have no home in this
-- edition (that material sits inside the 81-verse Proverbs 24). Review these
-- by hand; they will render as "chapter not found" until repointed.
select 'saved_verses'  as tbl, count(*) from saved_verses  where book = 20 and (chapter = 30 or (chapter = 31 and verse_start < 10))
union all select 'messages',       count(*) from messages        where book = 20 and (chapter = 30 or (chapter = 31 and verse_start < 10))
union all select 'group_messages', count(*) from group_messages  where book = 20 and (chapter = 30 or (chapter = 31 and verse_start < 10))
union all select 'telegram_queue', count(*) from telegram_queue  where book = 20 and (chapter = 30 or (chapter = 31 and verse < 10))
union all select 'verse_history',  count(*) from verse_history   where book = 20 and (chapter = 30 or (chapter = 31 and verse < 10))
union all select 'reading_progress', count(*) from reading_progress where book = 20 and chapter in (30, 31)
union all select 'daily_chapter',  count(*) from daily_chapter   where book = 20 and chapter in (30, 31)
union all select 'reading_plan',   count(*) from reading_plan    where start_book = 20 and start_chapter in (30, 31);

-- Sanity: no reference should now point past the end of its chapter.
-- (Run the app's /read page on a few saved verses before committing.)

-- commit;    -- <= uncomment once the report above looks right
-- rollback;
