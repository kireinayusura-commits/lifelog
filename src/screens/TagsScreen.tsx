import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import {
  alive,
  createGroup,
  createTag,
  deleteGroup,
  deleteTag,
  updateGroup,
  updateTag,
} from '../db/repo'
import { useGroups, useTags } from '../components/TagPicker'
import { Button, Card, Dot, Field, Modal, Screen, inputClass } from '../components/ui'
import { TAG_COLORS } from '../db/types'
import { formatDuration } from '../lib/time'
import { formatYen } from '../lib/money'

export function TagsScreen() {
  const tags = useTags()
  const groups = useGroups()
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)

  const [tagModal, setTagModal] = useState<{
    id: string | null
    name: string
    groupId: string | null
    color: string
  } | null>(null)
  const [groupModal, setGroupModal] = useState<{ id: string | null; name: string } | null>(null)

  /** タグごとの「投じた時間」と「投じたお金」。共通タグにした意味がここに出る。 */
  const totals = useMemo(() => {
    const m = new Map<string, { sec: number; yen: number }>()
    const bucket = (id: string) => {
      let b = m.get(id)
      if (!b) m.set(id, (b = { sec: 0, yen: 0 }))
      return b
    }
    for (const s of alive(sessions)) {
      if (s.tagId) bucket(s.tagId).sec += s.durationSec
    }
    for (const t of alive(transactions)) {
      if (t.tagId) bucket(t.tagId).yen += t.amount
    }
    return m
  }, [sessions, transactions])

  const sections = useMemo(() => {
    const out: { key: string; name: string | null; items: typeof tags }[] = []
    for (const g of groups) {
      out.push({ key: g.id, name: g.name, items: tags.filter((t) => t.groupId === g.id) })
    }
    const rest = tags.filter((t) => !t.groupId || !groups.some((g) => g.id === t.groupId))
    if (rest.length || groups.length === 0) out.push({ key: '__none', name: null, items: rest })
    return out
  }, [tags, groups])

  const saveTag = async () => {
    if (!tagModal || !tagModal.name.trim()) return
    if (tagModal.id) {
      await updateTag(tagModal.id, {
        name: tagModal.name.trim(),
        groupId: tagModal.groupId,
        color: tagModal.color,
      })
    } else {
      await createTag(tagModal.name, tagModal.groupId, tagModal.color)
    }
    setTagModal(null)
  }

  const saveGroup = async () => {
    if (!groupModal || !groupModal.name.trim()) return
    if (groupModal.id) await updateGroup(groupModal.id, { name: groupModal.name.trim() })
    else await createGroup(groupModal.name)
    setGroupModal(null)
  }

  return (
    <Screen
      title="タグ"
      action={
        <Button
          className="px-3 py-1.5 text-[13.5px]"
          onClick={() =>
            setTagModal({ id: null, name: '', groupId: null, color: TAG_COLORS[tags.length % TAG_COLORS.length] })
          }
        >
          + タグ
        </Button>
      }
    >
      <p className="mb-4 text-[12.5px] leading-relaxed text-muted">
        タグは時間の記録にも支出にも共通で使います。右側は、そのタグに投じた時間と金額の累計です。
        グループ名もタグ名も自由につけられます — 科目で分けても、ジャンルで分けても構いません。
      </p>

      <div className="flex flex-col gap-5">
        {sections.map((sec) => (
          <section key={sec.key}>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="text-[13px] font-bold">{sec.name ?? 'グループなし'}</h2>
              {sec.name && (
                <div className="flex gap-3 text-[12px] text-muted">
                  <button
                    className="underline"
                    onClick={() => setGroupModal({ id: sec.key, name: sec.name! })}
                  >
                    名前を変更
                  </button>
                  <button className="underline" onClick={() => deleteGroup(sec.key)}>
                    削除
                  </button>
                </div>
              )}
            </div>

            {sec.items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-rule px-4 py-5 text-center text-[12.5px] text-muted">
                このグループにタグはありません
              </div>
            ) : (
              <Card className="divide-y divide-rulesoft">
                {sec.items.map((t) => {
                  const tot = totals.get(t.id)
                  return (
                    <button
                      key={t.id}
                      onClick={() =>
                        setTagModal({ id: t.id, name: t.name, groupId: t.groupId, color: t.color })
                      }
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <Dot color={t.color} />
                      <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">
                        {t.name}
                      </span>
                      <span className="tnum flex shrink-0 items-baseline gap-2.5 text-[13px] font-semibold">
                        {tot?.sec ? (
                          <span className="text-time">{formatDuration(tot.sec)}</span>
                        ) : null}
                        {tot?.yen ? <span className="text-money">{formatYen(tot.yen)}</span> : null}
                        {!tot?.sec && !tot?.yen ? (
                          <span className="font-normal text-muted">—</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </Card>
            )}
          </section>
        ))}
      </div>

      <div className="mt-6">
        <Button className="w-full" onClick={() => setGroupModal({ id: null, name: '' })}>
          + グループを作る
        </Button>
      </div>

      {/* タグの編集 */}
      <Modal open={!!tagModal} onClose={() => setTagModal(null)} title={tagModal?.id ? 'タグを編集' : 'タグを作る'}>
        {tagModal && (
          <div className="flex flex-col gap-4">
            <Field label="名前">
              <input
                id="tag-name"
                type="text"
                value={tagModal.name}
                onChange={(e) => setTagModal({ ...tagModal, name: e.target.value })}
                className={inputClass}
                placeholder="英語 / ゲーム / 卒論 など"
                autoFocus
              />
            </Field>

            <div>
              <span className="mb-2 block text-[12px] font-semibold text-muted">色</span>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map((c) => (
                  <button
                    key={c}
                    aria-label={`色 ${c}`}
                    onClick={() => setTagModal({ ...tagModal, color: c })}
                    className={`size-8 rounded-full ${tagModal.color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-surface' : ''}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <span className="mb-2 block text-[12px] font-semibold text-muted">グループ</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setTagModal({ ...tagModal, groupId: null })}
                  className={`rounded-full border px-3 py-1.5 text-[13px] ${
                    tagModal.groupId === null ? 'border-ink bg-ink text-paper' : 'border-rule text-ink2'
                  }`}
                >
                  なし
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => setTagModal({ ...tagModal, groupId: g.id })}
                    className={`rounded-full border px-3 py-1.5 text-[13px] ${
                      tagModal.groupId === g.id ? 'border-ink bg-ink text-paper' : 'border-rule text-ink2'
                    }`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2.5">
              {tagModal.id && (
                <Button
                  variant="danger"
                  onClick={async () => {
                    await deleteTag(tagModal.id!)
                    setTagModal(null)
                  }}
                >
                  削除
                </Button>
              )}
              <Button className="flex-1" variant="primary" onClick={saveTag} disabled={!tagModal.name.trim()}>
                保存
              </Button>
            </div>
            {tagModal.id && (
              <p className="text-[12px] leading-relaxed text-muted">
                タグを削除しても、これまでの記録は消えません（タグなしの記録として残ります）。
              </p>
            )}
          </div>
        )}
      </Modal>

      {/* グループの編集 */}
      <Modal
        open={!!groupModal}
        onClose={() => setGroupModal(null)}
        title={groupModal?.id ? 'グループ名を変更' : 'グループを作る'}
      >
        {groupModal && (
          <div className="flex flex-col gap-4">
            <Field label="名前">
              <input
                id="group-name"
                type="text"
                value={groupModal.name}
                onChange={(e) => setGroupModal({ ...groupModal, name: e.target.value })}
                className={inputClass}
                placeholder="自由に決められます"
                autoFocus
              />
            </Field>
            <Button variant="primary" onClick={saveGroup} disabled={!groupModal.name.trim()}>
              保存
            </Button>
          </div>
        )}
      </Modal>
    </Screen>
  )
}
