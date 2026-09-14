import { useEffect, useState } from 'react'
import { deleteTransaction, updateTransaction } from '../db/repo'
import type { Transaction } from '../db/types'
import { TagPicker } from './TagPicker'
import { Button, Field, Modal, inputClass } from './ui'
import { fromDatetimeLocal, toDatetimeLocal } from '../lib/time'

/** 既存の支出を直す・消すためのモーダル。入力の速さは新規追加側で担保しているので、こちらは素直なフォーム。 */
export function ExpenseEditModal({
  target,
  onClose,
}: {
  target: Transaction | null
  onClose: () => void
}) {
  const [amount, setAmount] = useState('')
  const [name, setName] = useState('')
  const [tagId, setTagId] = useState<string | null>(null)
  const [at, setAt] = useState('')

  useEffect(() => {
    if (!target) return
    setAmount(String(target.amount))
    setName(target.name)
    setTagId(target.tagId)
    setAt(toDatetimeLocal(target.occurredAt))
  }, [target])

  const parsed = Number(amount.replace(/[^\d]/g, ''))
  const invalid = !Number.isFinite(parsed) || parsed <= 0

  const save = async () => {
    if (!target || invalid) return
    await updateTransaction(target.id, {
      amount: parsed,
      name,
      tagId,
      occurredAt: fromDatetimeLocal(at),
    })
    onClose()
  }

  return (
    <Modal open={!!target} onClose={onClose} title="支出を編集">
      {target && (
        <div className="flex flex-col gap-4">
          <Field label="金額">
            <input
              id="exp-amount"
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={`${inputClass} tnum`}
            />
          </Field>
          <Field label="名称">
            <input
              id="exp-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="昼食"
            />
          </Field>
          <div>
            <span className="mb-2 block text-[12px] font-semibold text-muted">タグ</span>
            <TagPicker value={tagId} onChange={setTagId} />
          </div>
          <Field label="日時">
            <input
              id="exp-at"
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              className={inputClass}
            />
          </Field>

          {invalid && <p className="text-[12.5px] text-danger">金額を入力してください。</p>}

          <div className="flex gap-2.5">
            <Button
              variant="danger"
              onClick={async () => {
                await deleteTransaction(target.id)
                onClose()
              }}
            >
              削除
            </Button>
            <Button className="flex-1" variant="primary" onClick={save} disabled={invalid}>
              保存
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
