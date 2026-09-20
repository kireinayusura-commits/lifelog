/**
 * タイマーの判断だけを集めた場所。
 * 画面にも通信にも依存しないので、そのまま検証できる。
 */
import type { ActiveTimer } from '../db/types'

/** 停止していないタイマーだけを返す（行は消さず deletedAt で表すため） */
export function liveTimer(t: ActiveTimer | undefined | null): ActiveTimer | null {
  if (!t || t.deletedAt !== null) return null
  return t
}

/** 他の端末で走っているタイマーか。'legacy' は同期を入れる前からある行。 */
export function isForeignTimer(t: ActiveTimer | null, myId: string): boolean {
  return !!t && t.deviceId !== myId && t.deviceId !== 'legacy'
}

/** 開始を押したときの結果 */
export type StartResult =
  | 'started' // この端末で始まった
  | 'foreign' // 他の端末が計測中。切り替えの確認が要る
  | 'busy' // この端末で既に計測中（押し間違い）

/**
 * 今このまま始めてよいか。
 * 始められないときだけ理由を返し、始めてよいときは null を返す。
 */
export function blockingReason(
  row: ActiveTimer | undefined | null,
  myId: string,
): Exclude<StartResult, 'started'> | null {
  const t = liveTimer(row)
  if (!t) return null
  return isForeignTimer(t, myId) ? 'foreign' : 'busy'
}
