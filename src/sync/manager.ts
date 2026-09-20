/**
 * 同期の常駐係。アプリ全体で1つだけ動く。
 *
 * これまでは画面（設定タブ）の中で同期を回していたので、
 *   ・設定タブを開いていないときの受信経路が画面と同居していた
 *   ・「開始」を押す直前にサーバーを確かめる、といった割り込みができなかった
 * という不都合があった。ここに出して、どこからでも requestSync() を
 * 呼べるようにしている。
 *
 * 同期が走るきっかけは4つ。
 *   1. サーバーからの知らせ（リアルタイム）……他の端末の変更が即座に届く
 *   2. 手元の変更（少し待ってから送る）
 *   3. 画面に戻ったとき・通信が戻ったとき
 *   4. 保険の定期実行（知らせが届く状態なら間隔を長くする）
 */
import type { RealtimeChannel } from '@supabase/supabase-js'
import { db } from '../db/db'
import { currentUser, supabase } from './client'
import { SYNCED_KINDS } from './config'
import { resetCursorIfUserChanged, syncOnce } from './engine'
import { isEchoOfKnown } from './merge'
import { supabaseTransport } from './transport'

export type SyncPhase = 'signedOut' | 'idle' | 'syncing' | 'error'

export interface SyncSnapshot {
  phase: SyncPhase
  email: string | null
  /** サーバーからの知らせを受け取れている（＝その場で同期される）か */
  live: boolean
}

/** 手元の変更を送るまでの待ち時間。連続入力でも1回にまとめるため。 */
const LOCAL_DEBOUNCE = 1500
/** 知らせが届いてから取りに行くまでの待ち時間。まとめて届く分を束ねる。 */
const REMOTE_DEBOUNCE = 250
/** 保険の定期実行。知らせが届いているときと、そうでないとき。 */
const INTERVAL_LIVE = 5 * 60 * 1000
const INTERVAL_DEAD = 30 * 1000
/** 定期実行の見回り間隔 */
const TICK = 15 * 1000

let started = false
let user: { id: string; email: string | null } | null = null
let live = false
let phase: SyncPhase = 'signedOut'

let channel: RealtimeChannel | null = null
let localTimer: ReturnType<typeof setTimeout> | null = null
let remoteTimer: ReturnType<typeof setTimeout> | null = null
let lastAttemptAt = 0

const listeners = new Set<(s: SyncSnapshot) => void>()

export function syncSnapshot(): SyncSnapshot {
  return { phase, email: user?.email ?? null, live }
}

export function subscribeSync(fn: (s: SyncSnapshot) => void): () => void {
  listeners.add(fn)
  fn(syncSnapshot())
  return () => listeners.delete(fn)
}

function emit() {
  const s = syncSnapshot()
  for (const fn of listeners) fn(s)
}

function setPhase(p: SyncPhase) {
  if (phase === p) return
  phase = p
  emit()
}

function setLive(v: boolean) {
  if (live === v) return
  live = v
  emit()
}

// ---------------------------------------------------------------- 実行

/**
 * 走っている同期は常に1本。走っている最中に頼まれたら、
 * 終わってからもう1度走らせる（取りこぼさないため）。
 * 返す約束は「この呼び出し以降の同期が終わるまで」を表す。
 */
let inflight: Promise<void> | null = null
let again = false

async function runOnce(): Promise<void> {
  if (!user) return
  lastAttemptAt = Date.now()
  setPhase('syncing')
  try {
    await resetCursorIfUserChanged(user.id, user.email)
    await syncOnce(supabaseTransport(user.id))
    setPhase('idle')
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const s = await db.syncState.get('sync')
    if (s) await db.syncState.put({ ...s, lastError: message })
    setPhase('error')
  }
}

export function requestSync(): Promise<void> {
  if (!user) return Promise.resolve()
  if (inflight) {
    again = true
    return inflight
  }
  const loop = async () => {
    for (;;) {
      again = false
      await runOnce()
      if (!again) return
    }
  }
  inflight = loop().finally(() => {
    inflight = null
  })
  return inflight
}

/**
 * 大事な操作の直前に、いまのサーバーの状態へ追いつく。
 * 通信が遅いときに操作が止まらないよう、上限の時間で打ち切る。
 * 打ち切っても同期自体は裏で続く。
 */
