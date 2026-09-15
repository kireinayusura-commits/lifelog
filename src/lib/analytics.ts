import type { Session, Tag, Transaction } from '../db/types'
import { startOfDay } from './time'

export type Period = 'month' | '3m' | '6m' | '1y' | 'all'
export type Granularity = 'day' | 'week' | 'month'

export const PERIODS: { id: Period; label: string }[] = [
  { id: 'month', label: '今月' },
  { id: '3m', label: '3か月' },
  { id: '6m', label: '6か月' },
  { id: '1y', label: '1年' },
  { id: 'all', label: '全期間' },
]

export const GRANULARITIES: { id: Granularity; label: string }[] = [
  { id: 'day', label: '日ごと' },
  { id: 'week', label: '週ごと' },
  { id: 'month', label: '月ごと' },
]

/**
 * 期間ごとの既定の粒度。
 * 1年を日ごとで出すと棒が365本になって読めないので、
 * 長い期間は粗い粒度から始める。切り替えは自由。
 */
export const DEFAULT_GRANULARITY: Record<Period, Granularity> = {
  month: 'day',
  '3m': 'week',
  '6m': 'week',
  '1y': 'month',
  all: 'month',
}

export interface Bucket {
  key: string
  /** この区間の始まり */
  ts: number
  /** この区間の終わり（この時刻は含まない） */
  end: number
  /** 軸に出す短いラベル */
  label: string
  /** 選択したときに出す長いラベル */
  fullLabel: string
  sec: number
  yen: number
}

function startOfWeek(ts: number): number {
  const d = new Date(startOfDay(ts))
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // 月曜始まり
  return d.getTime()
}

function startOfMonth(ts: number): number {
  const d = new Date(ts)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addMonths(ts: number, n: number): number {
  const d = new Date(ts)
  d.setMonth(d.getMonth() + n)
  return d.getTime()
}

/** 期間の開始時刻。月単位で区切るので、月ごとの粒度ときれいに揃う。 */
export function periodStart(period: Period, earliest: number, now: number = Date.now()): number {
  const thisMonth = startOfMonth(now)
  switch (period) {
    case 'month':
      return thisMonth
    case '3m':
      return addMonths(thisMonth, -2)
    case '6m':
      return addMonths(thisMonth, -5)
    case '1y':
      return addMonths(thisMonth, -11)
    case 'all':
      return startOfDay(Math.min(earliest, now))
  }
}

const WD = ['日', '月', '火', '水', '木', '金', '土']

export function buildBuckets(
  period: Period,
  granularity: Granularity,
  earliest: number,
  now: number = Date.now(),
): Bucket[] {
  const from = periodStart(period, earliest, now)
  const today = startOfDay(now)
  const out: Bucket[] = []

  if (granularity === 'day') {
    const cur = new Date(from)
    while (cur.getTime() <= today) {
      const ts = cur.getTime()
      const d = new Date(ts)
      const next = new Date(ts)
      next.setDate(next.getDate() + 1)
      out.push({
        key: `d${ts}`,
        ts,
        end: next.getTime(),
        label: String(d.getDate()),
        fullLabel: `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`,
        sec: 0,
        yen: 0,
      })
      cur.setDate(cur.getDate() + 1)
    }
  } else if (granularity === 'week') {
    let ts = startOfWeek(from)
    const last = startOfWeek(today)
    while (ts <= last) {
      const d = new Date(ts)
      const next = new Date(ts)
      next.setDate(next.getDate() + 7)
      const endD = new Date(next.getTime() - 86400000)
      out.push({
        key: `w${ts}`,
        ts,
        end: next.getTime(),
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        fullLabel: `${d.getMonth() + 1}/${d.getDate()} – ${endD.getMonth() + 1}/${endD.getDate()}`,
        sec: 0,
        yen: 0,
      })
      ts = next.getTime()
    }
  } else {
    let ts = startOfMonth(from)
    const last = startOfMonth(today)
    while (ts <= last) {
      const d = new Date(ts)
      const next = addMonths(ts, 1)
      out.push({
        key: `m${ts}`,
        ts,
        end: next,
        label: `${d.getMonth() + 1}`,
        fullLabel: `${d.getFullYear()}年${d.getMonth() + 1}月`,
        sec: 0,
        yen: 0,
      })
      ts = next
    }
  }

  return out
}

export function fillBuckets(
  buckets: Bucket[],
  sessions: Session[],
  transactions: Transaction[],
): Bucket[] {
  if (buckets.length === 0) return buckets
  const from = buckets[0].ts
  const to = buckets[buckets.length - 1].end

  // 区間は時刻順に並んでいるので、二分探索で振り分ける
  const find = (ts: number): Bucket | null => {
    if (ts < from || ts >= to) return null
    let lo = 0
    let hi = buckets.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const b = buckets[mid]
      if (ts < b.ts) hi = mid - 1
      else if (ts >= b.end) lo = mid + 1
      else return b
    }
    return null
  }

  for (const s of sessions) {
    const b = find(s.startedAt)
    if (b) b.sec += s.durationSec
  }
  for (const t of transactions) {
    const b = find(t.occurredAt)
    if (b) b.yen += t.amount
  }
  return buckets
}

