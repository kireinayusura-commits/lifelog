import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Block, BlockKind, Id, Part } from '../db/types'
import { BLOCK_KIND_LABEL } from '../db/types'
import { Button, Card, Dot, Field, FieldGroup, Modal, inputClass } from './ui'
import { TagPicker, useTags } from './TagPicker'
import { formatLen, formatMin, parseMin } from '../schedule/logic'
import {
  clearFrame,
  createPart,
  deleteBlock,
  deletePart,
  deleteTemplate,
  listParts,
  placeBlock,
  setFrame,
  updateBlock,
  updatePart,
  type Frame,
} from '../schedule/repo'

const KINDS: BlockKind[] = ['study', 'life', 'event']
const QUICK = [15, 25, 30, 45, 60, 90, 120, 150]

/** 長さの入力。よく使う長さは押すだけで入る。 */
function DurationInput({
  value,
  onChange,
  max,
}: {
  value: number
  onChange: (v: number) => void
  max?: number
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 0))}
          className={`${inputClass} w-24`}
        />
        <span className="text-[13px] text-muted">分</span>
        {max !== undefined && value > max && (
          <span className="text-[12px] text-warn">空き（{formatLen(max)}）を超えています</span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onChange(q)}
            className={`rounded-lg border px-2.5 py-1 text-[12.5px] ${
              value === q ? 'border-time bg-time text-paper' : 'border-rule bg-surface text-ink2'
            }`}
          >
            {formatLen(q)}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 置く

type PlaceStep =
  | { mode: 'pick' }
  | { mode: 'length'; part: Part }
  | { mode: 'oneoff' }

/**
 * 空きに何を置くか選ぶ。
 * 部品から置くか、その日限りの予定を直接入れるか。
 */
export function PlaceModal({
  open,
  date,
  gap,
  onClose,
  onManageParts,
}: {
  open: boolean
  date: string
  gap: { startMin: number; endMin: number } | null
  onClose: () => void
  onManageParts: () => void
}) {
  const parts = useLiveQuery(() => listParts(), [], undefined)
  const [step, setStep] = useState<PlaceStep>({ mode: 'pick' })
  const [len, setLen] = useState(60)
  const [name, setName] = useState('')
  const [tagId, setTagId] = useState<Id | null>(null)
  const [kind, setKind] = useState<BlockKind>('event')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setStep({ mode: 'pick' })
      setErr(null)
      setName('')
      setTagId(null)
      setKind('event')
    }
  }, [open])

  if (!gap) return null
  const room = gap.endMin - gap.startMin

  const put = async (input: {
    durationMin: number
    title: string
    tagId: Id | null
    kind: BlockKind
    partId?: Id | null
  }) => {
    const r = await placeBlock({ date, startMin: gap.startMin, ...input })
    if (!r.ok) {
      setErr(r.conflict ? `「${r.conflict.title}」と重なります` : '置けませんでした')
      return
    }
    onClose()
  }

  const title =
    step.mode === 'pick'
      ? `${formatMin(gap.startMin)} に置く`
      : step.mode === 'length'
        ? `${step.part.name} の長さ`
        : 'この日だけの予定'

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {step.mode === 'pick' && (
        <>
          <p className="text-[12.5px] text-muted">
            空きは {formatLen(room)}（{formatMin(gap.startMin)}〜{formatMin(gap.endMin)}）
          </p>

          <div className="mt-3 max-h-[46vh] overflow-y-auto">
            {KINDS.map((k) => {
              const items = (parts ?? []).filter((p) => p.kind === k)
              if (items.length === 0) return null
              return (
                <div key={k} className="mb-3">
                  <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted">
                    {BLOCK_KIND_LABEL[k]}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.map((p) => {
                      const fixed = p.durationMin !== null
                      const tooLong = fixed && p.durationMin! > room
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={tooLong}
                          onClick={() => {
                            setErr(null)
                            if (fixed) {
                              void put({
                                durationMin: p.durationMin!,
                                title: p.name,
                                tagId: p.tagId,
                                kind: p.kind,
                                partId: p.id,
                              })
                            } else {
                              setLen(Math.min(p.lastDurationMin ?? 60, Math.max(room, 5)))
                              setStep({ mode: 'length', part: p })
                            }
                          }}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left ${
                            tooLong
                              ? 'border-rulesoft bg-surface2 opacity-50'
                              : 'border-rule bg-surface'
                          }`}
                        >
                          <span className="text-[14px] font-medium">{p.name}</span>
                          <span className="text-[12.5px] text-muted">
                            {tooLong
                              ? '入りません'
                              : fixed
                                ? formatLen(p.durationMin!)
                                : '長さを決める'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {(parts ?? []).length === 0 && (
              <p className="rounded-xl border border-dashed border-rule px-4 py-5 text-center text-[13px] text-muted">
                部品がまだありません。よく使うものを作っておくと、置くだけで済みます。
              </p>
            )}
          </div>

          {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}

          <div className="mt-4 flex flex-wrap gap-2.5">
            <Button variant="primary" onClick={() => setStep({ mode: 'oneoff' })}>
              この日だけの予定
            </Button>
            <Button onClick={onManageParts}>部品を作る・直す</Button>
          </div>
        </>
      )}

      {step.mode === 'length' && (
        <>
          <DurationInput value={len} onChange={setLen} max={room} />
          {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}
          <div className="mt-5 flex gap-2.5">
            <Button className="flex-1" onClick={() => setStep({ mode: 'pick' })}>
              戻る
            </Button>
            <Button
              className="flex-1"
              variant="primary"
              onClick={() =>
                put({
                  durationMin: len,
                  title: step.part.name,
                  tagId: step.part.tagId,
                  kind: step.part.kind,
                  partId: step.part.id,
                })
              }
            >
              置く
            </Button>
          </div>
        </>
      )}

      {step.mode === 'oneoff' && (
        <>
          <p className="text-[12.5px] leading-relaxed text-muted">
            部品箱には残りません。歯医者・友人と約束、のような一度きりの予定に使ってください。
          </p>
          <div className="mt-3">
            <Field label="名前">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="歯医者"
              />
            </Field>
          </div>
          <div className="mt-3">
            <FieldGroup label="長さ">
              <DurationInput value={len} onChange={setLen} max={room} />
            </FieldGroup>
          </div>
          <div className="mt-3">
            <FieldGroup label="種類">
              <div className="flex gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[13px] ${
                      kind === k ? 'border-time bg-time text-paper' : 'border-rule bg-surface'
                    }`}
                  >
                    {BLOCK_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>
          {kind === 'study' && (
            <div className="mt-3">
              <FieldGroup label="タグ">
                <TagPicker value={tagId} onChange={setTagId} scope="time" />
              </FieldGroup>
            </div>
          )}
          {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}
          <div className="mt-5 flex gap-2.5">
            <Button className="flex-1" onClick={() => setStep({ mode: 'pick' })}>
              戻る
            </Button>
            <Button
              className="flex-1"
              variant="primary"
              disabled={!name.trim()}
              onClick={() => put({ durationMin: len, title: name, tagId, kind })}
            >
              置く
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- 直す

export function BlockEditModal({
  block,
  onClose,
}: {
  block: Block | null
  onClose: () => void
}) {
  const [startText, setStartText] = useState('')
  const [len, setLen] = useState(60)
  const [title, setTitle] = useState('')
  const [tagId, setTagId] = useState<Id | null>(null)
  const [kind, setKind] = useState<BlockKind>('study')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!block) return
    setStartText(formatMin(block.startMin))
    setLen(block.durationMin)
    setTitle(block.title)
    setTagId(block.tagId)
    setKind(block.kind)
    setErr(null)
  }, [block])

  if (!block) return null

  const save = async () => {
    const startMin = parseMin(startText)
    if (startMin === null) {
      setErr('開始時刻は 9:00 のように入れてください（翌1:30 も使えます）')
      return
    }
    const r = await updateBlock(block.id, {
      startMin,
      durationMin: len,
      title: title.trim() || block.title,
      tagId,
      kind,
    })
    if (!r.ok) {
      setErr(r.conflict ? `「${r.conflict.title}」と重なります` : '保存できませんでした')
      return
    }
    onClose()
  }

  return (
    <Modal open={!!block} onClose={onClose} title="予定を直す">
      <Field label="名前">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </Field>

      <div className="mt-3">
        <Field label="開始">
          <input
            type="text"
            inputMode="numeric"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            className={`${inputClass} w-32`}
            placeholder="9:00"
          />
        </Field>
      </div>

      <div className="mt-3">
        <FieldGroup label="長さ">
          <DurationInput value={len} onChange={setLen} />
        </FieldGroup>
      </div>

      <div className="mt-3">
        <FieldGroup label="種類">
          <div className="flex gap-1.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={`flex-1 rounded-lg border px-2 py-2 text-[13px] ${
                  kind === k ? 'border-time bg-time text-paper' : 'border-rule bg-surface'
                }`}
              >
                {BLOCK_KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </FieldGroup>
      </div>

      {kind === 'study' && (
        <div className="mt-3">
          <FieldGroup label="タグ">
            <TagPicker value={tagId} onChange={setTagId} scope="time" />
          </FieldGroup>
        </div>
      )}

      {err && <p className="mt-3 text-[12.5px] leading-relaxed text-danger">{err}</p>}

      <div className="mt-5 flex gap-2.5">
        <Button
          variant="danger"
          onClick={async () => {
            await deleteBlock(block.id)
            onClose()
          }}
        >
          削除
        </Button>
        <Button className="flex-1" onClick={onClose}>
          やめる
        </Button>
        <Button className="flex-1" variant="primary" onClick={save}>
          保存
        </Button>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------- 部品箱

export function PartsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const parts = useLiveQuery(() => listParts(), [], undefined)
  const tags = useTags()
  const [editing, setEditing] = useState<Part | 'new' | null>(null)

  const [name, setName] = useState('')
  const [fixed, setFixed] = useState(true)
  const [len, setLen] = useState(60)
  const [tagId, setTagId] = useState<Id | null>(null)
  const [kind, setKind] = useState<BlockKind>('study')

  const start = (p: Part | 'new') => {
    setEditing(p)
    if (p === 'new') {
      setName('')
      setFixed(true)
      setLen(60)
      setTagId(null)
      setKind('study')
    } else {
      setName(p.name)
      setFixed(p.durationMin !== null)
      setLen(p.durationMin ?? p.lastDurationMin ?? 60)
      setTagId(p.tagId)
      setKind(p.kind)
    }
  }

  const save = async () => {
    const payload = {
      name: name.trim(),
      durationMin: fixed ? len : null,
      tagId: kind === 'study' ? tagId : null,
      kind,
    }
    if (!payload.name) return
    if (editing === 'new') await createPart(payload)
    else if (editing) await updatePart(editing.id, payload)
    setEditing(null)
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        setEditing(null)
        onClose()
      }}
      title={editing ? (editing === 'new' ? '部品を作る' : '部品を直す') : '部品箱'}
    >
      {!editing ? (
        <>
          <p className="text-[12.5px] leading-relaxed text-muted">
            よく置くものを部品にしておくと、選ぶだけで置けます。
            長さを決めておくものと、置くたびに長さを決めるものの2通りが作れます。
          </p>

          <div className="mt-3 max-h-[48vh] overflow-y-auto">
            {KINDS.map((k) => {
              const items = (parts ?? []).filter((p) => p.kind === k)
              if (items.length === 0) return null
              return (
                <div key={k} className="mb-3">
                  <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted">
                    {BLOCK_KIND_LABEL[k]}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {items.map((p) => {
                      const tag = tags.find((t) => t.id === p.tagId)
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => start(p)}
                          className="flex items-center justify-between rounded-xl border border-rule bg-surface px-3 py-2.5 text-left"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {tag && <Dot color={tag.color} />}
                            <span className="truncate text-[14px] font-medium">{p.name}</span>
                          </span>
                          <span className="shrink-0 text-[12.5px] text-muted">
                            {p.durationMin === null ? '長さは都度' : formatLen(p.durationMin)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            {(parts ?? []).length === 0 && (
              <p className="rounded-xl border border-dashed border-rule px-4 py-5 text-center text-[13px] text-muted">
                まだ部品がありません
              </p>
            )}
          </div>

          <div className="mt-4">
            <Button variant="primary" onClick={() => start('new')}>
              部品を作る
            </Button>
          </div>
        </>
      ) : (
        <>
          <Field label="名前">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="講義1コマ"
            />
          </Field>

          <div className="mt-3">
            <FieldGroup label="種類">
              <div className="flex gap-1.5">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 rounded-lg border px-2 py-2 text-[13px] ${
                      kind === k ? 'border-time bg-time text-paper' : 'border-rule bg-surface'
                    }`}
                  >
                    {BLOCK_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
            </FieldGroup>
          </div>

          <div className="mt-3">
            <FieldGroup label="長さ">
              <div className="mb-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setFixed(true)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[13px] ${
                    fixed ? 'border-time bg-time text-paper' : 'border-rule bg-surface'
                  }`}
                >
                  決めておく
                </button>
                <button
                  type="button"
                  onClick={() => setFixed(false)}
                  className={`flex-1 rounded-lg border px-2 py-2 text-[13px] ${
                    !fixed ? 'border-time bg-time text-paper' : 'border-rule bg-surface'
                  }`}
                >
                  置くときに決める
                </button>
              </div>
              {fixed && <DurationInput value={len} onChange={setLen} />}
            </FieldGroup>
          </div>

          {kind === 'study' && (
            <div className="mt-3">
              <FieldGroup label="タグ">
                <TagPicker value={tagId} onChange={setTagId} scope="time" />
              </FieldGroup>
            </div>
          )}

          <div className="mt-5 flex gap-2.5">
            {editing !== 'new' && (
              <Button
                variant="danger"
                onClick={async () => {
                  await deletePart(editing.id)
                  setEditing(null)
                }}
              >
                削除
              </Button>
            )}
            <Button className="flex-1" onClick={() => setEditing(null)}>
              やめる
            </Button>
            <Button className="flex-1" variant="primary" disabled={!name.trim()} onClick={save}>
              保存
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- 型

export function TemplateModal({
  open,
  date,
  hasBlocks,
  onClose,
  onApply,
  onSave,
}: {
  open: boolean
  date: string
  hasBlocks: boolean
  onClose: () => void
  onApply: (id: Id, name: string) => void
  onSave: (name: string) => void
}) {
  const templates = useLiveQuery(
    () => db.templates.toArray().then((r) => r.filter((t) => t.deletedAt === null)),
    [],
    undefined,
  )
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  useEffect(() => {
    if (open) {
      setSaving(false)
      setName('')
    }
  }, [open, date])

  return (
    <Modal open={open} onClose={onClose} title="型">
      {!saving ? (
        <>
          <p className="text-[12.5px] leading-relaxed text-muted">
            一日の並びをまるごと保存して、別の日に呼び出せます。
            呼び出したあとは普通に直せます。
          </p>

          <div className="mt-3 flex max-h-[40vh] flex-col gap-1.5 overflow-y-auto">
            {(templates ?? []).map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-surface px-3 py-2.5"
              >
                <span className="min-w-0 truncate text-[14px] font-medium">{t.name}</span>
                <span className="flex shrink-0 gap-2">
                  <Button onClick={() => onApply(t.id, t.name)}>入れる</Button>
                  <Button variant="danger" onClick={() => void deleteTemplate(t.id)}>
                    削除
                  </Button>
                </span>
              </div>
            ))}
            {(templates ?? []).length === 0 && (
              <p className="rounded-xl border border-dashed border-rule px-4 py-5 text-center text-[13px] text-muted">
                まだ型がありません。一日を組んでから「いまの並びを保存」を押してください。
              </p>
            )}
          </div>

          <div className="mt-4">
            <Button variant="primary" disabled={!hasBlocks} onClick={() => setSaving(true)}>
              いまの並びを保存
            </Button>
            {!hasBlocks && (
              <p className="mt-2 text-[12px] text-muted">
                この日には何も置かれていないので、保存できません。
              </p>
            )}
          </div>
        </>
      ) : (
        <>
          <Field label="型の名前">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="平日 / 登校日 / 模試前日"
            />
          </Field>
          <div className="mt-5 flex gap-2.5">
            <Button className="flex-1" onClick={() => setSaving(false)}>
              戻る
            </Button>
            <Button
              className="flex-1"
              variant="primary"
              disabled={!name.trim()}
              onClick={() => onSave(name)}
            >
              保存
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}

// ---------------------------------------------------------------- 一日の枠

export function FrameModal({
  open,
  date,
  frame,
  onClose,
}: {
  open: boolean
  date: string
  frame: Frame
  onClose: () => void
}) {
  const [startText, setStartText] = useState('')
  const [endText, setEndText] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setStartText(formatMin(frame.startMin))
    setEndText(formatMin(frame.endMin))
    setErr(null)
  }, [open, frame.startMin, frame.endMin])

  const save = async () => {
    const s = parseMin(startText)
    const e = parseMin(endText)
    if (s === null || e === null) {
      setErr('9:00 や 翌1:30 のように入れてください')
      return
    }
    if (e <= s) {
      setErr('終わりが始まりより前になっています')
      return
    }
    await setFrame(date, s, e)
    onClose()
  }

  const memo = useMemo(() => {
    const s = parseMin(startText)
    const e = parseMin(endText)
    if (s === null || e === null || e <= s) return null
    return `起きているのは ${formatLen(e - s)}`
  }, [startText, endText])

  return (
    <Modal open={open} onClose={onClose} title="この日の枠">
      <p className="text-[12.5px] leading-relaxed text-muted">
        起きてから寝るまでの範囲です。ここを決めると「使える時間」が出ます。
        遅く起きた日や夜更かしする日は、この日だけ変えてください。
      </p>

      <div className="mt-3 flex items-end gap-2">
        <Field label="起きる">
          <input
            type="text"
            inputMode="numeric"
            value={startText}
            onChange={(e) => setStartText(e.target.value)}
            className={`${inputClass} w-28`}
          />
        </Field>
        <span className="pb-3 text-muted">〜</span>
        <Field label="寝る">
          <input
            type="text"
            inputMode="numeric"
            value={endText}
            onChange={(e) => setEndText(e.target.value)}
            className={`${inputClass} w-28`}
          />
        </Field>
      </div>

      {memo && <p className="mt-2 text-[12.5px] text-muted">{memo}</p>}
      {err && <p className="mt-2 text-[12.5px] text-danger">{err}</p>}

      <div className="mt-5 flex gap-2.5">
        {frame.custom && (
          <Button
            onClick={async () => {
              await clearFrame(date)
              onClose()
            }}
          >
            既定に戻す
          </Button>
        )}
        <Button className="flex-1" onClick={onClose}>
          やめる
        </Button>
        <Button className="flex-1" variant="primary" onClick={save}>
          保存
        </Button>
      </div>
    </Modal>
  )
}

export { Card }
