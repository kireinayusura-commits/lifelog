import { db } from './db'
import type { Base, Group, Id, Session, Tag, Transaction } from './types'
import { TAG_COLORS } from './types'

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  // 古い WebView 向けのフォールバック
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function stamp(): Pick<Base, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  const now = Date.now()
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null }
}

/** 生きているレコードだけを返す（論理削除済みを除外） */
export function alive<T extends Base>(rows: T[] | undefined): T[] {
  return (rows ?? []).filter((r) => r.deletedAt === null)
}

// ---------- グループ ----------

export async function createGroup(name: string, color?: string): Promise<Id> {
  const count = await db.groups.count()
  const g: Group = {
    ...stamp(),
    name: name.trim(),
    color: color ?? TAG_COLORS[count % TAG_COLORS.length],
    order: count,
  }
  await db.groups.add(g)
  return g.id
}

export async function updateGroup(id: Id, patch: Partial<Group>): Promise<void> {
  await db.groups.update(id, { ...patch, updatedAt: Date.now() })
}

/** グループを削除しても、中のタグは残す（未分類になる） */
export async function deleteGroup(id: Id): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.groups, db.tags, async () => {
    await db.groups.update(id, { deletedAt: now, updatedAt: now })
    const tags = await db.tags.where('groupId').equals(id).toArray()
    await Promise.all(
      tags.map((t) => db.tags.update(t.id, { groupId: null, updatedAt: now })),
    )
  })
}

// ---------- タグ ----------

export async function createTag(name: string, groupId: Id | null, color?: string): Promise<Id> {
  const count = await db.tags.count()
  const t: Tag = {
    ...stamp(),
    name: name.trim(),
    groupId,
    color: color ?? TAG_COLORS[count % TAG_COLORS.length],
    archived: false,
    order: count,
  }
  await db.tags.add(t)
  return t.id
}

export async function updateTag(id: Id, patch: Partial<Tag>): Promise<void> {
  await db.tags.update(id, { ...patch, updatedAt: Date.now() })
}

/**
 * タグを削除しても記録は消さない。記録の tagId だけ外す。
 * 「タグを整理したら3ヶ月分の記録が消えた」を起こさないための判断。
 */
export async function deleteTag(id: Id): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', db.tags, db.sessions, db.transactions, async () => {
    await db.tags.update(id, { deletedAt: now, updatedAt: now })
    const ss = await db.sessions.where('tagId').equals(id).toArray()
    await Promise.all(ss.map((s) => db.sessions.update(s.id, { tagId: null, updatedAt: now })))
    const ts = await db.transactions.where('tagId').equals(id).toArray()
    await Promise.all(ts.map((t) => db.transactions.update(t.id, { tagId: null, updatedAt: now })))
  })
}

// ---------- 記録 ----------

export async function createSession(input: {
  tagId: Id | null
  startedAt: number
  endedAt: number
  memo?: string
  source?: Session['source']
}): Promise<Id> {
  const durationSec = Math.max(0, Math.round((input.endedAt - input.startedAt) / 1000))
  const s: Session = {
    ...stamp(),
    tagId: input.tagId,
    startedAt: input.startedAt,
    endedAt: input.endedAt,
    durationSec,
    memo: input.memo ?? '',
    source: input.source ?? 'manual',
  }
  await db.sessions.add(s)
  return s.id
}

export async function updateSession(id: Id, patch: Partial<Session>): Promise<void> {
  const next: Partial<Session> = { ...patch, updatedAt: Date.now() }
  if (patch.startedAt !== undefined || patch.endedAt !== undefined) {
    const cur = await db.sessions.get(id)
    if (cur) {
      const startedAt = patch.startedAt ?? cur.startedAt
      const endedAt = patch.endedAt ?? cur.endedAt
      next.durationSec = Math.max(0, Math.round((endedAt - startedAt) / 1000))
    }
  }
  await db.sessions.update(id, next)
}

export async function deleteSession(id: Id): Promise<void> {
  const now = Date.now()
  await db.sessions.update(id, { deletedAt: now, updatedAt: now })
}

// ---------- 支出 ----------

export async function createTransaction(input: {
  amount: number
  name: string
  tagId: Id | null
  occurredAt?: number
}): Promise<Id> {
  const t: Transaction = {
    ...stamp(),
    amount: Math.round(input.amount),
    type: 'expense',
    tagId: input.tagId,
    name: input.name.trim(),
    occurredAt: input.occurredAt ?? Date.now(),
  }
  await db.transactions.add(t)
  return t.id
}

export async function updateTransaction(id: Id, patch: Partial<Transaction>): Promise<void> {
  const next: Partial<Transaction> = { ...patch, updatedAt: Date.now() }
  if (patch.amount !== undefined) next.amount = Math.round(patch.amount)
  if (patch.name !== undefined) next.name = patch.name.trim()
  await db.transactions.update(id, next)
}

export async function deleteTransaction(id: Id): Promise<void> {
  const now = Date.now()
  await db.transactions.update(id, { deletedAt: now, updatedAt: now })
}

// ---------- 初回起動 ----------

/**
 * 空のアプリは何をすればいいか分からないので、例としてタグを3つ置く。
 * 分類の意味づけはしない（「勉強」「趣味」などのプリセットを作らない）。
 */
export async function seedIfEmpty(): Promise<void> {
  const n = await db.tags.count()
  if (n > 0) return
  await createTag('英語', null)
  await createTag('読書', null)
  await createTag('制作', null)
}
