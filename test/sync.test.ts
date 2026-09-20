/**
 * 同期の通し検証。
 *
 * 2台の端末（別々のデータベース）と、サーバー側の番人と同じ規則を持つ
 * 偽サーバーを用意して、実際の同期処理をそのまま動かす。
 *
 *   npx tsx test/sync.test.ts
 *
 * 本物の Supabase には接続できない環境のため、SQL の番人と同じ振る舞いを
 * ここで再現している（supabase/schema.sql の records_guard と対応）。
 */
import 'fake-indexeddb/auto'
import { LifeLogDB } from '../src/db/db'
import { syncOnce, type PushRow, type SyncTransport } from '../src/sync/engine'
import type { RemoteRecord } from '../src/sync/merge'

// ---------------------------------------------------------------- 偽サーバー

interface StoredRow extends RemoteRecord {}

class FakeServer {
  rows = new Map<string, StoredRow>()
  private seq = 0
  /** upsert が呼ばれた回数。往復が止まることを確かめるために数える。 */
  writes = 0

  private stamp(): string {
    // 実時刻だと同一ミリ秒で順序が崩れるので、単調増加の値を使う
    this.seq += 1
    return String(this.seq).padStart(12, '0')
  }

  upsert(rows: PushRow[]) {
    this.writes += rows.length
    for (const r of rows) {
      const key = `${r.kind}:${r.id}`
      const old = this.rows.get(key)

      if (old) {
        // (a) 古い書き込みは弾く
        if (r.updated_at < old.updated_at) continue

        // (b) 中身が同じならサーバーの時刻を動かさない
        const same =
          JSON.stringify(old.data) === JSON.stringify(r.data) &&
          old.updated_at === r.updated_at &&
          old.deleted_at === r.deleted_at
        if (same) continue
      }

      this.rows.set(key, {
        kind: r.kind,
        id: r.id,
        data: r.data,
        updated_at: r.updated_at,
        deleted_at: r.deleted_at,
        server_updated_at: this.stamp(),
      })
    }
  }

  since(cursor: string | null): RemoteRecord[] {
    return [...this.rows.values()]
      .filter((r) => !cursor || r.server_updated_at > cursor)
      .sort((a, b) => a.server_updated_at.localeCompare(b.server_updated_at))
  }
}

function transportFor(server: FakeServer): SyncTransport {
  return {
    async pull(cursor) {
      return server.since(cursor)
    },
    async push(rows) {
      server.upsert(rows)
    },
  }
}

// ---------------------------------------------------------------- 道具

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

/**
 * 実際のアプリは updatedAt に Date.now() を入れる。
 * 小さな値を使うと「前回送った時刻より後か」の判定から漏れて、
 * 本番と違う挙動になるため、ここでも現実的な時刻を進めながら使う。
 */
let clock = Date.now()
const tick = (ms = 1000) => (clock += ms)

const base = (id: string, t: number) => ({ id, createdAt: t, updatedAt: t, deletedAt: null })

async function freshDb(name: string) {
  const d = new LifeLogDB(name)
  await d.open()
  return d
}

// ---------------------------------------------------------------- 検証

