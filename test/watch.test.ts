/**
 * Apple Watch から書かれた記録を、アプリがそのまま読めるかの検証。
 *
 * test/pg/records.json は本物の PostgreSQL に supabase/schema.sql と
 * supabase/watch.sql を入れ、Watch 用の関数を実際に呼んで出てきた中身
 * （test/pg/run.sh が出力する）。それを同期の経路にそのまま流し込んで、
 * アプリ側の型どおりに入るかを確かめる。
 *
 * SQL とアプリで項目名がひとつでも食い違うと、
 * 「Watch で押したのに何も増えない」という最悪の壊れ方をするので、
 * ここは実データで突き合わせる。
 *
 *   npx tsx test/watch.test.ts
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { LifeLogDB } from '../src/db/db'
import { syncOnce, type SyncTransport } from '../src/sync/engine'
import type { RemoteRecord } from '../src/sync/merge'
import { blockingReason, liveTimer } from '../src/timer/logic'
import type { Session, Transaction } from '../src/db/types'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

const rows: RemoteRecord[] = JSON.parse(
  readFileSync(new URL('./pg/records.json', import.meta.url), 'utf8'),
)

/** サーバー役。Watch が書いたあとの中身をそのまま配る。 */
function transport(): SyncTransport & { pushed: number } {
  const t = {
    pushed: 0,
    async pull(cursor: string | null) {
      return rows.filter((r) => !cursor || r.server_updated_at > cursor)
    },
    async push(out: { kind: string }[]) {
      t.pushed += out.length
    },
  }
  return t
}

async function main() {
  console.log('\n【1】Watch が書いたものが、アプリの形で入るか')
  const db = new LifeLogDB('watch-ingest')
  await db.open()
  const t = transport()
  const report = await syncOnce(t, db)
  check('サーバーの中身をすべて取り込んだ', report.pulled === rows.length, `${report.pulled}件`)

  const sessions = await db.sessions.toArray()
  const s = sessions.find((x) => x.durationSec === 90) as Session | undefined
  check('タイマーの記録が入った', !!s)
  if (s) {
    check('長さが90秒', s.durationSec === 90, String(s.durationSec))
    check('開始と終了の差が長さと合う',
      Math.round((s.endedAt - s.startedAt) / 1000) === s.durationSec,
      `${s.endedAt - s.startedAt}ms`)
    check('タグが付いている', s.tagId === 'tag-eng', String(s.tagId))
    check('タイマー由来と分かる', s.source === 'timer', s.source)
    check('削除済みになっていない', s.deletedAt === null)
    check('必要な項目がすべて数値・文字列として入っている',
      typeof s.id === 'string' &&
        typeof s.createdAt === 'number' &&
        typeof s.updatedAt === 'number' &&
        typeof s.startedAt === 'number' &&
        typeof s.endedAt === 'number' &&
        typeof s.durationSec === 'number' &&
        typeof s.memo === 'string')
    check('undefined になっている項目が無い',
      Object.entries(s).every(([, v]) => v !== undefined),
      Object.entries(s).filter(([, v]) => v === undefined).map(([k]) => k).join(','))
  }

  console.log('\n【2】支出が支出として入るか')
  const txs = (await db.transactions.toArray()) as Transaction[]
  const tx = txs.find((x) => x.amount === 680)
  check('支出が入った', !!tx)
  if (tx) {
    check('支出として扱われる', tx.type === 'expense', tx.type)
    check('タグが付いている', tx.tagId === 'tag-food', String(tx.tagId))
    check('名前が入っている', tx.name === 'Watchから記録', tx.name)
    check('固定費ではない', tx.recurringId === null)
    check('発生時刻がある', typeof tx.occurredAt === 'number')
  }
  const rounded = txs.find((x) => x.amount === 1201)
  check('小数の金額が整数で入った', !!rounded && rounded.name === '昼食', rounded?.name)

  console.log('\n【3】Watch で止めたタイマーが、アプリでも止まって見えるか')
  const raw = await db.activeTimer.get('active')
  check('タイマーの行は残っている（消さずに止める）', !!raw)
  check('アプリからは「計測していない」と見える', liveTimer(raw) === null)
  check('この端末で開始を押しても邪魔されない', blockingReason(raw, 'device-phone') === null)

  console.log('\n【4】受け取ったものを、そのまま送り返さないか')
  const before = t.pushed
  await syncOnce(t, db)
  await syncOnce(t, db)
  check('往復が起きない', t.pushed === before, `${t.pushed - before}件 送り返した`)

  console.log('\n【5】タグと支出が結びつくか（画面に出るときの形）')
  const tag = await db.tags.get('tag-food')
  check('タグも一緒に届いている', tag?.name === '食費', tag?.name)
  check('支出のタグIDが実在するタグを指している',
    !!tx && !!(await db.tags.get(tx.tagId!)))

  console.log('\n' + (failures === 0 ? '✅ すべて通過' : `❌ ${failures}件 失敗`))
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
