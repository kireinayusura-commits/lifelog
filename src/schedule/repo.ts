/**
 * 予定の読み書き。
 * 画面から Dexie を直接触らずに済むよう、ここに集める。
 */
import { db, getSettings } from '../db/db'
import { alive, newId, stamp } from '../db/repo'
import type { Block, BlockKind, Day, Id, Part, Template, TemplateBlock } from '../db/types'
import { findOverlap } from './logic'

// ---------------------------------------------------------------- 部品

export async function listParts(): Promise<Part[]> {
  return alive(await db.parts.toArray()).sort((a, b) => a.order - b.order)
}

export async function createPart(input: {
  name: string
  durationMin: number | null
  tagId: Id | null
  kind: BlockKind
}): Promise<Id> {
  const count = await db.parts.count()
  const p: Part = {
    ...stamp(),
    name: input.name.trim(),
    durationMin: input.durationMin,
    tagId: input.tagId,
    kind: input.kind,
    order: count,
    lastDurationMin: null,
  }
  await db.parts.add(p)
  return p.id
}

export async function updatePart(id: Id, patch: Partial<Part>): Promise<void> {
  await db.parts.update(id, { ...patch, updatedAt: Date.now() })
}

export async function deletePart(id: Id): Promise<void> {
  const now = Date.now()
  await db.parts.update(id, { deletedAt: now, updatedAt: now })
}

// ---------------------------------------------------------------- 一日の枠

export interface Frame {
  startMin: number
  endMin: number
  /** その日だけの指定か（既定のままなら false） */
  custom: boolean
}

export async function getFrame(date: string): Promise<Frame> {
  const s = await getSettings()
  const d = await db.days.get(date)
  if (d && d.deletedAt === null) {
    return { startMin: d.startMin, endMin: d.endMin, custom: true }
  }
  return { startMin: s.dayStartMin, endMin: s.dayEndMin, custom: false }
}

export async function setFrame(date: string, startMin: number, endMin: number): Promise<void> {
  const now = Date.now()
  const existing = await db.days.get(date)
  const row: Day = existing
    ? { ...existing, startMin, endMin, deletedAt: null, updatedAt: now }
    : { id: date, createdAt: now, updatedAt: now, deletedAt: null, startMin, endMin }
  await db.days.put(row)
}

/** その日だけの指定をやめて、設定の既定に戻す */
export async function clearFrame(date: string): Promise<void> {
  const now = Date.now()
  const existing = await db.days.get(date)
  if (existing) await db.days.update(date, { deletedAt: now, updatedAt: now })
}

// ---------------------------------------------------------------- ブロック

export async function listBlocks(date: string): Promise<Block[]> {
  return alive(await db.blocks.where('date').equals(date).toArray())
}

export interface PlaceResult {
  ok: boolean
  /** 置けなかったとき、ぶつかった相手 */
  conflict?: Block
  id?: Id
}

/**
 * ブロックを置く。
 * 重なっていたら置かずに、ぶつかった相手を返す。
 * 勝手にずらしたり縮めたりはしない。
 */
export async function placeBlock(input: {
  date: string
  startMin: number
  durationMin: number
  title: string
  tagId: Id | null
  kind: BlockKind
  partId?: Id | null
}): Promise<PlaceResult> {
  const existing = await listBlocks(input.date)
  const candidate: Block = {
    ...stamp(),
    date: input.date,
    startMin: input.startMin,
    durationMin: input.durationMin,
    title: input.title.trim(),
    tagId: input.tagId,
    kind: input.kind,
    partId: input.partId ?? null,
  }
  const conflict = findOverlap(existing, candidate)
  if (conflict) return { ok: false, conflict }

  await db.blocks.add(candidate)

  // 可変長の部品は、次に置くときの初期値として長さを覚えておく
  if (input.partId) {
    const part = await db.parts.get(input.partId)
    if (part && part.durationMin === null) {
      await updatePart(part.id, { lastDurationMin: input.durationMin })
    }
  }
  return { ok: true, id: candidate.id }
}

export async function updateBlock(id: Id, patch: Partial<Block>): Promise<PlaceResult> {
  const current = await db.blocks.get(id)
  if (!current) return { ok: false }
  const next: Block = { ...current, ...patch, updatedAt: Date.now() }
  const others = (await listBlocks(next.date)).filter((b) => b.id !== id)
  const conflict = findOverlap(others, next)
  if (conflict) return { ok: false, conflict }
  await db.blocks.put(next)
  return { ok: true, id }
}

export async function deleteBlock(id: Id): Promise<void> {
  const now = Date.now()
  await db.blocks.update(id, { deletedAt: now, updatedAt: now })
}

export async function clearDay(date: string): Promise<void> {
  const now = Date.now()
  for (const b of await listBlocks(date)) {
    await db.blocks.update(b.id, { deletedAt: now, updatedAt: now })
  }
}

// ---------------------------------------------------------------- 型

export async function listTemplates(): Promise<Template[]> {
  return alive(await db.templates.toArray()).sort((a, b) => a.order - b.order)
}

export async function listTemplateBlocks(templateId: Id): Promise<TemplateBlock[]> {
  return alive(await db.templateBlocks.where('templateId').equals(templateId).toArray()).sort(
    (a, b) => a.startMin - b.startMin,
  )
}

/** いまの一日の並びを、型として保存する */
export async function saveAsTemplate(date: string, name: string): Promise<Id> {
  const blocks = await listBlocks(date)
  const count = await db.templates.count()
  const t: Template = { ...stamp(), name: name.trim() || '名前のない型', order: count }
  await db.templates.add(t)

  const now = Date.now()
  await db.templateBlocks.bulkAdd(
    blocks.map((b) => ({
      id: newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      templateId: t.id,
      startMin: b.startMin,
      durationMin: b.durationMin,
      title: b.title,
      tagId: b.tagId,
      kind: b.kind,
      partId: b.partId,
    })),
  )
  return t.id
}

/**
 * 型を今日に展開する。
 * すでに置いてあるものは消してから入れる（重なりを作らないため）。
 * 呼ぶ前に確認を取ること。
 */
export async function applyTemplate(templateId: Id, date: string): Promise<number> {
  await clearDay(date)
  const rows = await listTemplateBlocks(templateId)
  const now = Date.now()
  await db.blocks.bulkAdd(
    rows.map((r) => ({
      id: newId(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      date,
      startMin: r.startMin,
      durationMin: r.durationMin,
      title: r.title,
      tagId: r.tagId,
      kind: r.kind,
      partId: r.partId,
    })),
  )
  return rows.length
}

export async function deleteTemplate(id: Id): Promise<void> {
  const now = Date.now()
  await db.templates.update(id, { deletedAt: now, updatedAt: now })
  for (const r of await listTemplateBlocks(id)) {
    await db.templateBlocks.update(r.id, { deletedAt: now, updatedAt: now })
  }
}

export async function renameTemplate(id: Id, name: string): Promise<void> {
  await db.templates.update(id, { name: name.trim() || '名前のない型', updatedAt: Date.now() })
}
