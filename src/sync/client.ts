import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config'

let client: SupabaseClient | null = null

export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // ホーム画面から起動した PWA でもログイン状態を保つ
        storageKey: 'kirimori.auth',
      },
    })
  }
  return client
}

export interface AuthResult {
  ok: boolean
  message?: string
}

/** Supabase のエラー文は英語なので、よくあるものだけ日本語にする */
function translate(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'メールアドレスかパスワードが違います'
  if (m.includes('email not confirmed'))
    return 'メールの確認が済んでいません。届いたメールのリンクを開いてください'
  if (m.includes('user already registered')) return 'このメールアドレスは登録済みです。ログインしてください'
  if (m.includes('password should be at least')) return 'パスワードは6文字以上にしてください'
  if (m.includes('rate limit') || m.includes('too many'))
    return '試行が多すぎます。少し待ってからもう一度お試しください'
  if (m.includes('failed to fetch') || m.includes('network'))
    return 'サーバーに接続できません。通信環境を確認してください'
  return message
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase().auth.signUp({ email, password })
  if (error) return { ok: false, message: translate(error.message) }
  return { ok: true, message: '登録しました。確認メールが届いた場合は、リンクを開いてください' }
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (error) return { ok: false, message: translate(error.message) }
  return { ok: true }
}

export async function signOut(): Promise<void> {
  await supabase().auth.signOut()
}

export async function currentUser(): Promise<{ id: string; email: string | null } | null> {
  const { data } = await supabase().auth.getUser()
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}
