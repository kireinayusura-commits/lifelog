import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings } from '../db/db'
import { alive } from '../db/repo'
import type { Block, Id } from '../db/types'
import { Button, Card, Dot, Screen } from '../components/ui'
import { useTags } from '../components/TagPicker'
import {
  BlockEditModal,
  FrameModal,
  PartsModal,
  PlaceModal,
  TemplateModal,
} from '../components/ScheduleModals'
import {
  applyTemplate,
  clearDay,
  getFrame,
  saveAsTemplate,
  type Frame,
} from '../schedule/repo'
import {
  buildRows,
  dateKey,
  formatLen,
  formatMin,
  nowMinFor,
  shiftDate,
  totals,
} from '../schedule/logic'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

function label(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${m}/${d} (${WEEK[dt.getDay()]})`
}

export function ScheduleScreen() {
  const [date, setDate] = useState(() => dateKey())
  const [gap, setGap] = useState<{ startMin: number; endMin: number } | null>(null)
  const [editing, setEditing] = useState<Block | null>(null)
  const [partsOpen, setPartsOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [frameOpen, setFrameOpen] = useState(false)
  type Confirm = { kind: 'template'; id: Id; name: string } | { kind: 'clear' }
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const tags = useTags()

  const blocks = useLiveQuery(
    async () => alive(await db.blocks.where('date').equals(date).toArray()),
    [date],
    undefined,
  )
  const frame = useLiveQuery<Frame, undefined>(
    () => getFrame(date),
    [date],
    undefined,
  )
  const goalMin = useLiveQuery(() => getSettings().then((s) => s.dailyGoalMin), [], undefined)

  const rows = useMemo(
    () => (blocks && frame ? buildRows(blocks, frame.startMin, frame.endMin) : []),
    [blocks, frame],
  )
  const sum = useMemo(
    () => (blocks && frame ? totals(blocks, frame.startMin, frame.endMin) : null),
    [blocks, frame],
  )

  const nowMin = nowMinFor(date)
  const isToday = date === dateKey()

  const showToast = (m: string) => {
    setToast(m)
    window.setTimeout(() => setToast(null), 2600)
  }

  if (!blocks || !frame || !sum) return null

  const goalGap = goalMin != null ? goalMin - sum.studyMin : null

  return (
    <Screen
      title="予定"
      action={
        <button
          type="button"
          onClick={() => setTemplateOpen(true)}
          className="text-[13px] font-semibold text-time"
        >
          型
        </button>
      }
    >
      {/* ---- 日付 ---- */}
      <div className="flex items-center justify-between">
        <Button onClick={() => setDate(shiftDate(date, -1))}>‹</Button>
        <div className="text-center">
          <div className="text-[16px] font-bold">{label(date)}</div>
          {!isToday && (
            <button
              type="button"
              onClick={() => setDate(dateKey())}
              className="text-[12px] font-semibold text-time"
            >
              今日に戻る
            </button>
          )}
        </div>
        <Button onClick={() => setDate(shiftDate(date, 1))}>›</Button>
      </div>

      {/* ---- 合計 ---- */}
      <Card className="mt-3 px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] text-muted">勉強の予定</span>
          <span className="tnum text-[18px] font-bold text-time">
            {sum.studyMin > 0 ? formatLen(sum.studyMin) : '—'}
          </span>
        </div>

        {goalGap !== null && (
          <p className="mt-1 text-right text-[12px] text-muted">
            {goalGap > 0
              ? `目標まで あと${formatLen(goalGap)}`
              : `目標を ${formatLen(-goalGap)} 超えています`}
          </p>
        )}

        <div className="mt-3 flex items-baseline justify-between border-t border-rulesoft pt-3">
          <span className="text-[13px] text-muted">空き</span>
          <span className="tnum text-[15px] font-bold">
            {sum.freeMin > 0 ? formatLen(sum.freeMin) : 'なし'}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setFrameOpen(true)}
          className="mt-3 flex w-full items-baseline justify-between border-t border-rulesoft pt-3 text-left"
        >
          <span className="text-[12px] text-muted">
            起きている時間 {formatMin(frame.startMin)}〜{formatMin(frame.endMin)}
            {frame.custom && 'の日'}
          </span>
          <span className="text-[12px] font-semibold text-time">変える</span>
        </button>

        {sum.studyMin > 11 * 60 && (
          <p className="mt-3 rounded-xl border border-rule bg-warnsoft px-3 py-2 text-[12.5px] leading-relaxed text-warn">
            勉強の予定が11時間を超えています。詰めすぎると翌日に響きます。
          </p>
        )}
      </Card>

      {/* ---- 帯 ---- */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rule px-5 py-8 text-center text-[13px] leading-relaxed text-muted">
            枠の中が空です。
          </div>
        ) : (
          <Card className="divide-y divide-rulesoft overflow-hidden">
            {rows.map((r, i) => {
              if (r.type === 'gap') {
                const len = r.endMin - r.startMin
                if (len <= 0) return null
                return (
                  <button
                    key={`gap-${i}`}
                    type="button"
                    onClick={() => setGap({ startMin: r.startMin, endMin: r.endMin })}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                  >
                    <span className="tnum w-14 shrink-0 text-[12.5px] text-muted">
                      {formatMin(r.startMin)}
                    </span>
                    <span className="h-5 w-1 shrink-0 rounded-full border border-dashed border-rule" />
                    <span className="flex-1 text-[13px] text-muted">空き {formatLen(len)}</span>
                    <span className="shrink-0 text-[18px] leading-none font-semibold text-time">
                      ＋
                    </span>
                  </button>
                )
              }

              const b = r.block
              const tag = tags.find((t) => t.id === b.tagId)
              const live = nowMin !== null && b.startMin <= nowMin && nowMin < r.endMin
              const bar =
                b.kind === 'study'
                  ? tag?.color ?? 'var(--color-time)'
                  : b.kind === 'life'
                    ? 'var(--color-rule)'
                    : 'var(--color-muted)'

              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setEditing(b)}
                  className={`flex w-full items-center gap-3 px-3 py-3 text-left ${
                    live ? 'bg-surface2' : ''
                  }`}
                >
                  <span className="tnum w-14 shrink-0 text-[12.5px] text-muted">
                    {formatMin(b.startMin)}
                  </span>
                  <span
                    className="w-1.5 shrink-0 self-stretch rounded-full"
                    style={{ background: bar, minHeight: 22 }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14.5px] font-semibold">{b.title}</span>
                      {live && (
                        <span className="shrink-0 rounded-full bg-time px-1.5 py-0.5 text-[10px] font-bold text-paper">
                          いま
                        </span>
                      )}
                    </span>
                    {tag && (
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted">
                        <Dot color={tag.color} />
                        {tag.name}
                      </span>
                    )}
                  </span>
                  <span className="tnum shrink-0 text-[12.5px] text-muted">
                    {formatLen(b.durationMin)}
                  </span>
                </button>
              )
            })}
          </Card>
        )}
      </div>

      {blocks.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button onClick={() => setPartsOpen(true)}>部品箱</Button>
          <Button variant="danger" onClick={() => setConfirm({ kind: 'clear' })}>
            この日を空にする
          </Button>
        </div>
      )}
      {blocks.length === 0 && (
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button onClick={() => setPartsOpen(true)}>部品箱</Button>
          <Button variant="primary" onClick={() => setTemplateOpen(true)}>
            型から入れる
          </Button>
        </div>
      )}

      {/* ---- モーダル ---- */}
      <PlaceModal
        open={!!gap}
        date={date}
        gap={gap}
        onClose={() => setGap(null)}
        onManageParts={() => {
          setGap(null)
          setPartsOpen(true)
        }}
      />
      <BlockEditModal block={editing} onClose={() => setEditing(null)} />
      <PartsModal open={partsOpen} onClose={() => setPartsOpen(false)} />
      <TemplateModal
        open={templateOpen}
        date={date}
        hasBlocks={blocks.length > 0}
        onClose={() => setTemplateOpen(false)}
        onApply={(id, name) => {
          if (blocks.length > 0) {
            setConfirm({ kind: 'template', id, name })
          } else {
            void applyTemplate(id, date).then((n) => {
              setTemplateOpen(false)
              showToast(`${name} を入れました（${n}件）`)
            })
          }
        }}
        onSave={async (name) => {
          await saveAsTemplate(date, name)
          setTemplateOpen(false)
          showToast(`「${name}」として保存しました`)
        }}
      />
      <FrameModal open={frameOpen} date={date} frame={frame} onClose={() => setFrameOpen(false)} />

      {/* 組んだ予定がまとめて消える操作は、どちらも必ず確認する */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 px-4 pb-8">
          <Card className="w-full max-w-md px-5 py-5">
            <h3 className="text-[16px] font-bold">
              {confirm.kind === 'clear'
                ? 'この日の予定を消しますか？'
                : 'この日の予定を置き換えますか？'}
            </h3>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              {confirm.kind === 'clear'
                ? `置いてある ${blocks.length} 件を消します。`
                : `いま置いてある ${blocks.length} 件を消して、「${confirm.name}」を入れます。`}
              計測した記録は消えません。
            </p>
            <div className="mt-5 flex gap-2.5">
              <Button className="flex-1" onClick={() => setConfirm(null)}>
                やめる
              </Button>
              {confirm.kind === 'clear' ? (
                <Button
                  className="flex-1"
                  variant="danger"
                  onClick={async () => {
                    await clearDay(date)
                    setConfirm(null)
                    showToast('この日の予定を空にしました')
                  }}
                >
                  消す
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  variant="primary"
                  onClick={async () => {
                    const n = await applyTemplate(confirm.id, date)
                    setConfirm(null)
                    setTemplateOpen(false)
                    showToast(`${confirm.name} を入れました（${n}件）`)
                  }}
                >
                  置き換える
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {toast && (
        <div className="safe-bottom pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4">
          <div className="rounded-full bg-ink px-4 py-2.5 text-[13px] font-medium text-paper">
            {toast}
          </div>
        </div>
      )}
    </Screen>
  )
}
