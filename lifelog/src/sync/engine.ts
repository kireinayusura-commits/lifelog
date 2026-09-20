import { db, type LifeLogDB } from '../db/db'
import type { SyncState } from '../db/types'
import { SYNCED_KINDS, type SyncKind } from './config'
import { nextCursor, selectForPush, shouldApplyRemote, type RemoteRecord, type SyncRow } from './merge'

/**
 * サーバーとのやりとり。
 * 実際の通信は SyncTransport に閉じ込めてあるので、
 * 偽のサーバーに差し替えれば通信なしで全体を試せる。
 */
export interface SyncTransport {
  /** cursor より後に更新された行を、古い順に返す */
  pull(cursor: string | null): Promise<RemoteRecord[]>
  /** 行をまとめて送る */
  push(rows: PushRow[]): Promise<void>
}

export interface PushRow {
  kind: string
  id: string
  data: Record<string, unknown>
  updated_at: number
  deleted_at: number | null
}

export const DEFAULT_SYNC_STATE: SyncState = {
  id: 'sync',
  cursor: null,
  pushedAt: 0,
  userId: null,
  email: null,
  lastSyncAt: null,
  lastError: null,
}

export async function getSyncState(database: LifeLogDB = db): Promise<SyncState> {
  return (await database.syncState.get('sync')) ?? DEFAULT_SYNC_STATE
}

export async function saveSyncState(
  patch: Partial<SyncState>,
  database: LifeLogDB = db,
): Promise<void> {
  const cur = await getSyncState(database)
  await database.syncState.put({ ...cur, ...patch, id: 'sync' })
}

/**
 * 別のアカウントでログインし直したときは、取得位置を白紙に戻す。
 * 前のアカウントの続きから取得してしまうと、記録が混ざる。
 */
export async function resetCursorIfUserChanged(
  userId: string,
  email: string | null,
  database: LifeLogDB = db,
) {
  const s = await getSyncState(database)
  if (s.userId !== userId) {
    await saveSyncState({ userId, email, cursor: null, pushedAt: 0 }, database)
  } else if (s.email !== email) {
    await saveSyncState({ email }, database)
  }
}

function table(database: LifeLogDB, kind: SyncKind) {
  return database.table(kind)
}

export interface SyncReport {
  pulled: number
  applied: number
  pushed: number
}

/**
 * 1回分の同期。
 *
 * 取得してから送る順番にしている。先に送ると、手元の古い内容で
 * 相手の新しい内容を上書きしてしまう可能性があるため。
 * （サーバー側にも同じ規則の番人を置いてあるので二重に守られている）
 */
export async function syncOnce(
  transport: SyncTransport,
  database: LifeLogDB = db,
): Promise<SyncReport> {
  const state = await getSyncState(database)
  const report: SyncReport = { pulled: 0, applied: 0, pushed: 0 }

  // サーバーにこの版が入っていると分かっているもの
  const known = new Map<string, number>()
  for (const row of await database.pushed.toArray()) known.set(row.key, row.updatedAt)

  // ---- 取得 ----
  const remote = await transport.pull(state.cursor)
  report.pulled = remote.length
  const learned: { key: string; updatedAt: number }[] = []

  for (const r of remote) {
    if (!(SYNCED_KINDS as readonly string[]).includes(r.kind)) continue
    const kind = r.kind as SyncKind
    const key = `${kind}:${r.id}`
    const local = (await table(database, kind).get(r.id)) as SyncRow | undefined

    if (shouldApplyRemote(local, r.updated_at)) {
      await table(database, kind).put({
        ...r.data,
        id: r.id,
        updatedAt: r.updated_at,
        deletedAt: r.deleted_at,
      })
      report.applied++
      // この版がサーバーに入っていることが分かったので、送り返さない
      known.set(key, r.updated_at)
      learned.push({ key, updatedAt: r.updated_at })
    }
  }

  const cursor = nextCursor(state.cursor, remote)

  // ---- 送信 ----
  const outgoing: PushRow[] = []
  const sent: { key: string; updatedAt: number }[] = []

  for (const kind of SYNCED_KINDS) {
    const rows = (await table(database, kind).toArray()) as SyncRow[]
    for (const row of selectForPush(rows, known, kind)) {
      const { id, updatedAt, deletedAt, ...rest } = row as SyncRow & Record<string, unknown>
      outgoing.push({
        kind,
        id,
        data: rest,
        updated_at: updatedAt,
        deleted_at: deletedAt ?? null,
      })
      sent.push({ key: `${kind}:${id}`, updatedAt })
    }
  }

  if (outgoing.length > 0) {
    await transport.push(outgoing)
    report.pushed = outgoing.length
  }

  // 送信が成功してから記録する。失敗した場合は次回また送られる。
  if (learned.length || sent.length) {
    await database.pushed.bulkPut([...learned, ...sent])
  }

  await saveSyncState(
    { cursor, pushedAt: Date.now(), lastSyncAt: Date.now(), lastError: null },
    database,
  )
  return report
}

/**
 * 初回だけ、手元の記録を全部送る。
 * pushedAt が 0 のときは selectForPush がすべてを拾うので、
 * 特別な処理は要らない。この関数は意図を明示するために置いてある。
 */
export async function isFirstSync(database: LifeLogDB = db): Promise<boolean> {
  const s = await getSyncState(database)
  return s.pushedAt === 0
}