async function main() {
  const server = new FakeServer()
  const t = transportFor(server)

  const A = await freshDb('deviceA')
  const B = await freshDb('deviceB')

  console.log('\n【1】片方で作った記録が、もう片方に届くか')
  await A.tags.add({
    ...base('tag-1', tick()),
    name: '簿記2級',
    groupId: null,
    color: '#3355D1',
    archived: false,
    order: 0,
  })
  await syncOnce(t, A)
  await syncOnce(t, B)
  const onB = await B.tags.get('tag-1')
  check('端末Aのタグが端末Bに届いた', onB?.name === '簿記2級', onB?.name)

  console.log('\n【2】同じ記録を両方で直したとき、新しい方が残るか')
  const tA = tick()
  await A.tags.update('tag-1', { name: 'Aが変更', updatedAt: tA })
  const tB = tick()
  await B.tags.update('tag-1', { name: 'Bが変更', updatedAt: tB }) // Bの方が新しい
  await syncOnce(t, A)
  await syncOnce(t, B)
  await syncOnce(t, A)
  const finalA = await A.tags.get('tag-1')
  const finalB = await B.tags.get('tag-1')
  check('新しい方（B）が両端末で残った', finalA?.name === 'Bが変更' && finalB?.name === 'Bが変更',
    `A=${finalA?.name} B=${finalB?.name}`)

  console.log('\n【3】古い内容が、新しい内容を上書きしないか（サーバー側の番人）')
  // 長くオフラインだった端末が、古い内容をそのまま送ってくる状況を直接再現する
  server.upsert([
    {
      kind: 'tags',
      id: 'tag-1',
      data: { name: 'ずっと前の内容', groupId: null, color: '#000', archived: false, order: 0, createdAt: 1 },
      updated_at: tA - 60_000,
      deleted_at: null,
    },
  ])
  const onServer = server.rows.get('tags:tag-1')
  check('古い書き込みはサーバーで弾かれた', onServer?.data.name === 'Bが変更', String(onServer?.data.name))
  await syncOnce(t, A)
  const afterStale = await A.tags.get('tag-1')
  check('端末側にも古い内容は入らない', afterStale?.name === 'Bが変更', afterStale?.name)

  console.log('\n【4】削除が伝わり、復活しないか')
  const tDel = tick()
  await B.tags.update('tag-1', { deletedAt: tDel, updatedAt: tDel })
  await syncOnce(t, B)
  await syncOnce(t, A)
  const deletedOnA = await A.tags.get('tag-1')
  check('端末Aでも削除済みになった', deletedOnA?.deletedAt === tDel, String(deletedOnA?.deletedAt))
  await syncOnce(t, A)
  await syncOnce(t, B)
  const stillDeleted = await A.tags.get('tag-1')
  check('同期を重ねても復活しない', stillDeleted?.deletedAt === tDel)

  console.log('\n【5】送り合いが無限に続かないか（これが一番怖い）')
  const before = server.writes
  for (let i = 0; i < 5; i++) {
    await syncOnce(t, A)
    await syncOnce(t, B)
  }
  const added = server.writes - before
  check('変更が無ければ書き込みが止まる', added === 0, `${added}件の余計な書き込み`)

  console.log('\n【6】タイマーが端末をまたいで正しく扱われるか')
  const started = tick()
  await A.activeTimer.put({
    id: 'active',
    tagId: null,
    originStartedAt: started,
    segmentStartedAt: started,
    accumulatedMs: 0,
    isPaused: false,
    memo: '',
    deviceId: 'device-A',
    deviceName: 'iPhone',
    createdAt: started,
    updatedAt: started,
    deletedAt: null,
  })
  await syncOnce(t, A)
  await syncOnce(t, B)
  const timerOnB = await B.activeTimer.get('active')
  check('Aで始めた計測がBにも見える', timerOnB?.deletedAt === null && timerOnB?.deviceName === 'iPhone')
  check('Bから見て「他の端末のもの」と判別できる', timerOnB?.deviceId === 'device-A')

  // Bで停止する
  const tStop = tick()
  await B.activeTimer.update('active', { deletedAt: tStop, updatedAt: tStop })
  await syncOnce(t, B)
  await syncOnce(t, A)
  const timerOnA = await A.activeTimer.get('active')
  check('Bで止めた計測がAでも止まっている', timerOnA?.deletedAt === tStop, String(timerOnA?.deletedAt))

  await syncOnce(t, A)
  await syncOnce(t, B)
  const notRevived = await A.activeTimer.get('active')
  check('止めた計測が復活しない', notRevived?.deletedAt === tStop)

  console.log('\n【7】オフラインで貯めた変更が、つながったときに届くか')
  await A.transactions.add({
    ...base('tx-1', tick()),
    amount: 680,
    type: 'expense',
    tagId: null,
    name: '昼食',
    occurredAt: clock,
    recurringId: null,
  })
  await A.transactions.add({
    ...base('tx-2', tick()),
    amount: 1490,
    type: 'expense',
    tagId: null,
    name: 'Netflix',
    occurredAt: clock,
    recurringId: null,
  })
  await syncOnce(t, A)
  await syncOnce(t, B)
  const txCount = await B.transactions.count()
  check('まとめて2件とも届いた', txCount === 2, `${txCount}件`)

  console.log('\n【8】3台目が後から入っても、過去の記録を全部受け取れるか')
  const C = await freshDb('deviceC')
  await syncOnce(t, C)
  const cTx = await C.transactions.count()
  const cTimer = await C.activeTimer.get('active')
  check('過去の支出をすべて取得した', cTx === 2, `${cTx}件`)
  check('停止済みのタイマーも停止状態で受け取った', cTimer?.deletedAt === tStop)

  console.log('\n【9】端末の時計がずれていても、同じ行を送り続けないか')
  // 端末Bの時計が1時間進んでいる状況を作る
  const future = Date.now() + 60 * 60 * 1000
  await B.tags.add({
    ...base('tag-future', future),
    name: '時計が進んだ端末で作ったタグ',
    groupId: null,
    color: '#C55A14',
    archived: false,
    order: 1,
  })
  await syncOnce(t, B)
  await syncOnce(t, A)
  const gotFuture = await A.tags.get('tag-future')
  check('未来の時刻の記録も届く', gotFuture?.name === '時計が進んだ端末で作ったタグ')

  const beforeSkew = server.writes
  for (let i = 0; i < 5; i++) {
    await syncOnce(t, A)
    await syncOnce(t, B)
  }
  const skewWrites = server.writes - beforeSkew
  check('時計がずれていても送信が止まる', skewWrites === 0, `${skewWrites}件の余計な送信`)

  console.log('\n【10】送信に失敗したら、次回やり直されるか')
  const flaky: SyncTransport = {
    pull: (c) => t.pull(c),
    push: async () => {
      throw new Error('通信エラー')
    },
  }
  const tNew = tick()
  await A.tags.add({
    ...base('tag-retry', tNew),
    name: '送信失敗するはずのタグ',
    groupId: null,
    color: '#0D8FA3',
    archived: false,
    order: 2,
  })
  let threw = false
  try {
    await syncOnce(flaky, A)
  } catch {
    threw = true
  }
  check('送信の失敗は握りつぶされない', threw)
  await syncOnce(t, A)
  await syncOnce(t, B)
  const retried = await B.tags.get('tag-retry')
  check('次の同期でちゃんと届く', retried?.name === '送信失敗するはずのタグ', retried?.name)

  console.log('\n' + (failures === 0 ? '✅ すべて通過' : `❌ ${failures}件 失敗`))
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
