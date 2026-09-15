import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  alive,
  createRecurring,
  deleteRecurring,
  materializeRecurring,
  updateRecurring,
} from '../db/repo'
import type { Recurring } from '../db/types'
import { TagPicker, useTags } from './TagPicker'
import { Button, Card, Dot, Field, Modal, inputClass } from './ui'
import { formatYen } from '../lib/money'

type Draft = {
  id: string | null
  name: string
  amount: string
  tagId: string | null
  dayOfMonth: string
  active: boolean
}

const emptyDraft = (): Draft => ({
  id: null,
  name: '',
  amount: '',
  tagId: null,
  dayOfMonth: '1',
  active: true,
})

export function RecurringCard() {
  const rows = useLiveQuery(() => db.recurring.toArray(), [], undefined)
  const tags = useTags()
  const [draft, setDraft] = useState<Draft | null>(null)

  const list = alive(rows).sort((a, b) => a.dayOfMonth - b.dayOfMonth)
  const activeList = list.filter((r) => r.active)
  const monthlyTotal = activeList.reduce((a, r) => a + r.amount, 0)
  const tagOf = (id: string | null) => tags.find((t) => t.id === id) ?? null

  const open = (r: Recurring) =>
    setDraft({
      id: r.id,
      name: r.name,
      amount: String(r.amount),
      tagId: r.tagId,
      dayOfMonth: String(r.dayOfMonth),
      active: r.active,
    })

  return (
    <>
      <div className="mt-6 flex items-baseline justify-between">
        <h2 className="text-[13px] font-bold tracking-wide text-muted">毎月の固定費</h2>
        <span className="tnum text-[15px] font-bold">
          {activeList.length > 0 ? formatYen(monthlyTotal) : '—'}
        </span>
      </div>

      <div className="mt-2">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-rule px-5 py-6 text-center text-[12.5px] leading-relaxed text-muted">
            サブスクや家賃など、毎月決まって出ていくものを登録しておくと、
            <br />
            支払日が来たときに自動で記録されます。
          </div>
        ) : (
          <Card className="divide-y divide-rulesoft">
            {list.map((r) => {
              const tag = tagOf(r.tagId)
              return (
                <button
                  key={r.id}
                  onClick={() => open(r)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  <Dot color={tag?.color ?? 'var(--c-muted)'} />
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[14.5px] font-medium ${r.active ? '' : 'text-muted line-through'}`}
                    >
                      {r.name}
                    </div>
                    <div className="tnum truncate text-[12px] text-muted">
                      毎月{r.dayOfMonth}日{tag && ` · ${tag.name}`}
                      {!r.active && ' · 停止中'}
                    </div>
                  </div>
                  <div
                    className={`tnum text-[14.5px] font-semibold ${r.active ? 'text-money' : 'text-muted'}`}
                  >
                    {formatYen(r.amount)}
                  </div>
                </button>
              )
            })}
          </Card>
        )}

        <Button className="mt-2 w-full" onClick={() => setDraft(emptyDraft())}>
          + 固定費を追加
        </Button>
      </div>

      <RecurringModal draft={draft} onClose={() => setDraft(null)} />
    </>
  )
}

function RecurringModal({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const [d, setD] = useState<Draft | null>(draft)
  useEffect(() => setD(draft), [draft])
  if (!d) return null

  const amount = Number(d.amount.replace(/[^\d]/g, ''))
  const day = Number(d.dayOfMonth)
  const invalid = !d.name.trim() || !(amount > 0) || !(day >= 1 && day <= 31)

  const save = async () => {
    if (invalid) return
    if (d.id) {
      await updateRecurring(d.id, {
        name: d.name,
        amount,
        tagId: d.tagId,
        dayOfMonth: day,
        active: d.active,
      })
    } else {
      await createRecurring({ name: d.name, amount, tagId: d.tagId, dayOfMonth: day })
    }
    // 支払日が既に過ぎているなら、その場で今月分を計上する。
    // 次にアプリを開くまで反映されない、という見え方を避けるため。
    await materializeRecurring()
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={d.id ? '固定費を編集' : '固定費を追加'}>
      <div className="flex flex-col gap-4">
        <Field label="名称">
          <input
            id="rec-name"
            type="text"
            value={d.name}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            className={inputClass}
            placeholder="家賃 / サブスク名 など"
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="金額">
            <input
              id="rec-amount"
              type="text"
              inputMode="numeric"
              value={d.amount}
              onChange={(e) => setD({ ...d, amount: e.target.value })}
              className={`${inputClass} tnum`}
              placeholder="1490"
            />
          </Field>
          <Field label="毎月の支払日">
            <div className="flex items-center gap-2">
              <input
                id="rec-day"
                type="number"
                min={1}
                max={31}
                value={d.dayOfMonth}
                onChange={(e) => setD({ ...d, dayOfMonth: e.target.value })}
                className={`${inputClass} tnum`}
              />
              <span className="shrink-0 text-[13px] text-muted">日</span>
            </div>
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-[12px] font-semibold text-muted">タグ</span>
          <TagPicker value={d.tagId} onChange={(id) => setD({ ...d, tagId: id })} />
        </div>

        {d.id && (
          <label className="flex items-center gap-2.5 text-[13.5px]">
            <input
              id="rec-active"
              type="checkbox"
              checked={d.active}
              onChange={(e) => setD({ ...d, active: e.target.checked })}
              className="size-4 accent-[var(--c-money)]"
            />
            計上を続ける（外すと今後は記録されません）
          </label>
        )}

        <p className="text-[12px] leading-relaxed text-muted">
          支払日を過ぎると、その月の支出として自動で記録されます。同じ月に二重で記録されることはありません。
          {d.id && '金額を変えても、すでに記録済みの支出はそのまま残ります。'}
        </p>

        <div className="flex gap-2.5">
          {d.id && (
            <Button
              variant="danger"
              onClick={async () => {
                await deleteRecurring(d.id!)
                onClose()
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
    </Modal>
  )
}