/** 期間中の経過日数。1日あたりの平均を出すときに使う。 */
export function elapsedDaysIn(buckets: Bucket[], now: number = Date.now()): number {
  if (buckets.length === 0) return 1
  const from = buckets[0].ts
  const to = Math.min(buckets[buckets.length - 1].end, startOfDay(now) + 86400000)
  return Math.max(1, Math.round((to - from) / 86400000))
}

const OTHER_COLOR = '#78808F'

/**
 * 記録を1時間ごとのバケツに配分する。
 * 23時に始めて1時に終わった記録は、23時台・0時台・1時台に正しく割り振る。
 */
export function hourHistogram(sessions: Session[], from: number, to: number): number[] {
  const hours = new Array(24).fill(0) as number[]
  for (const s of sessions) {
    let cursor = Math.max(s.startedAt, from)
    const end = Math.min(s.endedAt, to)
    while (cursor < end) {
      const d = new Date(cursor)
      const nextHour = new Date(d)
      nextHour.setMinutes(0, 0, 0)
      nextHour.setHours(nextHour.getHours() + 1)
      const slice = Math.min(nextHour.getTime(), end) - cursor
      hours[d.getHours()] += slice / 1000
      cursor += slice
    }
  }
  return hours
}

export interface TagSlice {
  id: string
  name: string
  color: string
  sec: number
  yen: number
}

/**
 * タグ別の集計。区分が多すぎると色で見分けがつかなくなるので、
 * 上位だけ残して残りは「その他」にまとめる。
 */
export function aggregateByTag(
  tags: Tag[],
  sessions: Session[],
  transactions: Transaction[],
  from: number,
  to: number,
  key: 'sec' | 'yen',
  maxSlices = 6,
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

  for (const s of sessions)
    if (s.startedAt >= from && s.startedAt < to) slot(s.tagId).sec += s.durationSec
  for (const t of transactions)
    if (t.occurredAt >= from && t.occurredAt < to) slot(t.tagId).yen += t.amount

  const rows = [...map.values()].filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key])
  if (rows.length <= maxSlices) return rows

  const head = rows.slice(0, maxSlices - 1)
  const tail = rows.slice(maxSlices - 1)
  head.push({
    id: '__other',
    name: `その他 ${tail.length}件`,
    color: OTHER_COLOR,
    sec: tail.reduce((a, r) => a + r.sec, 0),
    yen: tail.reduce((a, r) => a + r.yen, 0),
  })
  return head
}

/** 軸ラベルを間引く。棒が多いときに数字が重なって潰れるのを防ぐ。 */
export function thinLabels(buckets: Bucket[], maxLabels = 8): string[] {
  const n = buckets.length
  const step = Math.max(1, Math.ceil(n / maxLabels))
  return buckets.map((b, i) => {
    if (i === 0 || i === n - 1) return b.label
    if (i % step !== 0) return ''
    // 末尾のラベルと近すぎるものは落とす。重なって読めなくなるため。
    if (n - 1 - i < step * 0.6) return ''
    return b.label
  })
}
