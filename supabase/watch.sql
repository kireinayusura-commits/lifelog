-- ============================================================
--  Kirimori — Apple Watch から操作するための追加
--
--  SQL Editor に全文を貼って実行してください。
--  何度実行しても安全です（作り直しではなく、無ければ作る形）。
--  先に schema.sql を実行しておくこと。
--
--  考え方：
--  Apple Watch には Kirimori を入れられない（PWA は動かない）。
--  そこで「ショートカット」アプリから、サーバーへ直接1回だけ
--  通信してもらう。サーバー側が記録を書けば、同期の仕組みが
--  そのまま働いて iPhone にもパソコンにも即座に届く。
--
--  ログインの代わりに「合鍵」を1本だけ使う。
--  メールとパスワードをショートカットに書かせないための仕組みで、
--  合鍵はアプリの設定画面からいつでも作り直せる（＝失効させられる）。
-- ============================================================

-- ------------------------------------------------------------
--  1. 合鍵の保管場所
-- ------------------------------------------------------------
create table if not exists public.watch_keys (
  -- 合鍵そのもの。英数字32文字（約160ビット）を想定
  key text primary key,

  user_id uuid not null references auth.users (id) on delete cascade,

  label text not null default 'Apple Watch',
  created_at timestamptz not null default now(),

  -- 最後に使われた時刻。身に覚えのない使用に気づけるよう記録する
  last_used_at timestamptz
);

create index if not exists watch_keys_user_idx on public.watch_keys (user_id);

alter table public.watch_keys enable row level security;

drop policy if exists "自分の合鍵だけ" on public.watch_keys;
create policy "自分の合鍵だけ"
  on public.watch_keys
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on public.watch_keys from anon;
grant select, insert, update, delete on public.watch_keys to authenticated;

-- ------------------------------------------------------------
--  2. 内部で使う道具
--
--  ここの関数は「持ち主の確認を済ませた状態」で呼ばれる前提なので、
--  外から直接呼べないように権限を取り上げる（revoke）。
--  取り上げても、下の公開関数の中からは呼べる。
--  security definer の中では、呼び出し元ではなく所有者の権限で動くため。
-- ------------------------------------------------------------

-- いまの時刻（ミリ秒）。アプリ側と同じ単位で揃える。
create or replace function public.watch_now_ms()
returns bigint
language sql
volatile
as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

revoke all on function public.watch_now_ms() from public;

-- 経過時間の日本語表記。Watch の小さな画面で読めるように短くする。
create or replace function public.watch_fmt_ms(ms bigint)
returns text
language sql
immutable
as $$
  select case
    when ms >= 3600000
      then (ms / 3600000)::text || '時間' || lpad(((ms % 3600000) / 60000)::text, 2, '0') || '分'
    when ms >= 60000
      then (ms / 60000)::text || '分' || lpad(((ms % 60000) / 1000)::text, 2, '0') || '秒'
    else (ms / 1000)::text || '秒'
  end
$$;

revoke all on function public.watch_fmt_ms(bigint) from public;

