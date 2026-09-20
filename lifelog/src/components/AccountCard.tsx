import { useState } from 'react'
import { signIn, signOut, signUp } from '../sync/client'
import { useSync } from '../sync/useSync'
import { deviceName, setDeviceName } from '../sync/device'
import { Button, Card, Field, inputClass } from './ui'

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60) return 'たった今'
  if (s < 3600) return `${Math.floor(s / 60)}分前`
  if (s < 86400) return `${Math.floor(s / 3600)}時間前`
  return new Date(ts).toLocaleDateString('ja-JP')
}

export function AccountCard() {
  const { phase, email, lastSyncAt, lastError, sync } = useSync()
  const [mode, setMode] = useState<'in' | 'up'>('in')
  const [mail, setMail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [name, setName] = useState(() => deviceName())

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    const r = mode === 'in' ? await signIn(mail.trim(), pass) : await signUp(mail.trim(), pass)
    setBusy(false)
    if (r.ok) {
      setPass('')
      setMsg(r.message ?? null)
    } else {
      setErr(r.message ?? '失敗しました')
    }
  }

  if (phase === 'signedOut') {
    return (
      <section>
        <h2 className="mb-2 px-1 text-[13px] font-bold">端末間で同期</h2>
        <Card className="px-4 py-4">
          <p className="text-[13px] leading-relaxed text-ink2">
            ログインすると、iPhone・iPad・パソコンで同じ記録を見られます。
            ログインしなくても、この端末の中だけで今までどおり使えます。
          </p>

          <div className="mt-4 flex rounded-xl border border-rule bg-surface2 p-1">
            {(
              [
                ['in', 'ログイン'],
                ['up', '新規登録'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => {
                  setMode(m)
                  setErr(null)
                  setMsg(null)
                }}
                aria-pressed={mode === m}
                className={`flex-1 rounded-lg py-2 text-[13.5px] font-semibold ${
                  mode === m ? 'bg-surface text-ink' : 'text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-3">
            <Field label="メールアドレス">
              <input
                id="auth-email"
                type="email"
                inputMode="email"
                autoComplete="username"
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                className={inputClass}
                placeholder="you@example.com"
              />
            </Field>
            <Field label="パスワード">
              <input
                id="auth-password"
                type="password"
                autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                className={inputClass}
                placeholder="6文字以上"
              />
            </Field>
            <Button
              variant="primary"
              onClick={submit}
              disabled={busy || !mail.trim() || pass.length < 6}
            >
              {busy ? '処理中…' : mode === 'in' ? 'ログイン' : '登録する'}
            </Button>
          </div>

          {msg && <p className="mt-3 text-[12.5px] leading-relaxed text-good">{msg}</p>}
          {err && <p className="mt-3 text-[12.5px] leading-relaxed text-danger">{err}</p>}

          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            記録は他の人からは見えません。ログインした本人の記録だけを読み書きできる規則を
            サーバー側に設定してあります。
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-2 px-1 text-[13px] font-bold">端末間で同期</h2>
      <Card className="px-4 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[14px] font-semibold">{email}</span>
          <span className="shrink-0 text-[12px] text-muted">
            {phase === 'syncing'
              ? '同期中…'
              : phase === 'error'
                ? '同期できていません'
                : lastSyncAt
                  ? `${ago(lastSyncAt)}に同期`
                  : '未同期'}
          </span>
        </div>

        {phase === 'error' && lastError && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-danger">{lastError}</p>
        )}

        <div className="mt-3.5 flex flex-wrap gap-2.5">
          <Button variant="primary" onClick={sync} disabled={phase === 'syncing'}>
            今すぐ同期
          </Button>
          <Button onClick={() => signOut()}>ログアウト</Button>
        </div>

        <div className="mt-4 border-t border-rulesoft pt-4">
          <Field label="この端末の名前">
            <div className="flex gap-2">
              <input
                id="device-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setDeviceName(name)}
                className={inputClass}
                placeholder="iPhone"
              />
            </div>
          </Field>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            他の端末で計測しているとき「{name || 'iPhone'} で計測中」と表示されます。
          </p>
        </div>

        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          記録は端末の中にも残り続けます。電波が無い場所でも今までどおり使え、
          つながったときにまとめて同期されます。
        </p>
      </Card>
    </section>
  )
}
