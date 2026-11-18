/**
 * 予定の計算。画面にも保存にも依存しない。
 *
 * ここに置いてあるのは「足し算と並べ替え」だけで、
 * **予定を自動で埋める処理は一切入れていない。**
 * 何をいつやるかを決めるのは本人であって、アプリではない。
 * アプリがやるのは、決めた結果どうなるかを正しく見せることだけ。
 */
import type { Block, BlockKind } from '../db/types'

/** 帯に並ぶひとこま。空きも同じ形で扱うと、描画も数えかたも1本で済む。 */
export type Row =
  | { type: 'block'; block: Block; startMin: number; endMin: number }
  | { type: 'gap'; startMin: number; endMin: number }

export const endOf = (b: Block) => b.startMin + b.durationMin

/** 置いた順ではなく時刻順に並べる */
export function sortBlocks(blocks: Block[]): Block[] {
  return [...blocks].sort((a, b) => a.startMin - b.startMin || a.durationMin - b.durationMin)
}

/**
 * 一日の枠の中を、ブロックと空きで埋めた並びにする。
 *
 * 枠からはみ出したブロックも落とさずに残す。
 * 消えてしまうと「置いたのに無い」と見え、原因が分からなくなるため。
 */
export function buildRows(blocks: Block[], frameStart: number, frameEnd: number): Row[] {
  const sorted = sortBlocks(blocks)
  const rows: Row[] = []
  let cursor = frameStart

  for (const b of sorted) {
    const s = b.startMin
    const e = endOf(b)
    if (s > cursor) rows.push({ type: 'gap', startMin: cursor, endMin: s })
    rows.push({ type: 'block', block: b, startMin: s, endMin: e })
    cursor = Math.max(cursor, e)
  }

  if (cursor < frameEnd) rows.push({ type: 'gap', startMin: cursor, endMin: frameEnd })
  return rows
}

export interface DayTotals {
  /** 枠の長さ（起きている時間） */
  frameMin: number
  /** 勉強の予定の合計 */
  studyMin: number
  /** 生活（食事・入浴など）の合計 */
  lifeMin: number
  /** その日の予定（登校・外出など）の合計 */
  eventMin: number
  /** まだ何も置いていない時間 */
  freeMin: number
}

export function totals(blocks: Block[], frameStart: number, frameEnd: number): DayTotals {
  const frameMin = Math.max(0, frameEnd - frameStart)
  const sum = (k: BlockKind) =>
    blocks.filter((b) => b.kind === k).reduce((a, b) => a + b.durationMin, 0)

  // 空きは「枠の中で、どのブロックにも覆われていない時間」。
  // 重なりがあっても二重に引かないよう、並びから数える。
  let free = 0
  for (const r of buildRows(blocks, frameStart, frameEnd)) {
    if (r.type !== 'gap') continue
    const s = Math.max(r.startMin, frameStart)
    const e = Math.min(r.endMin, frameEnd)
    if (e > s) free += e - s
  }

  return {
    frameMin,
    studyMin: sum('study'),
    lifeMin: sum('life'),
    eventMin: sum('event'),
    freeMin: free,
  }
}

/**
 * 重なっているブロックを探す。
 *
 * 重なりを黙って許すと合計が合わなくなり、「使える時間」が嘘になる。
 * かといって勝手にずらすのも筋が違うので、見つけて知らせるだけにする。
 */
export function findOverlap(blocks: Block[], target: Block): Block | null {
  const s = target.startMin
  const e = endOf(target)
  for (const b of blocks) {
    if (b.id === target.id) continue
    if (s < endOf(b) && b.startMin < e) return b
  }
  return null
}

/** その空きに収まるか */
export function fitsInGap(durationMin: number, gap: { startMin: number; endMin: number }): boolean {
  return durationMin <= gap.endMin - gap.startMin
}

/** いま進行中のブロック（なければ null） */
export function currentBlock(blocks: Block[], nowMin: number): Block | null {
  for (const b of sortBlocks(blocks)) {
    if (b.startMin <= nowMin && nowMin < endOf(b)) return b
  }
  return null
}

/** 次に始まるブロック（なければ null） */
export function nextBlock(blocks: Block[], nowMin: number): Block | null {
  for (const b of sortBlocks(blocks)) {
    if (b.startMin > nowMin) return b
  }
  return null
}

// ---------------------------------------------------------------- 時刻の表記

/**
 * 0:00 からの分を時刻にする。
 * 24時を超えるぶんは「翌1:30」と書く。25:30 より分かりやすい。
 */
export function formatMin(min: number): string {
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  const body = `${h}:${String(mm).padStart(2, '0')}`
  return min >= 1440 ? `翌${body}` : body
}

/** 長さを「1時間30分」の形にする */
export function formatLen(min: number): string {
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m === 0 ? `${h}時間` : `${h}時間${m}分`
}

/** 「9:00」「翌1:30」「2530」などを分に直す。読めなければ null。 */
export function parseMin(text: string): number | null {
  const t = text.trim().replace(/[０-９：]/g, (c) =>
    c === '：' ? ':' : String.fromCharCode(c.charCodeAt(0) - 0xfee0),
  )
  const next = /^翌/.test(t)
  const body = t.replace(/^翌/, '')
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(body)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm) || mm > 59) return null
  const total = h * 60 + mm + (next ? 1440 : 0)
  return total >= 0 && total <= 1440 + 12 * 60 ? total : null
}

/** 端末の時計から YYYY-MM-DD を作る（UTC にずらさない） */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function shiftDate(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return dateKey(new Date(y, m - 1, d + days))
}

/**
 * いまが「その日の何分目か」。
 *
 * 深夜1時は、前の日の帯から見れば 1500分（翌1:00）。
 * 日付をまたいで予定を見るとき、ここを間違えると
 * 「いま何の時間か」が1日ずれる。
 */
export function nowMinFor(dateStr: string, now: Date = new Date()): number | null {
  const today = dateKey(now)
  const min = now.getHours() * 60 + now.getMinutes()
  if (today === dateStr) return min
  if (shiftDate(dateStr, 1) === today) return min + 1440 // 日付が変わった直後
  return null
}