-- 合鍵から持ち主を割り出す。合わなければその場で止める。
create or replace function public.watch_user(k text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid;
  norm text;
begin
  norm := upper(btrim(coalesce(k, '')));

  -- 短い合鍵は総当たりに弱い。作られ方からして32文字あるはずなので、
  -- 短いものは照合する前に断る。
  if length(norm) < 24 then
    raise exception '合鍵が違います' using errcode = '28000';
  end if;

  select w.user_id into u from public.watch_keys w where w.key = norm;

  if u is null then
    -- 合っているかどうかで返事を変えない（どこまで合っているか悟らせない）
    raise exception '合鍵が違います' using errcode = '28000';
  end if;

  update public.watch_keys set last_used_at = now() where key = norm;
  return u;
end;
$$;

revoke all on function public.watch_user(text) from public;

-- 記録を1件書く。schema.sql の番人がそのまま効く
-- （古い内容は弾かれ、中身が同じならサーバー時刻は動かない）。
create or replace function public.watch_put(
  p_user uuid,
  p_kind text,
  p_id text,
  p_data jsonb,
  p_updated bigint,
  p_deleted bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.records (user_id, kind, id, data, updated_at, deleted_at)
  values (p_user, p_kind, p_id, p_data, p_updated, p_deleted)
  on conflict (user_id, kind, id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at,
        deleted_at = excluded.deleted_at;
end;
$$;

revoke all on function public.watch_put(uuid, text, text, jsonb, bigint, bigint) from public;

-- タグ名からタグのIDを引く。大文字小文字と前後の空白は無視する
-- （Watch の音声入力は表記が揺れるため）。
create or replace function public.watch_tag_id(p_user uuid, p_name text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.id
  from public.records r
  where r.user_id = p_user
    and r.kind = 'tags'
    and r.deleted_at is null
    and coalesce((r.data ->> 'archived')::boolean, false) = false
    and lower(btrim(r.data ->> 'name')) = lower(btrim(p_name))
  limit 1
$$;

revoke all on function public.watch_tag_id(uuid, text) from public;

-- タグIDから名前を引く（Watch に返す文面のため）
create or replace function public.watch_tag_name(p_user uuid, p_id text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.data ->> 'name'
  from public.records r
  where r.user_id = p_user and r.kind = 'tags' and r.id = p_id
  limit 1
$$;

revoke all on function public.watch_tag_name(uuid, text) from public;

-- ------------------------------------------------------------
--  3. ショートカットから呼ぶ関数
--
--  どれも合鍵を最初に確かめる。合鍵が無ければ何も起きない。
-- ------------------------------------------------------------

-- 使えるタグの名前を並べて返す。
-- purpose は 'money'（支出用）か 'time'（時間用）。
-- アプリのタグ絞り込みと同じ規則：グループに用途が設定されていれば従い、
-- グループに属さないタグはどちらでも使える。
create or replace function public.watch_tags(k text, purpose text default 'money')
returns json
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid;
  res json;
  want text;
begin
  u := public.watch_user(k);
  want := coalesce(nullif(btrim(purpose), ''), 'money');
  if want not in ('money', 'time', 'both') then
    want := 'money';
  end if;

  select coalesce(json_agg(s.nm order by s.ord, s.nm), '[]'::json)
    into res
  from (
    select
      r.data ->> 'name' as nm,
      coalesce((r.data ->> 'order')::numeric, 0) as ord
    from public.records r
    left join public.records g
      on g.user_id = r.user_id
     and g.kind = 'groups'
     and g.id = r.data ->> 'groupId'
     and g.deleted_at is null
    where r.user_id = u
      and r.kind = 'tags'
      and r.deleted_at is null
      and coalesce((r.data ->> 'archived')::boolean, false) = false
      and (
        want = 'both'
        or g.id is null                                       -- グループなし＝どちらでも使える
        or coalesce(g.data ->> 'scope', 'both') in ('both', want)
      )
  ) s;

  return res;
end;
$$;

revoke all on function public.watch_tags(text, text) from public;
grant execute on function public.watch_tags(text, text) to anon, authenticated;

-- いまの状態を返すだけ。何も書き換えないので、設定の確認に使える。
create or replace function public.watch_status(k text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid;
  t jsonb;
  del bigint;
  n bigint;
  elapsed bigint;
  nm text;
  today_sec bigint;
begin
  u := public.watch_user(k);
  n := public.watch_now_ms();

  select r.data, r.deleted_at into t, del
  from public.records r
  where r.user_id = u and r.kind = 'activeTimer' and r.id = 'active';

  select coalesce(sum((r.data ->> 'durationSec')::bigint), 0) into today_sec
  from public.records r
  where r.user_id = u
    and r.kind = 'sessions'
    and r.deleted_at is null
    and (r.data ->> 'startedAt')::bigint
        >= (extract(epoch from date_trunc('day', now())) * 1000)::bigint;

  if t is null or del is not null then
    return '計測していません（今日 ' || public.watch_fmt_ms(today_sec * 1000) || '）';
  end if;

  if coalesce((t ->> 'isPaused')::boolean, false) then
    elapsed := greatest(0, coalesce((t ->> 'accumulatedMs')::bigint, 0));
  else
    elapsed := greatest(
      0,
      coalesce((t ->> 'accumulatedMs')::bigint, 0) + (n - (t ->> 'segmentStartedAt')::bigint)
    );
  end if;

  nm := coalesce(public.watch_tag_name(u, t ->> 'tagId'), 'タグなし');
  return nm || ' ' || public.watch_fmt_ms(elapsed) || ' 計測中';
end;
$$;

revoke all on function public.watch_status(text) from public;
grant execute on function public.watch_status(text) to anon, authenticated;

-- 計測していれば止めて記録に残し、していなければ始める。
-- Watch ではボタンを1つにしたいので、押すたびに入れ替わる形にしてある。
--
-- tag を渡すとそのタグで始める。渡さなければ、直前の記録と同じタグを引き継ぐ
-- （同じことを続けてやることが多いので、たいてい当たる）。
create or replace function public.watch_toggle(k text, tag text default null)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid;
  t jsonb;
  del bigint;
  n bigint;
  elapsed bigint;
  ended bigint;
  dur bigint;
  tagid text;
  nm text;
begin
  u := public.watch_user(k);
  n := public.watch_now_ms();

  select r.data, r.deleted_at into t, del
  from public.records r
  where r.user_id = u and r.kind = 'activeTimer' and r.id = 'active';

  -- ---------------- 計測中 → 止めて記録する ----------------
  if t is not null and del is null then
    if coalesce((t ->> 'isPaused')::boolean, false) then
      elapsed := greatest(0, coalesce((t ->> 'accumulatedMs')::bigint, 0));
    else
      elapsed := greatest(
        0,
        coalesce((t ->> 'accumulatedMs')::bigint, 0) + (n - (t ->> 'segmentStartedAt')::bigint)
      );
    end if;

    ended := (t ->> 'originStartedAt')::bigint + elapsed;
    dur := round(elapsed / 1000.0);

    -- 行は消さず「停止した」と記す（アプリ側と同じ扱い）
    perform public.watch_put(u, 'activeTimer', 'active', t, n, n);

    if dur < 1 then
      return '短すぎたため記録しませんでした';
    end if;

    perform public.watch_put(
      u,
      'sessions',
      gen_random_uuid()::text,
      jsonb_build_object(
        'tagId', t -> 'tagId',
        'startedAt', (t ->> 'originStartedAt')::bigint,
        'endedAt', ended,
        'durationSec', dur,
        'memo', coalesce(t ->> 'memo', ''),
        'source', 'timer',
        'createdAt', n
      ),
      n,
      null
    );

    nm := coalesce(public.watch_tag_name(u, t ->> 'tagId'), 'タグなし');
    return nm || ' ' || public.watch_fmt_ms(elapsed) || ' を記録しました';
  end if;

  -- ---------------- 止まっている → 始める ----------------
  if tag is not null and btrim(tag) <> '' then
    tagid := public.watch_tag_id(u, tag);
  else
    -- 直前の記録と同じタグを引き継ぐ
    select r.data ->> 'tagId' into tagid
    from public.records r
    where r.user_id = u and r.kind = 'sessions' and r.deleted_at is null
    order by (r.data ->> 'startedAt')::bigint desc
    limit 1;
  end if;

  perform public.watch_put(
    u,
    'activeTimer',
    'active',
    jsonb_build_object(
      'tagId', tagid,
      'originStartedAt', n,
      'segmentStartedAt', n,
      'accumulatedMs', 0,
      'isPaused', false,
      'memo', '',
      -- どこから始めたかが分かるようにしておく。
      -- アプリ側はこの値を「画面のある端末」とは見なさない。
      'deviceId', 'apple-watch',
      'deviceName', 'Apple Watch',
      'createdAt', n
    ),
    n,
    null
  );

  nm := coalesce(public.watch_tag_name(u, tagid), 'タグなし');
  return nm || ' で開始しました';
end;
$$;

revoke all on function public.watch_toggle(text, text) from public;
grant execute on function public.watch_toggle(text, text) to anon, authenticated;

-- 支出を1件記録する。
-- tag はタグ名（watch_tags で取った一覧から選んだもの）。
-- name を省くと「Watchから記録」という名前が入る。あとで iPhone から直せる。
create or replace function public.watch_expense(
  k text,
  amount numeric,
  tag text default null,
  name text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  u uuid;
  n bigint;
  amt bigint;
  tagid text;
  nm text;
  label text;
begin
  u := public.watch_user(k);

  if amount is null or amount <= 0 then
    raise exception '金額を正しく入力してください' using errcode = '22023';
  end if;
  if amount >= 100000000 then
    raise exception '金額が大きすぎます' using errcode = '22023';
  end if;

  n := public.watch_now_ms();
  amt := round(amount);

  if tag is not null and btrim(tag) <> '' then
    tagid := public.watch_tag_id(u, tag);
  end if;

  label := coalesce(nullif(btrim(name), ''), 'Watchから記録');

  perform public.watch_put(
    u,
    'transactions',
    gen_random_uuid()::text,
    jsonb_build_object(
      'amount', amt,
      'type', 'expense',
      'tagId', tagid,
      'name', label,
      'occurredAt', n,
      'recurringId', null,
      'createdAt', n
    ),
    n,
    null
  );

  nm := coalesce(public.watch_tag_name(u, tagid), 'タグなし');
  return nm || ' ' || amt::text || '円 を記録しました';
end;
$$;

revoke all on function public.watch_expense(text, numeric, text, text) from public;
grant execute on function public.watch_expense(text, numeric, text, text) to anon, authenticated;

-- ------------------------------------------------------------
--  4. API の定義を読み直させる
--  （これが無いと、作ったばかりの関数が「見つからない」と言われることがある）
-- ------------------------------------------------------------
notify pgrst, 'reload schema';

-- ============================================================
--  合鍵を無くしたとき・他人に見られたかもしれないとき
--
--  アプリの 設定 → Apple Watch から操作 → 「作り直す」で失効します。
--  SQL から全部消す場合は下を実行してください。
--    delete from public.watch_keys;
-- ============================================================
