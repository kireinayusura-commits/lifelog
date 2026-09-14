import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive, createSession, deleteSession, updateSession } from '../db/repo'
import { useTags, TagPicker } from '../components/TagPicker'
import { Button, Card, Dot, Field, Modal, Screen, inputClass } from '../components/ui'
import type { Session } from '../db/types'
import {
  dateKey,
  formatDateLabel,
  formatDuration,
  formatTimeOfDay,
  fromDatetimeLocal,
  toDatetimeLocal,
} from '../lib/time'

type Draft = {
  id: string | null
  tagId: string | null
  startedAt: string
  endedAt: string
  memo: string
}

function emptyDraft(): Draft {
  const now = Date.now()
  return {
    id: null,
    tagId: null,
    startedAt: toDatetimeLocal(now - 3600_000),
    endedAt: toDatetimeLocal(now),
    memo: '',
  }
}

export function RecordsScreen() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('startedAt').reverse().toArray(), [], undefined)
  const tags = useTags()
  const [draft, setDraft] = useState<Draft | null>(null)

  const days = useMemo(() => {
    const rows = alive(sessions)
    const map = new Map<string, Session[]>()
    for (const s of rows) {
      const k = dateKey(s.startedAt)
      const list = map.get(k)
      if (list) list.push(s)
      else map.set(k, [s])
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      items,
      total: items.reduce((a, s) => a + s.durationSec, 0),
      ts: items[0].startedAt,
    }))
  }, [sessions])

  const tagOf = (id: string | null) => tags.find((t) => t.id === id) ?? null

  const openEdit = (s: Session) =>
    setDraft({
      id: s.id,
      tagId: s.tagId,
      startedAt: toDatetimeLocal(s.startedAt),
      endedAt: toDatetimeLocal(s.endedAt),
      memo: s.memo,
    })

  const save = async () => {
    if (!draft) return
    const startedAt = fromDatetimeLocal(draft.startedAt)
    const endedAt = fromDatetimeLocal(draft.endedAt)
    if (endedAt <= startedAt) return
    if (draft.id) {
      await updateSession(draft.id, { tagId: draft.tagId, startedAt, endedAt, memo: draft.memo })
    } else {
      await createSession({ tagId: draft.tagId, startedAt, endedAt, memo: draft.memo, source: 'manual' })
    }
    setDraft(null)
  }

  const invalid = draft ? fromDatetimeLocal(draft.endedAt) <= fromDatetimeLocal(draft.startedAt) : false

  return (
    <Screen
      title="記録"
      action={
        <Button onClick={() => setDraft(emptyDraft())} className="px-3 py-1.5 text-[13.5px]">
          + 手動で追加
        </Button>
      }
    >
      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule px-5 py-10 text-center text-[13.5px] leading-relaxed text-muted">
          まだ記録がありません。
          <br />
          タイマーで計測するか、手動で追加してください。
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((d) => (
            <section key={d.key}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-[13px] font-bold">{formatDateLabel(d.ts)}</h2>
                <span className="tnum text-[13px] font-semibold text-muted">
                  {formatDuration(d.total)}
                </span>
              </div>
              <Card className="divide-y divide-rulesoft">
                {d.items.map((s) => {
                  const t = tagOf(s.tagId)
                  return (
                    <button
                      key={s.id}
                      onClick={() => openEdit(s)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <Dot color={t?.color ?? 'var(--c-muted)'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium">
                          {t?.name ?? 'タグなし'}
                        </div>
                        <div className="tnum truncate text-[12px] text-muted">
                          {formatTimeOfDay(s.startedAt)} – {formatTimeOfDay(s.endedAt)}
                          {s.source === 'manual' && ' · 手動'}
                          {s.memo && ` · ${s.memo}`}
                        </div>
                      </div>
                      <div className="tnum text-[14px] font-semibold">
                        {formatDuration(s.durationSec)}
                      </div>
                    </button>
                  )
                })}
              </Card>
            </section>
          ))}
        </div>
      )}

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '記録を編集' : '記録を手動で追加'}
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <div>
              <span className="mb-2 block text-[12px] font-semibold text-muted">タグ</span>
              <TagPicker value={draft.tagId} onChange={(id) => setDraft({ ...draft, tagId: id })} />
            </div>
            <Field label="開始">
              <input
                id="rec-started-at"
                type="datetime-local"
                value={draft.startedAt}
                onChange={(e) => setDraft({ ...draft, startedAt: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="終了">
              <input
                id="rec-ended-at"
                type="datetime-local"
                value={draft.endedAt}
                onChange={(e) => setDraft({ ...draft, endedAt: e.target.value })}
                className={inputClass}
              />
            </Field>
            <Field label="メモ（任意）">
              <input
                id="rec-memo"
                type="text"
                value={draft.memo}
                onChange={(e) => setDraft({ ...draft, memo: e.target.value })}
                className={inputClass}
                placeholder="第3章まで"
              />
            </Field>

            {invalid && (
              <p className="text-[12.5px] text-danger">終了は開始より後の時刻にしてください。</p>
            )}

            <div className="flex gap-2.5">
              {draft.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await deleteSession(draft.id!)
                    setDraft(null)
                  }}
                >
                  削除
                </Button>
              )}
              <Button className="flex-1" variant="primary" onClick={save} disabled={invalid}>
                保存
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Screen>
  )
}
