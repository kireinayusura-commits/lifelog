/**
 * Supabase の接続先。
 *
 * この2つは公開されて問題ない値。Supabase はクライアントに
 * 埋め込む前提で設計していて、実際の防御は行レベルセキュリティ（RLS）が
 * 担っている（supabase/schema.sql を参照）。
 *
 * service_role キーは絶対にここに書かないこと。
 * あちらは全権限を持つ鍵で、公開リポジトリに載せると
 * 誰でもデータを読み書き・全消しできる。
 */
export const SUPABASE_URL = 'https://kgijucaaxihcvaowueoo.supabase.co'

export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnaWp1Y2FheGloY3Zhb3d1ZW9vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4ODY2MzYsImV4cCI6MjEwNTQ2MjYzNn0.vQZhramAKIIDkci0qbVmR-aZqSXHqeGRFXaUvsDhe-s'

/** 同期の対象にするテーブル。syncState は端末ごとの情報なので含めない。 */
export const SYNCED_KINDS = [
  'groups',
  'tags',
  'sessions',
  'transactions',
  'recurring',
  'settings',
  'activeTimer',
] as const

export type SyncKind = (typeof SYNCED_KINDS)[number]
