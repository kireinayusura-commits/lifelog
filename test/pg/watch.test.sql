-- Apple Watch 用の関数の検証。
-- 本物の PostgreSQL に schema.sql と watch.sql をそのまま入れて動かす。
--   test/pg/run.sh で実行する。

\set ON_ERROR_STOP on
\pset pager off

create table t_results (label text, ok boolean);
grant all on t_results to public;  -- anon からの検証でも記録できるように

create or replace function t_check(label text, ok boolean, detail text default '')
returns void language plpgsql as $$
begin
  raise notice '%', (case when ok then '  OK  ' else '  NG  ' end)
    || label || case when coalesce(detail, '') <> '' then ' — ' || detail else '' end;
  insert into t_results values (label, ok);
end $$;

-- ---------------------------------------------------------------- 下ごしらえ
insert into auth.users (id, email) values
  ('11111111-1111-4111-8111-111111111111', 'me@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'other@example.com');

-- 「勉強」グループ＝時間だけ、「生活」グループ＝お金だけ、グループ無しのタグ
insert into public.records (user_id, kind, id, data, updated_at, deleted_at) values
  ('11111111-1111-4111-8111-111111111111', 'groups', 'g-time',
   '{"name":"勉強","color":"#3355D1","order":0,"scope":"time","createdAt":1}', 1000, null),
  ('11111111-1111-4111-8111-111111111111', 'groups', 'g-money',
   '{"name":"生活","color":"#C55A14","order":1,"scope":"money","createdAt":1}', 1000, null),
  ('11111111-1111-4111-8111-111111111111', 'tags', 'tag-eng',
   '{"name":"英語","groupId":"g-time","color":"#3355D1","archived":false,"order":0,"createdAt":1}', 1000, null),
  ('11111111-1111-4111-8111-111111111111', 'tags', 'tag-food',
   '{"name":"食費","groupId":"g-money","color":"#C55A14","archived":false,"order":1,"createdAt":1}', 1000, null),
  ('11111111-1111-4111-8111-111111111111', 'tags', 'tag-free',
   '{"name":"雑費","groupId":null,"color":"#0D8FA3","archived":false,"order":2,"createdAt":1}', 1000, null),
  ('11111111-1111-4111-8111-111111111111', 'tags', 'tag-old',
   '{"name":"使わない","groupId":null,"color":"#B83A3A","archived":true,"order":3,"createdAt":1}', 1000, null),
  ('11111111-1111-4111-8111-111111111111', 'tags', 'tag-gone',
   '{"name":"消した","groupId":null,"color":"#B83A3A","archived":false,"order":4,"createdAt":1}', 1000, 1500);

insert into public.watch_keys (key, user_id) values
  ('ABCDEFGH23456789ABCDEFGH23456789', '11111111-1111-4111-8111-111111111111'),
  ('ZZZZZZZZ23456789ZZZZZZZZ23456789', '22222222-2222-4222-8222-222222222222');

\echo ''
\echo '【1】合鍵が違えば、何もできないか'
do $$
declare msg text;
begin
  begin
    perform public.watch_status('WRONGKEY23456789WRONGKEY23456789');
    perform t_check('間違った合鍵は弾かれる', false, '通ってしまった');
  exception when others then
    msg := SQLERRM;
    perform t_check('間違った合鍵は弾かれる', msg = '合鍵が違います', msg);
  end;

  begin
    perform public.watch_status('short');
    perform t_check('短い合鍵は照合する前に断る', false, '通ってしまった');
  exception when others then
    perform t_check('短い合鍵は照合する前に断る', SQLERRM = '合鍵が違います', SQLERRM);
  end;

  begin
    perform public.watch_status(null);
    perform t_check('合鍵なしも断る', false, '通ってしまった');
  exception when others then
    perform t_check('合鍵なしも断る', SQLERRM = '合鍵が違います', SQLERRM);
  end;
end $$;

\echo ''
\echo '【2】状態を見る（何も書き換えないこと）'
do $$
declare s text; before bigint; after bigint;
begin
  select count(*) into before from public.records;
  s := public.watch_status('ABCDEFGH23456789ABCDEFGH23456789');
  select count(*) into after from public.records;
  perform t_check('計測していないと分かる', s like '計測していません%', s);
  perform t_check('状態を見るだけでは記録が増えない', before = after);
  perform t_check('使った時刻が残る',
    (select last_used_at is not null from public.watch_keys
      where key = 'ABCDEFGH23456789ABCDEFGH23456789'));
end $$;

\echo ''
\echo '【3】タグの一覧が、アプリの絞り込みと同じか'
do $$
declare m json; t json;
begin
  m := public.watch_tags('ABCDEFGH23456789ABCDEFGH23456789', 'money');
  t := public.watch_tags('ABCDEFGH23456789ABCDEFGH23456789', 'time');
  perform t_check('支出用は「食費・雑費」', m::text = '["食費", "雑費"]', m::text);
  perform t_check('時間用は「英語・雑費」', t::text = '["英語", "雑費"]', t::text);
  perform t_check('アーカイブ済みは出ない', m::text not like '%使わない%');
  perform t_check('削除済みは出ない', m::text not like '%消した%');
end $$;

\echo ''
\echo '【4】1つのボタンで開始できるか'
do $$
declare s text; d jsonb;
begin
  s := public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');
  perform t_check('開始したと返る', s like '%で開始しました', s);

  select data into d from public.records
   where kind = 'activeTimer' and id = 'active'
     and user_id = '11111111-1111-4111-8111-111111111111';
  perform t_check('Apple Watch から始めたと分かる', d ->> 'deviceId' = 'apple-watch', d ->> 'deviceId');
  perform t_check('一時停止ではない', (d ->> 'isPaused')::boolean = false);
  perform t_check('経過はゼロから', (d ->> 'accumulatedMs')::bigint = 0);
  perform t_check('アプリと同じ項目がそろっている',
    d ?& array['tagId','originStartedAt','segmentStartedAt','accumulatedMs','isPaused','memo','deviceId','deviceName','createdAt'],
    (select string_agg(kk, ',') from jsonb_object_keys(d) kk));
end $$;

\echo ''
\echo '【5】もう一度押すと、止まって記録になるか'
do $$
declare s text; sess record; n bigint;
begin
  -- 90秒前に始めたことにする
  n := public.watch_now_ms();
  update public.records
     set data = data || jsonb_build_object(
           'originStartedAt', n - 90000,
           'segmentStartedAt', n - 90000,
           'tagId', 'tag-eng')
   where kind = 'activeTimer' and id = 'active';

  s := public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');
  perform t_check('記録したと返る', s like '英語 1分30秒 を記録しました', s);

  perform t_check('計測は停止済みになった',
    (select deleted_at is not null from public.records
      where kind = 'activeTimer' and id = 'active'));

  select * into sess from public.records
   where kind = 'sessions' and user_id = '11111111-1111-4111-8111-111111111111'
   order by updated_at desc limit 1;

  perform t_check('記録が1件できた', sess.id is not null);
  perform t_check('長さが正しい（90秒）', (sess.data ->> 'durationSec')::bigint = 90,
    sess.data ->> 'durationSec');
  perform t_check('タグが引き継がれた', sess.data ->> 'tagId' = 'tag-eng', sess.data ->> 'tagId');
  perform t_check('タイマー由来と記録された', sess.data ->> 'source' = 'timer');
  perform t_check('アプリと同じ項目がそろっている',
    sess.data ?& array['tagId','startedAt','endedAt','durationSec','memo','source','createdAt'],
    (select string_agg(kk, ',') from jsonb_object_keys(sess.data) kk));
  perform t_check('余計な項目が入っていない',
    not (sess.data ?| array['id','updatedAt','deletedAt']));
end $$;

\echo ''
\echo '【6】次に始めるとき、直前のタグを引き継ぐか'
do $$
declare s text; d jsonb;
begin
  s := public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');
  perform t_check('直前と同じ「英語」で始まる', s = '英語 で開始しました', s);

  -- タグを指定した場合はそちらが優先される
  perform public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789'); -- いったん止める
  s := public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789', ' えいご ');
  perform t_check('知らないタグ名ならタグなしで始まる', s = 'タグなし で開始しました', s);
  perform public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');

  s := public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789', ' 英語 ');
  perform t_check('前後の空白は無視される', s = '英語 で開始しました', s);

  select data into d from public.records where kind = 'activeTimer' and id = 'active';
  perform t_check('指定したタグが入っている', d ->> 'tagId' = 'tag-eng', d ->> 'tagId');
  perform public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');
end $$;

\echo ''
\echo '【7】1秒未満は記録しないか'
do $$
declare s text; before bigint; after bigint;
begin
  select count(*) into before from public.records where kind = 'sessions';
  perform public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');
  s := public.watch_toggle('ABCDEFGH23456789ABCDEFGH23456789');
  select count(*) into after from public.records where kind = 'sessions';
  perform t_check('短すぎると伝える', s = '短すぎたため記録しませんでした', s);
  perform t_check('記録は増えない', before = after, (after - before)::text || '件増えた');
  perform t_check('それでも計測は止まっている',
    (select deleted_at is not null from public.records where kind = 'activeTimer' and id = 'active'));
end $$;

\echo ''
\echo '【8】支出が記録できるか'
do $$
declare s text; tx record;
begin
  s := public.watch_expense('ABCDEFGH23456789ABCDEFGH23456789', 680, '食費');
  perform t_check('記録したと返る', s = '食費 680円 を記録しました', s);

  select * into tx from public.records
   where kind = 'transactions' and user_id = '11111111-1111-4111-8111-111111111111'
   order by updated_at desc limit 1;

  perform t_check('金額が正しい', (tx.data ->> 'amount')::bigint = 680);
  perform t_check('支出として入る', tx.data ->> 'type' = 'expense');
  perform t_check('タグが付く', tx.data ->> 'tagId' = 'tag-food', tx.data ->> 'tagId');
  perform t_check('名前は既定のもの', tx.data ->> 'name' = 'Watchから記録', tx.data ->> 'name');
  perform t_check('固定費ではない', tx.data ->> 'recurringId' is null);
  perform t_check('アプリと同じ項目がそろっている',
    tx.data ?& array['amount','type','tagId','name','occurredAt','recurringId','createdAt'],
    (select string_agg(kk, ',') from jsonb_object_keys(tx.data) kk));

  s := public.watch_expense('ABCDEFGH23456789ABCDEFGH23456789', 1200.6, null, ' 昼食 ');
  select * into tx from public.records
   where kind = 'transactions' and user_id = '11111111-1111-4111-8111-111111111111'
   order by updated_at desc limit 1;
  perform t_check('小数は四捨五入される', (tx.data ->> 'amount')::bigint = 1201,
    tx.data ->> 'amount');
  perform t_check('名前を渡せる', tx.data ->> 'name' = '昼食', tx.data ->> 'name');
  perform t_check('タグ無しでも記録できる', tx.data ->> 'tagId' is null);
end $$;

\echo ''
\echo '【9】おかしな金額は断るか'
do $$
begin
  begin
    perform public.watch_expense('ABCDEFGH23456789ABCDEFGH23456789', 0, null);
    perform t_check('0円は断る', false, '通ってしまった');
  exception when others then
    perform t_check('0円は断る', SQLERRM = '金額を正しく入力してください', SQLERRM);
  end;
  begin
    perform public.watch_expense('ABCDEFGH23456789ABCDEFGH23456789', -500, null);
    perform t_check('マイナスは断る', false, '通ってしまった');
  exception when others then
    perform t_check('マイナスは断る', SQLERRM = '金額を正しく入力してください', SQLERRM);
  end;
  begin
    perform public.watch_expense('ABCDEFGH23456789ABCDEFGH23456789', 999999999, null);
    perform t_check('桁を間違えたら断る', false, '通ってしまった');
  exception when others then
    perform t_check('桁を間違えたら断る', SQLERRM = '金額が大きすぎます', SQLERRM);
  end;
end $$;

\echo ''
\echo '【10】他人の記録に手が届かないか（ここが最重要）'
do $$
declare mine bigint; theirs bigint;
begin
  -- 別の利用者の合鍵で操作しても、自分の記録は一切動かない
  select count(*) into mine from public.records
   where user_id = '11111111-1111-4111-8111-111111111111';
  perform public.watch_expense('ZZZZZZZZ23456789ZZZZZZZZ23456789', 999, null);
  select count(*) into theirs from public.records
   where user_id = '11111111-1111-4111-8111-111111111111';
  perform t_check('他人の合鍵では自分の記録は増えない', mine = theirs);
  perform t_check('書き込みは相手側に入っている',
    (select count(*) from public.records
      where user_id = '22222222-2222-4222-8222-222222222222'
        and kind = 'transactions') = 1);
end $$;

\echo ''
\echo '【11】未ログイン（anon）から、どこまで触れるか'
set role anon;
do $$
declare s text;
begin
  -- 合鍵があれば、ショートカット用の関数だけは使える（これが狙いどおり）
  s := public.watch_status('ABCDEFGH23456789ABCDEFGH23456789');
  perform t_check('合鍵があれば anon でも使える', s like '%', s);
exception when others then
  perform t_check('合鍵があれば anon でも使える', false, SQLERRM);
end $$;

do $$
begin
  begin
    perform public.watch_put('11111111-1111-4111-8111-111111111111', 'transactions', 'evil',
      '{"amount":1}'::jsonb, 9, null);
    perform t_check('内部の書き込み関数は anon から呼べない', false, '呼べてしまった');
  exception when insufficient_privilege then
    perform t_check('内部の書き込み関数は anon から呼べない', true);
  when others then
    perform t_check('内部の書き込み関数は anon から呼べない', false, SQLERRM);
  end;

  begin
    perform public.watch_user('ABCDEFGH23456789ABCDEFGH23456789');
    perform t_check('合鍵の照合関数も anon から呼べない', false, '呼べてしまった');
  exception when insufficient_privilege then
    perform t_check('合鍵の照合関数も anon から呼べない', true);
  when others then
    perform t_check('合鍵の照合関数も anon から呼べない', false, SQLERRM);
  end;

  begin
    perform count(*) from public.watch_keys;
    perform t_check('合鍵の一覧は anon から読めない', false, '読めてしまった');
  exception when insufficient_privilege then
    perform t_check('合鍵の一覧は anon から読めない', true);
  when others then
    perform t_check('合鍵の一覧は anon から読めない', false, SQLERRM);
  end;

  begin
    perform count(*) from public.records;
    perform t_check('記録も anon から読めない', false, '読めてしまった');
  exception when insufficient_privilege then
    perform t_check('記録も anon から読めない', true);
  when others then
    perform t_check('記録も anon から読めない', false, SQLERRM);
  end;
end $$;
reset role;

\echo ''
\echo '【12】ログイン中の利用者は、自分の合鍵だけを扱えるか'
set role authenticated;
do $$
declare seen bigint;
begin
  -- auth.uid() は null（未ログイン相当）なので、RLS で1件も見えないのが正しい
  select count(*) into seen from public.watch_keys;
  perform t_check('本人でなければ合鍵は1件も見えない', seen = 0, seen::text || '件見えた');
end $$;
reset role;

\echo ''
select case
         when count(*) filter (where not ok) > 0
           then '❌ ' || count(*) filter (where not ok)::text || '件 失敗: '
                || string_agg(label, ' / ') filter (where not ok)
         when count(*) < 40 then '❌ 検証が途中で止まっています（' || count(*)::text || '件しか走っていない）'
         else '✅ SQL ' || count(*)::text || '項目すべて通過'
       end as result
from t_results;
