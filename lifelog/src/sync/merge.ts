/**
 * 同期の「どちらを残すか」を決める部分。
 *
 * ここには通信が一切入っていない。純粋な関数だけで書いてあるので、
 * サーバーを用意しなくても手元で全パターンを試せる。
 * 同期で壊れるとしたらほぼこの判断なので、ここを検証可能にしてある。
 */

export interface SyncRow {
  id: string
  updatedAt: number
  deletedAt?: number | null
}

/** サーバーから届いた1件 */
export interface RemoteRecord {
  kind: string
  id: string
  data: Record<string, unknown>
  updated_at: number
  deleted_at: number | null
  server_updated_at: string
}

/**
 * 届いた行を手元に書くべきか。
 *
 * 規則は1つだけ：更新時刻が新しい方を残す。
 * 削除も「削除した」という更新として同じ規則で扱うので、
 * 消した記録が他の端末から復活することがない。
 *
 * 同じ時刻のときは手元を優先する。これは書き込みを減らすためで、
 * 内容が同じなら結果は変わらない。
 */
export function shouldApplyRemote(local: SyncRow | undefined, remoteUpdatedAt: number): boolean {
  if (!local) return true
  return remoteUpdatedAt > local.updatedAt
}

/**
 * 送るべき行を選ぶ。
 *
 * 「前回送った時刻より後のもの」という選び方はしない。
 * 端末ごとに時計がずれていると、他の端末が付けた未来の時刻の行が
 * 毎回その条件に当てはまり、同じ行を延々と送り続けてしまうため。
 *
 * 代わりに「サーバーにこの版が入っていると分かっている」ものを覚えておき、
 * それと違う行だけを送る。時計のずれに左右されない。
 */
export function selectForPush<T extends SyncRow>(
  rows: T[],
  known: Map<string, number>,
  kind: string,
): T[] {
  return rows.filter((r) => known.get(`${kind}:${r.id}`) !== r.updatedAt)
}

/**
 * 取得位置の更新。
 * サーバーが付けた時刻のうち、最も新しいものを次回の起点にする。
 * 端末の時計ではなくサーバーの時刻を使うので、端末の時刻がずれていても
 * 取りこぼしが起きない。
 */
export function nextCursor(current: string | null, records: RemoteRecord[]): string | null {
  let max = current
  for (const r of records) {
    if (!max || r.server_updated_at > max) max = r.server_updated_at
  }
  return max
}

/** 計測中のタイマーが、この端末のものか */
export function isOwnTimer(
  timer: { deviceId: string; deletedAt: number | null } | null | undefined,
  myDeviceId: string,
): boolean {
  if (!timer || timer.deletedAt !== null) return false
  return timer.deviceId === myDeviceId
}

/** 他の端末で計測が走っているか */
export function isForeignTimer(
  timer: { deviceId: string; deletedAt: number | null } | null | undefined,
  myDeviceId: string,
): boolean {
  if (!timer || timer.deletedAt !== null) return false
  return timer.deviceId !== myDeviceId
}
