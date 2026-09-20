-- Supabase の土台だけを真似たもの。
-- 本物の Supabase に接続できない環境で schema.sql / watch.sql を
-- そのまま動かして確かめるために使う。
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- 未ログイン扱い。RLS の確認は別途 set role で行う。
create or replace function auth.uid() returns uuid
language sql stable as $$ select null::uuid $$;

create publication supabase_realtime;

grant usage on schema public to anon, authenticated, service_role;
