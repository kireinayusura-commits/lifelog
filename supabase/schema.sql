-- ============================================================
--  Kirimori — 同期用スキーマ
--  Supabase の SQL Editor に全文を貼って実行してください。
--  何度実行しても安全です（作り直しではなく、無ければ作る形）。
-- ============================================================

-- ------------------------------------------------------------
--  1. 記録を入れるテーブル
--
--  タグも記録も支出も、すべてこの1テーブルに入れる。
--  中身は data (JSON) にまるごと入れ、種類は kind で分ける。
--
--  こうしている理由：アプリ側でフィールドを足すたびに
--  SQL を書き換えて実行し直す、という作業が要らなくなるため。
--  スキーマ変更はアプリの中だけで完結する。
-- ------------------------------------------------------------
create table if not exists public.records (
  -- 持ち主。ログインした本人以外は触れない（下の規則で保証する）
  user_id uuid not null references auth.users (id) on delete cascade,

  -- 'tags' / 'groups' / 'sessions' / 'transactions' / 'recurring'
  -- / 'settings' / 'activeTimer'
  kind text not null,

  -- アプリ側のID（UUID、または 'settings' のような固定値）
  id text not null,

  -- レコードの中身まるごと
  data jsonb not null,

  -- 端末側で記録した更新時刻（ミリ秒）。どちらを残すかの判断に使う
  updated_at bigint not null,

  -- 削除は行を消さず、ここに時刻を入れる（消したことも同期するため）
  deleted_at bigint,

  -- サーバー側の更新時刻。端末の時計がずれていても
  -- 「前回取得した続きから」を正しく辿れるようにするため、
  -- 端末の時刻とは別にサーバーが自分で刻む
  server_updated_at timestamptz not null default now(),

  primary key (user_id, kind, id)
);

-- 「前回の続きから取得する」ための索引
create index if not exists records_pull_idx
  on public.records (user_id, server_updated_at);

-- ------------------------------------------------------------
--  2. 書き込み時の番人
--
--  2つの役目がある。
--
--  (a) 古い書き込みを弾く
--      端末Aの古い内容が、端末Bの新しい内容を上書きしないようにする。
--
--  (b) 中身が変わっていないときは server_updated_at を動かさない
--      これが無いと、端末Aが取得した行をそのまま送り返す
--      → サーバーの時刻が進む → 端末Bが取得して送り返す …と
--      2台のあいだで永久に往復し続けてしまう。
-- ------------------------------------------------------------
create or replace function public.records_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    -- (a) 手元の方が新しければ、届いた古い内容は捨てる
    if new.updated_at < old.updated_at then
      return old;
    end if;

    -- (b) 中身が同じなら、サーバーの時刻は据え置く
    if new.data is not distinct from old.data
       and new.updated_at is not distinct from old.updated_at
       and new.deleted_at is not distinct from old.deleted_at then
      new.server_updated_at := old.server_updated_at;
      return new;
    end if;
  end if;

  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists records_guard_trigger on public.records;
create trigger records_guard_trigger
  before insert or update on public.records
  for each row execute function public.records_guard();

-- ------------------------------------------------------------
--  3. 行レベルセキュリティ（ここが最重要）
--
--  anon キーは公開リポジトリに載るが、この規則があるため
--  ログインした本人の行しか読み書きできない。
--  ログインしていない人には、1行も見えない。
-- ------------------------------------------------------------
alter table public.records enable row level security;

drop policy if exists "自分の記録だけ" on public.records;
create policy "自分の記録だけ"
  on public.records
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 念のため、未ログインからの権限を明示的に取り上げる
revoke all on public.records from anon;
grant select, insert, update, delete on public.records to authenticated;

-- ============================================================
--  確認用：下を実行して結果が空なら、未ログインからは読めていない
--    select * from public.records;
--  （SQL Editor は管理者権限で動くため、ここでは見えます。
--    本当の確認は README の手順で行ってください）
-- ============================================================
