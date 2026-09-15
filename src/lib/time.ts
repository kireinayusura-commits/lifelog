const pad = (n: number) => String(n).padStart(2, '0')

/** 1:05:32 のような表示。タイマーの大きな数字用。 */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/**
 * 2時間15分 / 45分 のような表示。
 *
 * withSeconds を立てると 2時間15分37秒 のように秒まで出す。
 * 計測自体は常に秒（内部はミリ秒）で記録しているので、
 * ここは丸めるかどうかを決めているだけ。
 */
export function formatDuration(sec: number, withSeconds = false): string {
  const total = Math.max(0, Math.floor(sec))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60

  if (!withSeconds) {
    if (h > 0) return m > 0 ? `${h}時間${m}分` : `${h}時間`
    if (m > 0) return `${m}分`
    return `${total}秒`
  }

  const parts: string[] = []
  if (h > 0) parts.push(`${h}時間`)
  if (m > 0) parts.push(`${m}分`)
  if (s > 0 || parts.length === 0) parts.push(`${s}秒`)
  return parts.join('')
}

export function formatHours(sec: number): string {
  return (sec / 3600).toFixed(1)
}

export function formatTimeOfDay(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function dateKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const WD = ['日', '月', '火', '水', '木', '金', '土']

export function formatDateLabel(ts: number): string {
  const d = new Date(ts)
  const today = dateKey(Date.now())
  const key = dateKey(ts)
  const yesterday = dateKey(Date.now() - 86400000)
  if (key === today) return '今日'
  if (key === yesterday) return '昨日'
  return `${d.getMonth() + 1}月${d.getDate()}日(${WD[d.getDay()]})`
}

export function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** <input type="datetime-local"> と相互変換する。ローカル時刻のまま扱う。 */
export function toDatetimeLocal(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromDatetimeLocal(v: string): number {
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? Date.now() : t
}
