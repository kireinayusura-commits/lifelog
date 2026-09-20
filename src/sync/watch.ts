/**
 * Apple Watch から操作するための「合鍵」。
 *
 * Watch には Kirimori を入れられない（PWA が動かない）。
 * そこで「ショートカット」アプリからサーバーへ直接1回通信してもらい、
 * サーバー側で記録を書く。書かれた記録は同期の仕組みでそのまま
 * iPhone にもパソコンにも届く。
 *
 * ショートカットにメールとパスワードを書かせたくないので、
 * 代わりに合鍵を1本だけ持たせる。合鍵はここで作り直せる（＝失効させられる）。
 *
 * サーバー側の仕掛けは supabase/watch.sql にある。
 */
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'
import { supabase } from './client'

export interface WatchKey {
  key: string
  label: string
  createdAt: string
  lastUsedAt: string | null
}

/**
 * 合鍵の中身。
 * 紛らわしい文字（0/O、1/I/L）を外してあるので、目で読んで打ち直せる。
 * 32文字 ＝ 約160ビット。総当たりで当てられる長さではない。
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

export function newWatchKey(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length]
  return out
}

/** いま持っている合鍵（1本だけ使う想定） */
export async function loadWatchKey(userId: string): Promise<WatchKey | null> {
  const { data, error } = await supabase()
    .from('watch_keys')
    .select('key,label,created_at,last_used_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const row = data?.[0]
  if (!row) return null
  return {
    key: row.key as string,
    label: (row.label as string) ?? 'Apple Watch',
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  }
}

/**
 * 合鍵を作り直す。
 * 古いものは消してから入れるので、前の合鍵はその場で使えなくなる。
 */
export async function issueWatchKey(userId: string): Promise<WatchKey> {
  const key = newWatchKey()
  const del = await supabase().from('watch_keys').delete().eq('user_id', userId)
  if (del.error) throw new Error(del.error.message)
  const { data, error } = await supabase()
    .from('watch_keys')
    .insert({ key, user_id: userId, label: 'Apple Watch' })
    .select('key,label,created_at,last_used_at')
    .single()
  if (error) throw new Error(error.message)
  return {
    key: data.key as string,
    label: (data.label as string) ?? 'Apple Watch',
    createdAt: data.created_at as string,
    lastUsedAt: null,
  }
}

/** 合鍵を失効させる */
export async function revokeWatchKeys(userId: string): Promise<void> {
  const { error } = await supabase().from('watch_keys').delete().eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// ---------------------------------------------------------------- 呼び出し

export type WatchAction = 'watch_status' | 'watch_toggle' | 'watch_expense' | 'watch_tags'

/** ショートカットに貼り付けるURL。合鍵は本文に入れるので、ここには含めない。 */
export function watchUrl(action: WatchAction): string {
  return `${SUPABASE_URL}/rest/v1/rpc/${action}`
}

export function watchApiKey(): string {
  return SUPABASE_ANON_KEY
}

/**
 * ショートカットとまったく同じ道筋で呼ぶ。
 * アプリの中から試せるようにしておくと、
 * 「SQLを入れ忘れている」のか「ショートカットの設定が違う」のかが切り分けられる。
 */
export async function callWatch(
  action: WatchAction,
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(watchUrl(action), {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  if (!res.ok) {
    // PostgREST は理由を JSON で返す
    try {
      const j = JSON.parse(text) as { message?: string; hint?: string; code?: string }
      if (j.code === 'PGRST202' || /not find the function/i.test(j.message ?? '')) {
        throw new Error('サーバー側の準備がまだです。supabase/watch.sql を実行してください')
      }
      throw new Error(j.message ?? text)
    } catch (e) {
      throw e instanceof Error ? e : new Error(text)
    }
  }
  // returns text の戻りは "..." という形で来る
  try {
    const v = JSON.parse(text)
    return typeof v === 'string' ? v : JSON.stringify(v)
  } catch {
    return text
  }
}
