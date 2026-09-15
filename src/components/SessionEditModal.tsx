import { useEffect, useState } from 'react'
import { createSession, deleteSession, updateSession } from '../db/repo'
import type { Session } from '../db/types'
import { TagPicker } from './TagPicker'
import { Button, Field, Modal, inputClass } from './ui'
import { fromDatetimeLocal, toDatetimeLocal } from '../lib/time'

/** 編集するなら記録そのもの、手動で足すなら 'new'、閉じているなら null */
export type SessionTarget = Session | 'new' | null

type Draft = {
  id: string | null
  tagId: string | null
  startedAt: string
  endedAt: string
  memo: string
  /**
   * 元の正確な時刻（ミリ秒まで）。
   * 日時の入力欄は分単位なので、そのまま読み直すと秒が切り捨てられる。
   * 40秒の記録を開いてタグだけ直そうとすると、開始と終了が同じ分に丸まって
   * 「終了が開始より後」の条件を満たせず保存できなくなる。
   * 触っていない欄は元の時刻をそのまま使うことで、これを防ぐ。
   */
  origStart: number | null
  origEnd: number | null
}

function toDraft(target: SessionTarget): Draft | null {
  if (!target) return null
  if (target === 'new') {
    const now = Date.now()
    return {
      id: null,
      tagId: null,
      startedAt: toDatetimeLocal(now - 3600_000),
      endedAt: toDatetimeLocal(now),
      memo: '',
      origStart: null,
      origEnd: null,
    }
  }
  return {
    id: target.id,
    tagId: target.tagId,
    startedAt: toDatetimeLocal(target.startedAt),
    endedAt: toDatetimeLocal(target.endedAt),
    memo: target.memo,
    origStart: target.startedAt,
    origEnd: target.endedAt,
  }
}

/** 入力欄が元のままなら、秒を切り捨てずに元の時刻を返す。 */
function resolve(text: string, original: number | null): number {
  if (original !== null && text === toDatetimeLocal(original)) return original
  return fromDatetimeLocal(text)
}

/**
 * 時間の記録を直す・消す・手で足すためのモーダル。
 * タイマー画面と記録画面の両方から開けるようにしてある。
 * タグの付け間違いに気づくのは記録した直後なので、その場で直せることが大事。
 */
export function SessionEditModal({
  target,
  onClose,
}: {
  target: SessionTarget
  onClose: () => void
}) {
  const [d, setD] = useState<Draft | null>(() => toDraft(target))
  useEffect(() => setD(toDraft(target)), [target])
  if (!d) return null

  const startedAt = resolve(d.startedAt, d.origStart)
  const endedAt = resolve(d.endedAt, d.origEnd)
  const invalid = endedAt <= startedAt

  const save = async () => {
    if (invalid) return
    if (d.id) {
      await updateSession(d.id, { tagId: d.tagId, startedAt, endedAt, memo: d.memo })
    } else {
      await createSession({ tagId: d.tagId, startedAt, endedAt, memo: d.memo, source: 'manual' })
    }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={d.id ? '記録を編集' : '時間を手動で追加'}>
      <div className="flex flex-col gap-4">
        <div>
          <span className="mb-2 block text-[12px] font-semibold text-muted">タグ</span>
          <TagPicker value={d.tagId} onChange={(id) => setD({ ...d, tagId: id })} scope="time" />
        </div>
        <Field label="開始">
          <input
            id="ses-started-at"
            type="datetime-local"
            value={d.startedAt}
            onChange={(e) => setD({ ...d, startedAt: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="終了">
          <input
            id="ses-ended-at"
            type="datetime-local"
            value={d.endedAt}
            onChange={(e) => setD({ ...d, endedAt: e.target.value })}
            className={inputClass}
          />
        </Field>
        <Field label="メモ（任意）">
          <input
            id="ses-memo"
            type="text"
            value={d.memo}
            onChange={(e) => setD({ ...d, memo: e.target.value })}
            className={inputClass}
            placeholder="第3章まで"
          />
        </Field>

        {invalid && <p className="text-[12.5px] text-danger">終了は開始より後の時刻にしてください。</p>}

        <div className="flex gap-2.5">
          {d.id && (
            <Button
              variant="danger"
              onClick={async () => {
                await deleteSession(d.id!)
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
