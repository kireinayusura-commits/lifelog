import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { createSession } from '../db/repo'
import type { ActiveTimer, Id } from '../db/types'
import { deviceId, deviceName } from '../sync/device'

/**
 * 経過時間の算出。ここがタイマーの心臓部。
 *
 * 保存されているのは「開始した絶対時刻」だけなので、
 * アプリが動いていなかった時間もそのまま経過時間に含まれる。
 * ＝ 画面を消していても、アプリを閉じていても、計測は途切れない。
 *
 * 同じ理由で、別の端末で開いても経過時間は自動的に一致する。
 * 同期で送るのは「誰がいつ始めたか」だけでよく、
 * 秒数を送り合う必要がない。
 *
 * 端末の時計が巻き戻された場合（手動設定・タイムゾーン変更など）に
 * 負の値が出ないよう、区間長が負なら 0 として扱う。
 */
export function computeElapsedMs(t: ActiveTimer, now: number = Date.now()): number {
  if (t.isPaused) return Math.max(0, t.accumulatedMs)
  const segment = now - t.segmentStartedAt
  return Math.max(0, t.accumulatedMs + (segment > 0 ? segment : 0))
}

/** 停止していないタイマーだけを返す（行は消さず deletedAt で表すため） */
function liveTimer(t: ActiveTimer | undefined): ActiveTimer | null {
  if (!t || t.deletedAt !== null) return null
  return t
}

export function useTimer() {
  // 読み込み中は undefined、計測していないときは null を返す
  const active = useLiveQuery<ActiveTimer | null, undefined>(
    () => db.activeTimer.get('active').then((r) => liveTimer(r)),
    [],
    undefined,
  )
  const [now, setNow] = useState(() => Date.now())

  const running = !!active && !active.isPaused
  const myId = deviceId()
  /** 他の端末で走っているタイマーか */
  const isForeign = !!active && active.deviceId !== myId && active.deviceId !== 'legacy'

  useEffect(() => {
    // 表示を更新するためだけの interval。経過時間の計算には使わない。
    // ここが止まっても時間は失われない。
    const sync = () => setNow(Date.now())
    sync()
    if (!running) return

    const iv = window.setInterval(sync, 250)
    // バックグラウンドから戻った瞬間に必ず実時刻へ追いつかせる
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', sync)
    window.addEventListener('focus', sync)
    window.addEventListener('online', sync)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', sync)
      window.removeEventListener('focus', sync)
      window.removeEventListener('online', sync)
    }
  }, [running, active?.segmentStartedAt])

  const elapsedMs = active ? computeElapsedMs(active, now) : 0

  /** 計測を始める。すでに走っていれば何もしない（呼ぶ前に確認する） */
  const start = useCallback(async (tagId: Id | null) => {
    const existing = liveTimer(await db.activeTimer.get('active'))
    if (existing) return
    const t = Date.now()
    await db.activeTimer.put({
      id: 'active',
      tagId,
      originStartedAt: t,
      segmentStartedAt: t,
      accumulatedMs: 0,
      isPaused: false,
      memo: '',
      deviceId: deviceId(),
      deviceName: deviceName(),
      createdAt: t,
      updatedAt: t,
      deletedAt: null,
    })
  }, [])

  const pause = useCallback(async () => {
    const t = liveTimer(await db.activeTimer.get('active'))
    if (!t || t.isPaused) return
    const n = Date.now()
    const segment = Math.max(0, n - t.segmentStartedAt)
    await db.activeTimer.put({
      ...t,
      accumulatedMs: t.accumulatedMs + segment,
      isPaused: true,
      updatedAt: n,
    })
  }, [])

  const resume = useCallback(async () => {
    const t = liveTimer(await db.activeTimer.get('active'))
    if (!t || !t.isPaused) return
    const n = Date.now()
    await db.activeTimer.put({ ...t, segmentStartedAt: n, isPaused: false, updatedAt: n })
  }, [])

  const setTag = useCallback(async (tagId: Id | null) => {
    const t = liveTimer(await db.activeTimer.get('active'))
    if (!t) return
    await db.activeTimer.put({ ...t, tagId, updatedAt: Date.now() })
  }, [])

  const setMemo = useCallback(async (memo: string) => {
    const t = liveTimer(await db.activeTimer.get('active'))
    if (!t) return
    await db.activeTimer.put({ ...t, memo, updatedAt: Date.now() })
  }, [])

  /**
   * 計測を終了して記録に変換する。
   * どの端末からでも停止できる（止めるのは安全な操作なので確認しない）。
   * endedAtOverride を渡すと終了時刻を手で直せる（長時間放置したときの救済）。
   */
  const stop = useCallback(
    async (endedAtOverride?: number): Promise<{ id: Id; durationSec: number } | null> => {
      const t = liveTimer(await db.activeTimer.get('active'))
      if (!t) return null
      const n = Date.now()
      const elapsed = computeElapsedMs(t, n)
      const endedAt = endedAtOverride ?? t.originStartedAt + elapsed
      const durationSec = Math.round((endedAt - t.originStartedAt) / 1000)

      // 行は消さず「停止した」と記す。消すと他の端末に伝わらず復活する。
      await db.activeTimer.put({ ...t, deletedAt: n, updatedAt: n })

      if (durationSec < 1) return null // 1秒未満は記録しない
      const id = await createSession({
        tagId: t.tagId,
        startedAt: t.originStartedAt,
        endedAt,
        memo: t.memo,
        source: 'timer',
      })
      return { id, durationSec }
    },
    [],
  )

  const discard = useCallback(async () => {
    const t = liveTimer(await db.activeTimer.get('active'))
    if (!t) return
    const n = Date.now()
    await db.activeTimer.put({ ...t, deletedAt: n, updatedAt: n })
  }, [])

  /** 他の端末の計測を終わらせて、この端末で始め直す */
  const takeOver = useCallback(
    async (tagId: Id | null) => {
      await stop()
      await start(tagId)
    },
    [stop, start],
  )

  return {
    active,
    loading: active === undefined,
    running,
    isForeign,
    elapsedMs,
    start,
    takeOver,
    pause,
    resume,
    stop,
    discard,
    setTag,
    setMemo,
  }
}
