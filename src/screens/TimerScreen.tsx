import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, useShowSeconds } from '../db/db'
import { alive } from '../db/repo'
import { useTimer } from '../timer/useTimer'
import { isFromWatch } from '../timer/logic'
import { TagPicker, useTags } from '../components/TagPicker'
import { Button, Card, Dot, Field, Modal, inputClass } from '../components/ui'
import { SessionEditModal, type SessionTarget } from '../components/SessionEditModal'
import {
  formatClock,
  formatDuration,
  formatTimeOfDay,
  fromDatetimeLocal,
  startOfDay,
  toDatetimeLocal,
} from '../lib/time'

export function TimerScreen() {
  const {
    active,
    loading,
    running,
    isForeign,
    checking,
    elapsedMs,
    requestStart,
    takeOver,
    pause,
    resume,
    stop,
    discard,
    setTag,
  } = useTimer()
  const tags = useTags()
  const [pendingTag, setPendingTag] = useState<string | null>(null)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustValue, setAdjustValue] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [editing, setEditing] = useState<SessionTarget>(null)
  const [takeOverOpen, setTakeOverOpen] = useState(false)
  const showSeconds = useShowSeconds()

  const settings = useLiveQuery(() => db.settings.get('settings'), [], undefined)
  const warnHours = settings?.longRunWarnHours ?? 8

  const todaySessions = useLiveQuery(async () => {
    const from = startOfDay(Date.now())
    return db.sessions.where('startedAt').aboveOrEqual(from).toArray()
  }, [], undefined)

  const today = useMemo(() => {
    const rows = alive(todaySessions)
    const total = rows.reduce((a, s) => a + s.durationSec, 0)
    return { rows: rows.sort((a, b) => b.startedAt - a.startedAt), total }
  }, [todaySessions])

  const tagOf = (id: string | null) => tags.find((t) => t.id === id) ?? null
  const activeTag = tagOf(active?.tagId ?? null)
  const isLong = elapsedMs > warnHours * 3600_000

  const showToast = (msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }

  /**
   * 開始を押したとき。
   * 先にサーバーへ追いついてから始めるので、他の端末が計測中なら
   * ここで切り替えの確認に切り替わる（2台で別々に計り始めない）。
   */
  const handleStart = async () => {
    const r = await requestStart(pendingTag)
    if (r === 'foreign') setTakeOverOpen(true)
  }

  const handleStop = async (endedAt?: number) => {
    const saved = await stop(endedAt)
    setAdjustOpen(false)
    showToast(
      saved ? `${formatDuration(saved.durationSec, true)}を記録しました` : '短すぎたため記録しませんでした',
    )
  }

  const openAdjust = () => {
    if (!active) return
    setAdjustValue(toDatetimeLocal(active.originStartedAt + elapsedMs))
    setAdjustOpen(true)
  }

  if (loading) return null

  return (
    <div className="min-h-full">
      <div className="safe-top px-4 pt-2 pb-6">
        {/* ---- 計測パネル ---- */}
        <Card className="overflow-hidden">
          <div className="px-5 pt-6 pb-5 text-center">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
              {active
                ? isForeign
                  ? `${active.deviceName} で計測中`
                  : running
                    ? '計測中'
                    : '一時停止中'
                : '待機中'}
            </div>

            <div
              className={`tnum mt-2 font-bold tracking-tight tabular-nums ${
                active ? 'text-time' : 'text-muted'
              }`}
              style={{ fontSize: 'clamp(46px, 15vw, 66px)', lineHeight: 1.1 }}
            >
              {formatClock(elapsedMs)}
            </div>

            {active ? (
              <div className="mt-1.5 flex items-center justify-center gap-2 text-[13px] text-muted">
                {activeTag && <Dot color={activeTag.color} />}
                <span>{activeTag ? activeTag.name : 'タグなし'}</span>
                <span aria-hidden>·</span>
                <span>{formatTimeOfDay(active.originStartedAt)} 開始</span>
                {isFromWatch(active) && (
                  <>
                    <span aria-hidden>·</span>
                    <span>Apple Watch から</span>
                  </>
                )}
              </div>
            ) : (
              <p className="mx-auto mt-2 max-w-[18rem] text-[12.5px] leading-relaxed text-muted">
                画面を消しても、アプリを閉じても計測は続きます。
              </p>
            )}
          </div>

          {/* ---- 操作 ---- */}
          <div className="border-t border-rulesoft px-5 py-4">
            {!active ? (
              <>
                {tags.length > 0 && (
                  <div className="mb-4">
                    <TagPicker value={pendingTag} onChange={setPendingTag} allowNone={false} scope="time" />
                  </div>
                )}
                <Button
                  variant="primary"
                  className="w-full py-3.5 text-[16px]"
                  onClick={handleStart}
                  disabled={checking}
                >
                  {checking ? '確認中…' : '開始'}
                </Button>
              </>
            ) : isForeign ? (
              // 他の端末の計測。止めるのは安全なのでそのまま押せるが、
              // 始め直すと相手の計測が終わるので確認を挟む。
              <div className="flex gap-2.5">
                <Button className="flex-1 py-3.5" onClick={() => setTakeOverOpen(true)}>
                  この端末で始める
                </Button>
                <Button
                  className="flex-1 py-3.5"
                  variant="primary"
                  onClick={() => (isLong ? openAdjust() : handleStop())}
                >
                  終了して記録
                </Button>
              </div>
            ) : (
              <div className="flex gap-2.5">
                <Button
                  className="flex-1 py-3.5"
                  variant="outline"
                  onClick={() => (running ? pause() : resume())}
                >
                  {running ? '一時停止' : '再開'}
                </Button>
                <Button
                  className="flex-1 py-3.5"
                  variant="primary"
                  onClick={() => (isLong ? openAdjust() : handleStop())}
                >
                  終了して記録
                </Button>
              </div>
            )}
          </div>

          {active && !isForeign && (
            <div className="border-t border-rulesoft px-5 py-3">
              <div className="mb-2 text-[11px] font-semibold tracking-wider text-muted">タグ</div>
              <TagPicker value={active.tagId} onChange={(id) => setTag(id)} scope="time" />
            </div>
          )}
        </Card>

        {/* ---- 長時間放置の救済 ---- */}
        {isLong && (
          <div className="mt-3 rounded-2xl border border-rule bg-warnsoft px-4 py-3.5">
            <p className="text-[13.5px] leading-relaxed text-warn">
              {warnHours}時間以上、計測が続いています。止め忘れかもしれません。
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button onClick={openAdjust}>終了時刻を直して記録</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  await discard()
                  showToast('計測を破棄しました')
                }}
              >
                破棄
              </Button>
            </div>
          </div>
        )}

        {/* ---- 今日 ---- */}
        <div className="mt-6 flex items-baseline justify-between">
          <h2 className="text-[13px] font-bold tracking-wide text-muted">
            今日
            {today.rows.length > 0 && (
              <span className="ml-2 font-normal text-[11.5px]">押すと直せます</span>
            )}
          </h2>
          <span className="tnum text-[15px] font-bold">
            {today.total > 0 ? formatDuration(today.total, showSeconds) : '—'}
          </span>
        </div>

        <div className="mt-2">
          {today.rows.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rule px-5 py-7 text-center text-[13px] text-muted">
              今日の記録はまだありません
            </div>
          ) : (
            <Card className="divide-y divide-rulesoft">
              {today.rows.map((s) => {
                const t = tagOf(s.tagId)
                return (
                  // タグを付け間違えたことに気づくのはここなので、その場で直せるようにする
                  <button
                    key={s.id}
                    onClick={() => setEditing(s)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <Dot color={t?.color ?? 'var(--c-muted)'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-medium">
                        {t?.name ?? 'タグなし'}
                      </div>
                      <div className="tnum text-[12px] text-muted">
                        {formatTimeOfDay(s.startedAt)} – {formatTimeOfDay(s.endedAt)}
                        {s.source === 'manual' && ' · 手動'}
                      </div>
                    </div>
                    <div className="tnum text-[14px] font-semibold">
                      {formatDuration(s.durationSec, showSeconds)}
                    </div>
                  </button>
                )
              })}
            </Card>
          )}
        </div>
      </div>

      {/* 他の端末の計測を引き取る確認 */}
      <Modal
        open={takeOverOpen}
        onClose={() => setTakeOverOpen(false)}
        title="この端末で始めますか？"
      >
        <p className="text-[13px] leading-relaxed text-muted">
          {active?.deviceName} で計測中のタイマーを終了して記録に残し、この端末で新しく始めます。
          これまでの計測が消えることはありません。
        </p>
        <div className="mt-5 flex gap-2.5">
          <Button className="flex-1" onClick={() => setTakeOverOpen(false)}>
            やめる
          </Button>
          <Button
            className="flex-1"
            variant="primary"
            onClick={async () => {
              setTakeOverOpen(false)
              await takeOver(pendingTag)
              showToast('この端末で計測を始めました')
            }}
          >
            始める
          </Button>
        </div>
      </Modal>

      <SessionEditModal target={editing} onClose={() => setEditing(null)} />

      {/* ---- 終了時刻の調整 ---- */}
      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="終了時刻を指定して記録">
        <p className="text-[13px] leading-relaxed text-muted">
          止め忘れた場合はここで実際に終えた時刻に直せます。
          {active && `開始は ${formatTimeOfDay(active.originStartedAt)} です。`}
        </p>
        <div className="mt-4">
          <Field label="終了時刻">
            <input
              id="adjust-ended-at"
              type="datetime-local"
              value={adjustValue}
              onChange={(e) => setAdjustValue(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="mt-5 flex gap-2.5">
          <Button className="flex-1" onClick={() => setAdjustOpen(false)}>
            やめる
          </Button>
          <Button
            className="flex-1"
            variant="primary"
            onClick={() => handleStop(fromDatetimeLocal(adjustValue))}
          >
            記録する
          </Button>
        </div>
      </Modal>

      {toast && (
        <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-paper">
            {toast}
          </div>
        </div>
      )}
    </div>
  )
}
