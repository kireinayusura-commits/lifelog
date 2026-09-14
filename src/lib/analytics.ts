import type { Session, Tag, Transaction } from '../db/types'
import { dateKey, startOfDay } from './time'

export type Period = 'week' | 'month'

export interface DayBucket {
  key: string
  ts: number
  /** 月曜=0 の曜日インデックス */
  dow: number
  sec: number
  yen: number
}

/**
 * 今週は月曜から日曜までの7日間を常に出す。
 * 月曜に開いたときに棒が1本しか無い、という見え方を避けるため、
 * これから来る日も枠として残す。
 * 今月は1日から今日まで。月初に空の棒を20本並べても意味がない。
 */
export function buildDays(period: Period, now: number = Date.now()): DayBucket[] {
  const today = startOfDay(now)
  const start = new Date(today)
  let end: number

  if (period === 'week') {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)) // 月曜まで戻す
    const last = new Date(start)
    last.setDate(last.getDate() + 6)
    end = last.getTime()
  } else {
    start.setDate(1)
    end = today
  }

  const out: DayBucket[] = []
  const cursor = new Date(start)
  while (cursor.getTime() <= end) {
    const ts = cursor.getTime()
    out.push({ key: dateKey(ts), ts, dow: (cursor.getDay() + 6) % 7, sec: 0, yen: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** 期間のうち、今日までに経過した日数。1日あたりの平均を出すときに使う。 */
export function elapsedDays(days: DayBucket[], now: number = Date.now()): number {
  const today = startOfDay(now)
  return Math.max(1, days.filter((d) => d.ts <= today).length)
}

export function fillDays(
  days: DayBucket[],
  sessions: Session[],
  transactions: Transaction[],
): DayBucket[] {
  const index = new Map(days.map((d) => [d.key, d]))
  for (const s of sessions) {
    const d = index.get(dateKey(s.startedAt))
    if (d) d.sec += s.durationSec
  }
  for (const t of transactions) {
    const d = index.get(dateKey(t.occurredAt))
    if (d) d.yen += t.amount
  }
  return days
}

export interface TagSlice {
  id: string
  name: string
  color: string
  sec: number
  yen: number
}

const OTHER_COLOR = '#78808F'
const MAX_SLICES = 8

/**
 * タグ別の集計。9件目以降は「その他」にまとめる。
 * 色を9つ目以降に作り足すと、既存の色と見分けがつかなくなるため。
 */
export function aggregateByTag(
  tags: Tag[],
  sessions: Session[],
  transactions: Transaction[],
  from: number,
  key: 'sec' | 'yen',
): TagSlice[] {
  const map = new Map<string, TagSlice>()
  const slot = (id: string | null) => {
    const k = id ?? '__none'
    let s = map.get(k)
    if (!s) {
      const tag = tags.find((t) => t.id === id)
      map.set(
        k,
        (s = {
          id: k,
          name: tag?.name ?? 'タグなし',
          color: tag?.color ?? OTHER_COLOR,
          sec: 0,
          yen: 0,
        }),
      )
    }
    return s
  }

  for (const s of sessions) if (s.startedAt >= from) slot(s.tagId).sec += s.durationSec
  for (const t of transactions) if (t.occurredAt >= from) slot(t.tagId).yen += t.amount

  const rows = [...map.values()].filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key])
  if (rows.length <= MAX_SLICES) return rows

  const head = rows.slice(0, MAX_SLICES - 1)
  const tail = rows.slice(MAX_SLICES - 1)
  head.push({
    id: '__other',
    name: `その他 ${tail.length}件`,
    color: OTHER_COLOR,
    sec: tail.reduce((a, r) => a + r.sec, 0),
    yen: tail.reduce((a, r) => a + r.yen, 0),
  })
  return head
}

export const DOW_LABELS = ['月', '火', '水', '木', '金', '土', '日'] as const
