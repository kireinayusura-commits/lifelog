import { useCallback, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { requestSync, subscribeSync, syncSnapshot, type SyncPhase, type SyncSnapshot } from './manager'

export type { SyncPhase }

export interface SyncStatus {
  phase: SyncPhase
  email: string | null
  /** サーバーからの知らせを受け取れている（＝その場で同期される）か */
  live: boolean
  lastSyncAt: number | null
  lastError: string | null
  sync: () => Promise<void>
}

/**
 * 同期の様子を画面に出すための窓口。
 * 実際の処理は manager.ts に常駐しているものが受け持つ。
 * この hook がいくつ使われても、同期が増えることはない。
 */
export function useSync(): SyncStatus {
  const state = useLiveQuery(() => db.syncState.get('sync'), [], undefined)
  const [snap, setSnap] = useState<SyncSnapshot>(() => syncSnapshot())

  useEffect(() => subscribeSync(setSnap), [])

  const sync = useCallback(() => requestSync(), [])

  return {
    phase: snap.phase,
    email: snap.email ?? state?.email ?? null,
    live: snap.live,
    lastSyncAt: state?.lastSyncAt ?? null,
    lastError: state?.lastError ?? null,
    sync,
  }
}
