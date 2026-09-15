import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive } from '../db/repo'
import type { Group, Id, Tag, TagScope } from '../db/types'
import { Dot } from './ui'

export function useTags() {
  const tags = useLiveQuery(() => db.tags.toArray(), [], undefined)
  return alive(tags)
    .filter((t) => !t.archived)
    .sort((a, b) => a.order - b.order)
}

export function useGroups() {
  const groups = useLiveQuery(() => db.groups.toArray(), [], undefined)
  return alive(groups).sort((a, b) => a.order - b.order)
}

/**
 * その場面で使えるタグだけに絞る。
 * グループに用途が設定されていれば従い、グループに属さないタグは常に使える。
 */
export function filterByScope(tags: Tag[], groups: Group[], scope: TagScope | undefined): Tag[] {
  if (!scope || scope === 'both') return tags
  return tags.filter((t) => {
    if (!t.groupId) return true
    const g = groups.find((x) => x.id === t.groupId)
    if (!g) return true
    return g.scope === 'both' || g.scope === scope
  })
}

export function TagPicker({
  value,
  onChange,
  allowNone = true,
  scope,
}: {
  value: Id | null
  onChange: (id: Id | null) => void
  allowNone?: boolean
  /** 'time' なら時間用のタグだけ、'money' ならお金用のタグだけを出す */
  scope?: TagScope
}) {
  const allTags = useTags()
  const groups = useGroups()
  const tags = filterByScope(allTags, groups, scope)

  if (tags.length === 0) {
    return (
      <p className="text-[13px] text-muted">
        {allTags.length === 0
          ? 'タグがまだありません。「タグ」画面で作成してください。'
          : 'この用途で使えるタグがありません。「タグ」画面でグループの用途を確認してください。'}
      </p>
    )
  }

  const grouped: { key: string; name: string | null; items: Tag[] }[] = []
  for (const g of groups) {
    const items = tags.filter((t) => t.groupId === g.id)
    if (items.length) grouped.push({ key: g.id, name: g.name, items })
  }
  const ungrouped = tags.filter((t) => !t.groupId || !groups.some((g) => g.id === t.groupId))
  if (ungrouped.length) grouped.push({ key: '__none', name: null, items: ungrouped })

  return (
    <div className="flex flex-col gap-3">
      {grouped.map((section) => (
        <div key={section.key}>
          {section.name && (
            <div className="mb-1.5 text-[11px] font-semibold tracking-wider text-muted">
              {section.name}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {section.items.map((t) => {
              const on = value === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => onChange(on ? null : t.id)}
                  aria-pressed={on}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13.5px] font-medium ${
                    on ? 'border-transparent text-paper' : 'border-rule bg-surface text-ink2'
                  }`}
                  style={on ? { background: t.color } : undefined}
                >
                  {!on && <Dot color={t.color} />}
                  {t.name}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {allowNone && value !== null && (
        <button onClick={() => onChange(null)} className="self-start text-[12.5px] text-muted underline">
          タグなしにする
        </button>
      )}
    </div>
  )
}
