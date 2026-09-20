#!/usr/bin/env bash
# 本物の PostgreSQL に schema.sql と watch.sql をそのまま入れて検証する。
#
# Supabase には接続できない環境なので、Supabase の土台（auth スキーマ・
# anon / authenticated ロール・realtime のパブリケーション）だけを
# stub.sql で真似て、SQL 自体は1文字も変えずに動かしている。
set -euo pipefail
cd "$(dirname "$0")/../.."

PORT=${PGPORT:-5433}
DB=kirimori_test
export PGHOST=127.0.0.1 PGPORT=$PORT PGUSER=postgres

psql -q -c "drop database if exists $DB" postgres
psql -q -c "create database $DB" postgres
psql -q -d $DB -f test/pg/stub.sql

echo "--- schema.sql ---"
psql -q -v ON_ERROR_STOP=1 -d $DB -f supabase/schema.sql
echo "--- watch.sql ---"
psql -q -v ON_ERROR_STOP=1 -d $DB -f supabase/watch.sql

psql -q -d $DB -c "select 1" > /dev/null
psql -X -q -d $DB -f test/pg/watch.test.sql 2>&1 |
  grep -v '^NOTICE:  ' |
  sed -e 's/^WARNING:  //' -e 's/^NOTICE: //'

# 書かれた記録を JSON に出す。アプリ側が読めるかを node 側で確かめる。
psql -X -A -t -d $DB -o test/pg/records.json -c "
  select coalesce(json_agg(json_build_object(
           'kind', kind, 'id', id, 'data', data,
           'updated_at', updated_at, 'deleted_at', deleted_at,
           'server_updated_at', to_char(server_updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US')
         ) order by server_updated_at), '[]'::json)
  from public.records
  where user_id = '11111111-1111-4111-8111-111111111111'"
echo "records -> test/pg/records.json"