export function catchUp(timeoutMs = 2500): Promise<void> {
  if (!user) return Promise.resolve()
  return Promise.race([
    requestSync().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

// ---------------------------------------------------------------- 知らせ

/** 自分が送った変更が跳ね返ってきただけなら、取りに行かない。 */
async function isEcho(kind: unknown, id: unknown, updatedAt: unknown): Promise<boolean> {
  if (typeof kind !== 'string' || typeof id !== 'string') return false
  const known = await db.pushed.get(`${kind}:${id}`)
  return isEchoOfKnown(known?.updatedAt, updatedAt)
}

function scheduleRemote() {
  if (remoteTimer) clearTimeout(remoteTimer)
  remoteTimer = setTimeout(() => {
    remoteTimer = null
    void requestSync()
  }, REMOTE_DEBOUNCE)
}

function closeChannel() {
  if (!channel) return
  const c = channel
  channel = null
  setLive(false)
  try {
    void supabase().removeChannel(c)
  } catch {
    /* 片付けに失敗しても実害はない */
  }
}

function openChannel(userId: string) {
  closeChannel()

  // 知らせにも行レベルセキュリティがそのまま効く。
  // 手元のログイン情報を接続にも持たせておく。
  try {
    void Promise.resolve(supabase().realtime.setAuth()).catch(() => undefined)
  } catch {
    /* 古い版では同期的に投げることがある */
  }

  channel = supabase()
    .channel(`records:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'records', filter: `user_id=eq.${userId}` },
      (payload) => {
        const row = (payload.new ?? payload.old) as Record<string, unknown> | undefined
        if (!row) return scheduleRemote()
        void isEcho(row.kind, row.id, row.updated_at).then((echo) => {
          if (!echo) scheduleRemote()
        })
      },
    )
    .subscribe((status) => {
      setLive(status === 'SUBSCRIBED')
      // つながった直後は、切れていた間の変更を取りに行く
      if (status === 'SUBSCRIBED') void requestSync()
    })
}

/** 画面に戻ったときなど、接続が生きているか確かめて必要なら張り直す */
function ensureChannel() {
  if (!user) return
  const state = channel?.state
  if (!channel || state === 'closed' || state === 'errored') openChannel(user.id)
}

// ---------------------------------------------------------------- 起動

function watchLocalChanges() {
  const bump = () => {
    if (localTimer) clearTimeout(localTimer)
    localTimer = setTimeout(() => {
      localTimer = null
      void requestSync()
    }, LOCAL_DEBOUNCE)
  }
  for (const kind of SYNCED_KINDS) {
    const table = db.table(kind)
    table.hook('creating', bump)
    table.hook('updating', bump)
    table.hook('deleting', bump)
  }
}

function watchAuth() {
  // 未ログイン・通信不可のときは「ログインしていない」として静かに始める。
  // 同期が使えなくても、アプリは今までどおり動く。
  void currentUser()
    .then((u) => applyUser(u))
    .catch(() => applyUser(null))
  supabase().auth.onAuthStateChange((_e, session) => {
    applyUser(
      session?.user ? { id: session.user.id, email: session.user.email ?? null } : null,
    )
  })
}

function applyUser(u: { id: string; email: string | null } | null) {
  const changed = u?.id !== user?.id
  user = u
  if (!u) {
    closeChannel()
    setPhase('signedOut')
    emit()
    return
  }
  setPhase('idle')
  emit()
  if (changed || !channel) openChannel(u.id)
  void requestSync()
}

/** アプリ起動時に1度だけ呼ぶ。2度目以降は何もしない。 */
export function initSync(): void {
  if (started) return
  started = true

  watchAuth()
  watchLocalChanges()

  const wake = () => {
    ensureChannel()
    void requestSync()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') wake()
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('online', wake)
    window.addEventListener('pageshow', wake)

    // 保険の定期実行。知らせが届いているなら、めったに走らせない。
    window.setInterval(() => {
      if (!user) return
      if (document.visibilityState === 'hidden') return
      const gap = live ? INTERVAL_LIVE : INTERVAL_DEAD
      if (Date.now() - lastAttemptAt < gap) return
      ensureChannel()
      void requestSync()
    }, TICK)
  }
}
