import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive, createTransaction } from '../db/repo'
import { TagPicker, useTags } from '../components/TagPicker'
import { ExpenseEditModal } from '../components/ExpenseEditModal'
import { RecurringCard } from '../components/RecurringCard'
import { Card, Dot, inputClass } from '../components/ui'
import type { Transaction } from '../db/types'
import { MAX_AMOUNT_DIGITS, formatYen, groupDigits } from '../lib/money'
import { formatTimeOfDay, startOfDay } from '../lib/time'

const KEYS = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '00', '0', 'del'] as const

function startOfMonth(ts: number): number {
  const d = new Date(ts)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function ExpenseScreen() {
  const tags = useTags()
  const [digits, setDigits] = useState('')
  const [name, setName] = useState('')
  const [tagId, setTagId] = useState<string | null>(null)
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const all = useLiveQuery(
    () => db.transactions.orderBy('occurredAt').reverse().toArray(),
    [],
    undefined,
  )

  const { today, monthTotal } = useMemo(() => {
    const rows = alive(all)
    const dayFrom = startOfDay(Date.now())
    const monFrom = startOfMonth(Date.now())
    return {
      today: rows.filter((t) => t.occurredAt >= dayFrom),
      monthTotal: rows
        .filter((t) => t.occurredAt >= monFrom)
        .reduce((a, t) => a + t.amount, 0),
    }
  }, [all])

  const todayTotal = today.reduce((a, t) => a + t.amount, 0)
  const amount = digits === '' ? 0 : Number(digits)
  const canSave = amount > 0

  const press = (k: string) => {
    if (k === 'del') {
      setDigits((d) => d.slice(0, -1))
      return
    }
    setDigits((d) => {
      const next = (d + k).replace(/^0+(?=\d)/, '')
      return next.length > MAX_AMOUNT_DIGITS ? d : next
    })
  }

  const save = async () => {
    if (!canSave) return
    await createTransaction({ amount, name, tagId })
    setDigits('')
    setName('')
    // タグは残す。同じタグで続けて入力することが多いため。
    setToast(`${formatYen(amount)} を記録しました`)
    window.setTimeout(() => setToast(null), 2200)
  }

  const tagOf = (id: string | null) => tags.find((t) => t.id === id) ?? null

  return (
    <div className="min-h-full">
      <div className="safe-top px-4 pt-2 pb-6">
        <Card className="overflow-hidden">
          {/* ---- 金額 ---- */}
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold tracking-[0.16em] text-muted uppercase">
                支出
              </span>
              <span className="text-[12px] text-muted">
                今月 <span className="tnum font-semibold text-ink2">{formatYen(monthTotal)}</span>
              </span>
            </div>
            <div
              className={`tnum mt-1 text-right font-bold tracking-tight ${
                canSave ? 'text-money' : 'text-muted'
              }`}
              style={{ fontSize: 'clamp(38px, 12vw, 52px)', lineHeight: 1.15 }}
            >
              <span className="mr-1 align-middle text-[0.55em] font-semibold">¥</span>
              {groupDigits(amount)}
            </div>
          </div>

          {/* ---- テンキー。金額のすぐ下に置く ---- */}
          <div className="border-t border-rulesoft bg-surface2 px-3 py-3">
            <div className="grid grid-cols-3 gap-2">
              {KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => press(k)}
                  aria-label={k === 'del' ? '1文字消す' : k}
                  className="tnum rounded-xl border border-rule bg-surface py-3.5 text-[19px] font-semibold active:opacity-60"
                >
                  {k === 'del' ? '⌫' : k}
                </button>
              ))}
            </div>
          </div>

          {/* ---- 名称。任意なので下に置く ---- */}
          <div className="border-t border-rulesoft px-5 py-3">
            <input
              id="new-expense-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="名称（昼食・参考書 など）"
              enterKeyHint="done"
            />
          </div>

          {/* ---- タグ ---- */}
          {tags.length > 0 && (
            <div className="border-t border-rulesoft px-5 py-3">
              <TagPicker value={tagId} onChange={setTagId} scope="money" />
            </div>
          )}

          <div className="border-t border-rulesoft px-5 py-3">
            <button
              onClick={save}
              disabled={!canSave}
              className="w-full rounded-xl bg-money py-3.5 text-[16px] font-bold text-paper disabled:opacity-35"
            >
              記録する
            </button>
          </div>
        </Card>

        {/* ---- 今日 ---- */}
        <div className="mt-6 flex items-baseline justify-between">
          <h2 className="text-[13px] font-bold tracking-wide text-muted">今日</h2>
          <span className="tnum text-[15px] font-bold">
            {today.length > 0 ? formatYen(todayTotal) : '—'}
          </span>
        </div>
        <div className="mt-2">
          {today.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rule px-5 py-7 text-center text-[13px] text-muted">
              今日の支出はまだありません
            </div>
          ) : (
            <Card className="divide-y divide-rulesoft">
              {today.map((t) => {
                const tag = tagOf(t.tagId)
                return (
                  <button
                    key={t.id}
                    onClick={() => setEditing(t)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <Dot color={tag?.color ?? 'var(--c-muted)'} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-medium">
                        {t.name || '（名称なし）'}
                      </div>
                      <div className="tnum truncate text-[12px] text-muted">
                        {formatTimeOfDay(t.occurredAt)}
                        {tag && ` · ${tag.name}`}
                      </div>
                    </div>
                    <div className="tnum text-[14.5px] font-semibold text-money">
                      {formatYen(t.amount)}
                    </div>
                  </button>
                )
              })}
            </Card>
          )}
        </div>

        <RecurringCard />
      </div>

      <ExpenseEditModal target={editing} onClose={() => setEditing(null)} />

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
