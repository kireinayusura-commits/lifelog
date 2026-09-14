import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive, createSession, deleteSession, updateSession } from '../db/repo'
import { useTags, TagPicker } from '../components/TagPicker'
import { ExpenseEditModal } from '../components/ExpenseEditModal'
import { Button, Card, Dot, Field, Modal, Screen, inputClass } from '../components/ui'
import type { Session, Transaction } from '../db/types'
import { formatYen } from '../lib/money'
import {
  dateKey,
  formatDateLabel,
  formatDuration,
  formatTimeOfDay,
  fromDatetimeLocal,
  toDatetimeLocal,
} from '../lib/time'

type Entry =
  | { kind: 'session'; at: number; session: Session }
  | { kind: 'expense'; at: number; tx: Transaction }

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
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const tags = useTags()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)

  /** 時間と支出を1本の履歴にまとめる。共通タグの効果はここで一番はっきり出る。 */
  const days = useMemo(() => {
    const entries: Entry[] = [
      ...alive(sessions).map((s) => ({ kind: 'session' as const, at: s.startedAt, session: s })),
      ...alive(transactions).map((t) => ({ kind: 'expense' as const, at: t.occurredAt, tx: t })),
    ].sort((a, b) => b.at - a.at)

    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      const k = dateKey(e.at)
      const list = map.get(k)
      if (list) list.push(e)
      else map.set(k, [e])
    }
    return [...map.entries()].map(([key, items]) => ({
      key,
      items,
      ts: items[0].at,
      totalSec: items.reduce((a, e) => a + (e.kind === 'session' ? e.session.durationSec : 0), 0),
      totalYen: items.reduce((a, e) => a + (e.kind === 'expense' ? e.tx.amount : 0), 0),
    }))
  }, [sessions, transactions])

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
      await createSession({
        tagId: draft.tagId,
        startedAt,
        endedAt,
        memo: draft.memo,
        source: 'manual',
      })
    }
    setDraft(null)
  }

  const invalid = draft
    ? fromDatetimeLocal(draft.endedAt) <= fromDatetimeLocal(draft.startedAt)
    : false

  return (
    <Screen
      title="記録"
      action={
        <Button onClick={() => setDraft(emptyDraft())} className="px-3 py-1.5 text-[13.5px]">
          + 時間を追加
        </Button>
      }
    >
      {days.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule px-5 py-10 text-center text-[13.5px] leading-relaxed text-muted">
          まだ記録がありません。
          <br />
          タイマーで計測するか、支出を記録してください。
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {days.map((d) => (
            <section key={d.key}>
              <div className="mb-2 flex items-baseline justify-between gap-3 px-1">
                <h2 className="text-[13px] font-bold">{formatDateLabel(d.ts)}</h2>
                <div className="tnum flex items-baseline gap-3 text-[13px] font-semibold">
                  {d.totalSec > 0 && <span className="text-time">{formatDuration(d.totalSec)}</span>}
                  {d.totalYen > 0 && <span className="text-money">{formatYen(d.totalYen)}</span>}
                </div>
              </div>

              <Card className="divide-y divide-rulesoft">
                {d.items.map((e) =>
                  e.kind === 'session' ? (
                    <button
                      key={e.session.id}
                      onClick={() => openEdit(e.session)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <Dot color={tagOf(e.session.tagId)?.color ?? 'var(--c-muted)'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium">
                          {tagOf(e.session.tagId)?.name ?? 'タグなし'}
                        </div>
                        <div className="tnum truncate text-[12px] text-muted">
                          {formatTimeOfDay(e.session.startedAt)} – {formatTimeOfDay(e.session.endedAt)}
                          {e.session.source === 'manual' && ' · 手動'}
                          {e.session.memo && ` · ${e.session.memo}`}
                        </div>
                      </div>
                      <div className="tnum text-[14px] font-semibold text-time">
                        {formatDuration(e.session.durationSec)}
                      </div>
                    </button>
                  ) : (
                    <button
                      key={e.tx.id}
                      onClick={() => setEditingTx(e.tx)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <Dot color={tagOf(e.tx.tagId)?.color ?? 'var(--c-muted)'} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium">
                          {e.tx.name || '（名称なし）'}
                        </div>
                        <div className="tnum truncate text-[12px] text-muted">
                          {formatTimeOfDay(e.tx.occurredAt)}
                          {tagOf(e.tx.tagId) && ` · ${tagOf(e.tx.tagId)!.name}`}
                        </div>
                      </div>
                      <div className="tnum text-[14px] font-semibold text-money">
                        {formatYen(e.tx.amount)}
                      </div>
                    </button>
                  ),
                )}
              </Card>
            </section>
          ))}
        </div>
      )}

      <ExpenseEditModal target={editingTx} onClose={() => setEditingTx(null)} />

      <Modal
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? '記録を編集' : '時間を手動で追加'}
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
