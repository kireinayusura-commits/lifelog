import { useCallback, useEffect, useState } from 'react'
import { currentUser } from '../sync/client'
import { useSync } from '../sync/useSync'
import {
  callWatch,
  issueWatchKey,
  loadWatchKey,
  revokeWatchKeys,
  watchApiKey,
  watchUrl,
  type WatchKey,
} from '../sync/watch'
import { Button, Card, Modal } from './ui'

/** 押すとコピーできる、貼り付け用の値 */
function CopyRow({
  id,
  label,
  value,
  hint,
}: {
  id: string
  label: string
  value: string
  hint?: string
}) {
  const [done, setDone] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setDone(true)
      window.setTimeout(() => setDone(false), 1600)
    } catch {
      // クリップボードが使えない場合は、選べる状態にして手で写してもらう
      const el = document.getElementById(`copy-${id}`)
      if (el) {
        const r = document.createRange()
        r.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(r)
      }
    }
  }

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-semibold text-muted">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-[12px] font-semibold text-time"
        >
          {done ? 'コピーしました' : 'コピー'}
        </button>
      </div>
      <div
        id={`copy-${id}`}
        className="rounded-xl border border-rule bg-surface2 px-3 py-2 text-[12px] leading-relaxed break-all select-all"
      >
        {value}
      </div>
      {hint && <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{hint}</p>}
    </div>
  )
}

export function WatchCard() {
  const { phase } = useSync()
  const [userId, setUserId] = useState<string | null>(null)
  const [key, setKey] = useState<WatchKey | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [test, setTest] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [open, setOpen] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    setErr(null)
    try {
      const u = await currentUser()
      setUserId(u?.id ?? null)
      setKey(u ? await loadWatchKey(u.id) : null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '読み込めませんでした')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (phase === 'signedOut') {
      setUserId(null)
      setKey(null)
      setLoading(false)
      return
    }
    void refresh()
  }, [phase, refresh])

  if (phase === 'signedOut') {
    return (
      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[13px] font-bold">Apple Watch から操作</h2>
        <Card className="px-4 py-4">
          <p className="text-[13px] leading-relaxed text-ink2">
            先に「端末間で同期」からログインしてください。
            Watch からの操作はサーバーを経由するので、同期が要ります。
          </p>
        </Card>
      </section>
    )
  }

  const issue = async () => {
    setBusy(true)
    setErr(null)
    setTest(null)
    try {
      setKey(await issueWatchKey(userId!))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '作れませんでした')
    } finally {
      setBusy(false)
      setConfirmOpen(false)
    }
  }

  const revoke = async () => {
    setBusy(true)
    setErr(null)
    setTest(null)
    try {
      await revokeWatchKeys(userId!)
      setKey(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '失効できませんでした')
    } finally {
      setBusy(false)
    }
  }

  const runTest = async () => {
    if (!key) return
    setBusy(true)
    setErr(null)
    setTest(null)
    try {
      setTest(await callWatch('watch_status', { k: key.key }))
    } catch (e) {
      setErr(e instanceof Error ? e.message : '試せませんでした')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 px-1 text-[13px] font-bold">Apple Watch から操作</h2>
      <Card className="px-4 py-4">
        <p className="text-[13px] leading-relaxed text-ink2">
          「ショートカット」アプリから、タイマーの開始・停止と支出の記録ができます。
          Watch の文字盤やアプリ一覧から押すだけで、iPhone を出さずに済みます。
        </p>

        {loading ? (
          <p className="mt-3 text-[12.5px] text-muted">読み込み中…</p>
        ) : !key ? (
          <>
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
              まず「合鍵」を1本作ります。ショートカットにはこの合鍵だけを持たせるので、
              メールアドレスやパスワードを書く必要はありません。
            </p>
            <div className="mt-3.5">
              <Button variant="primary" onClick={issue} disabled={busy}>
                {busy ? '作成中…' : '合鍵を作る'}
              </Button>
            </div>
          </>
        ) : (
          <>
            <CopyRow
              id="key"
              label="合鍵"
              value={key.key}
              hint={
                key.lastUsedAt
                  ? `最後に使われたのは ${new Date(key.lastUsedAt).toLocaleString('ja-JP')}`
                  : 'まだ一度も使われていません'
              }
            />

            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <Button variant="primary" onClick={runTest} disabled={busy}>
                {busy ? '確認中…' : 'つながるか試す'}
              </Button>
              <Button onClick={() => setOpen((v) => !v)}>
                {open ? '貼り付ける値を隠す' : '貼り付ける値を見る'}
              </Button>
              <Button variant="danger" onClick={() => setConfirmOpen(true)} disabled={busy}>
                作り直す
              </Button>
            </div>

            {test && (
              <p className="mt-3 rounded-xl border border-rule bg-surface2 px-3 py-2 text-[12.5px] leading-relaxed text-good">
                つながりました：{test}
              </p>
            )}

            {open && (
              <div className="mt-4 border-t border-rulesoft pt-3">
                <p className="text-[12px] leading-relaxed text-muted">
                  ショートカットの「URLの内容を取得」に、下の値をそのまま貼ります。
                  作り方の手順は <code>supabase/WATCH.md</code> にあります。
                </p>

                <CopyRow
                  id="url-toggle"
                  label="URL（タイマー）"
                  value={watchUrl('watch_toggle')}
                  hint="押すたびに開始と停止が入れ替わります"
                />
                <CopyRow id="url-expense" label="URL（支出）" value={watchUrl('watch_expense')} />
                <CopyRow id="url-tags" label="URL（タグ一覧）" value={watchUrl('watch_tags')} />
                <CopyRow id="url-status" label="URL（状態の確認）" value={watchUrl('watch_status')} />
                <CopyRow
                  id="apikey"
                  label="ヘッダ apikey と Authorization"
                  value={watchApiKey()}
                  hint="apikey にはこの値を、Authorization には「Bearer 」を付けた値を入れます"
                />
                <CopyRow
                  id="body"
                  label="本文（タイマー・状態の確認）"
                  value={`{"k":"${key.key}"}`}
                  hint="ショートカットでは「JSON」ではなくテキストで貼っても通ります"
                />

                <div className="mt-4">
                  <Button variant="ghost" onClick={revoke} disabled={busy}>
                    Watch を使うのをやめる（合鍵を消す）
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {err && <p className="mt-3 text-[12.5px] leading-relaxed text-danger">{err}</p>}

        <p className="mt-4 text-[12px] leading-relaxed text-muted">
          合鍵を持っている人は、あなたの記録を足したり計測を止めたりできます。
          人に見られたかもしれないときは「作り直す」を押してください。
          古い合鍵はその場で使えなくなります。
        </p>
      </Card>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="合鍵を作り直しますか？">
        <p className="text-[13px] leading-relaxed text-muted">
          いまの合鍵は使えなくなります。Watch のショートカットに新しい合鍵を
          貼り直すまで、Watch からの操作は動きません。記録は消えません。
        </p>
        <div className="mt-5 flex gap-2.5">
          <Button className="flex-1" onClick={() => setConfirmOpen(false)}>
            やめる
          </Button>
          <Button className="flex-1" variant="danger" onClick={issue} disabled={busy}>
            作り直す
          </Button>
        </div>
      </Modal>
    </section>
  )
}
