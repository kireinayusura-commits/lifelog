import { useCallback, useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { currentUser, supabase } from './client'
import { resetCursorIfUserChanged, syncOnce } from './engine'
import { supabaseTransport } from './transport'

export type SyncPhase = 'signedOut' | 'idle' | 'syncing' | 'error'

export interface SyncStatus {
  phase: SyncPhase
  email: string | null
  lastSyncAt: number | null
  lastError: string | null
  sync: () => Promise<void>
}

/** 同期の待ち時間（ミリ秒）。記録した直後に何度も走らせないためのもの。 */
const DEBOUNCE = 4000
const INTERVAL = 5 * 60 * 1000

export function useSync(): SyncStatus {
  const state = useLiveQuery(() => db.syncState.get('sync'), [], undefined)
  const [phase, setPhase] = useState<SyncPhase>('signedOut')
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null)
  const running = useRef(false)
  const timer = useRef<number | null>(null)

  // ログイン状態を追う
  useEffect(() => {
    let alive = true
    currentUser().then((u) => {
      if (!alive) return
      setUser(u)
      setPhase(u ? 'idle' : 'signedOut')
    })
    const { data } = supabase().auth.onAuthStateChange((_e, session) => {
      const u = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null
      setUser(u)
      setPhase(u ? 'idle' : 'signedOut')
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const sync = useCallback(async () => {
    if (!user || running.current) return
    running.current = true
    setPhase('syncing')
    try {
      await resetCursorIfUserChanged(user.id, user.email)
      await syncOnce(supabaseTransport(user.id))
      setPhase('idle')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await db.syncState.get('sync').then((s) =>
        db.syncState.put({
          ...(s ?? {
            id: 'sync' as const,
            cursor: null,
            pushedAt: 0,
            userId: user.id,
            email: user.email,
            lastSyncAt: null,
            lastError: null,
          }),
          lastError: msg,
        }),
      )
      setPhase('error')
    } finally {
      running.current = false
    }
  }, [user])

  // ログイン直後・一定間隔・画面に戻ったときに同期する
  useEffect(() => {
    if (!user) return
    sync()
    const iv = window.setInterval(sync, INTERVAL)
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', sync)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', sync)
    }
  }, [user, sync])

  // 記録が変わったら、少し待ってから送る
  useEffect(() => {
    if (!user) return
    const bump = () => {
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(sync, DEBOUNCE)
    }
    const tables = ['groups', 'tags', 'sessions', 'transactions', 'recurring', 'settings', 'activeTimer']
    const hooks = tables.map((t) => {
      const table = db.table(t)
      const onChange = () => bump()
      table.hook('creating', onChange)
      table.hook('updating', onChange)
      table.hook('deleting', onChange)
      return { table, onChange }
    })
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
      for (const { table, onChange } of hooks) {
        table.hook('creating').unsubscribe(onChange)
        table.hook('updating').unsubscribe(onChange)
        table.hook('deleting').unsubscribe(onChange)
      }
    }
  }, [user, sync])

  return {
    phase,
    email: user?.email ?? state?.email ?? null,
    lastSyncAt: state?.lastSyncAt ?? null,
    lastError: state?.lastError ?? null,
    sync,
  }
}
