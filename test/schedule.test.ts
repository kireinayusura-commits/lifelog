/**
 * 予定の計算の検証。
 *
 * ここが狂うと「使える時間」が嘘になる。嘘の数字を見て一日を組むのが
 * 一番まずいので、空き・合計・重なり・時刻の読み書きを実データで確かめる。
 *
 *   npx tsx test/schedule.test.ts
 */
import 'fake-indexeddb/auto'
import { LifeLogDB } from '../src/db/db'
import type { Block } from '../src/db/types'
import {
  buildRows,
  currentBlock,
  dateKey,
  findOverlap,
  formatLen,
  formatMin,
  nextBlock,
  nowMinFor,
  parseMin,
  shiftDate,
  totals,
} from '../src/schedule/logic'

let failures = 0
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '  ✅' : '  ❌'} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

let seq = 0
function block(startMin: number, durationMin: number, kind: Block['kind'], title = ''): Block {
  seq += 1
  const t = 1000 + seq
  return {
    id: `b${seq}`,
    createdAt: t,
    updatedAt: t,
    deletedAt: null,
    date: '2026-11-18',
    startMin,
    durationMin,
    title: title || `${kind}${seq}`,
    tagId: null,
    kind,
    partId: null,
  }
}

const FRAME_START = 8 * 60 // 8:00
const FRAME_END = 24 * 60 // 24:00

async function main() {
  console.log('\n【1】置いていない時間が「空き」として出るか')
  {
    const bs = [block(9 * 60, 90, 'study'), block(13 * 60, 40, 'life')]
    const rows = buildRows(bs, FRAME_START, FRAME_END)
    const gaps = rows.filter((r) => r.type === 'gap')
    check('空きは3つ（朝・間・夜）', gaps.length === 3, `${gaps.length}個`)
    check('朝の空きは 8:00〜9:00', gaps[0].startMin === 480 && gaps[0].endMin === 540)
    check('間の空きは 10:30〜13:00', gaps[1].startMin === 630 && gaps[1].endMin === 780)
    check('夜の空きは 13:40〜24:00', gaps[2].startMin === 820 && gaps[2].endMin === 1440)
    check('並びは時刻順', rows.every((r, i) => i === 0 || rows[i - 1].startMin <= r.startMin))
  }

  console.log('\n【2】合計が合うか')
  {
    const bs = [
      block(9 * 60, 90, 'study'), // 90
      block(10 * 60 + 50, 150, 'study'), // 150
      block(13 * 60 + 20, 40, 'life'), // 40
      block(14 * 60, 120, 'event'), // 120
    ]
    const t = totals(bs, FRAME_START, FRAME_END)
    check('勉強の合計 240分', t.studyMin === 240, String(t.studyMin))
    check('生活の合計 40分', t.lifeMin === 40, String(t.lifeMin))
    check('予定の合計 120分', t.eventMin === 120, String(t.eventMin))
    check('枠は16時間', t.frameMin === 960, String(t.frameMin))
    check(
      '空き ＝ 枠 − 置いた合計',
      t.freeMin === 960 - (240 + 40 + 120),
      `${t.freeMin}分`,
    )
  }

  console.log('\n【3】枠を変えると使える時間が変わるか（遅く起きた日）')
  {
    const bs = [block(13 * 60, 60, 'study')]
    const normal = totals(bs, 8 * 60, 24 * 60)
    const late = totals(bs, 11 * 60, 24 * 60)
    check('8時起きなら空きは15時間', normal.freeMin === 900, `${normal.freeMin}分`)
    check('11時起きなら空きは12時間', late.freeMin === 720, `${late.freeMin}分`)
    check('勉強の予定は変わらない', normal.studyMin === late.studyMin)
  }

  console.log('\n【4】日をまたぐ枠（翌1:30就寝）を扱えるか')
  {
    const bs = [block(23 * 60, 120, 'study')] // 23:00〜翌1:00
    const t = totals(bs, 8 * 60, 25 * 60 + 30) // 8:00〜翌1:30
    check('枠は17時間30分', t.frameMin === 1050, String(t.frameMin))
    check('日をまたぐ勉強も数えられる', t.studyMin === 120)
    const rows = buildRows(bs, 8 * 60, 25 * 60 + 30)
    const last = rows[rows.length - 1]
    check('最後に翌1:00〜翌1:30の空きが残る',
      last.type === 'gap' && last.startMin === 1500 && last.endMin === 1530)
    check('翌日の時刻は「翌」で表す', formatMin(1500) === '翌1:00', formatMin(1500))
  }

  console.log('\n【5】重なりを見つけられるか（自動でずらさない）')
  {
    const bs = [block(9 * 60, 90, 'study', '英語')]
    const over = block(10 * 60, 60, 'study', '政経') // 10:00 は英語の最中
    const clear = block(10 * 60 + 30, 60, 'study', '政経') // ちょうど終わりから
    check('重なりを見つける', findOverlap(bs, over)?.title === '英語')
    check('隣接（終わり＝始まり）は重なりではない', findOverlap(bs, clear) === null)
    check('自分自身とは重ならない', findOverlap(bs, bs[0]) === null)
    const inside = block(9 * 60 + 10, 10, 'life') // 完全に内側
    check('内側にすっぽり入るものも見つける', findOverlap(bs, inside)?.title === '英語')
  }

  console.log('\n【6】重なっても「使える時間」が水増しされないか')
  {
    // 置けないはずの重なりが何かの拍子に入っても、空きが負や過大にならないこと
    const bs = [block(9 * 60, 120, 'study'), block(10 * 60, 120, 'study')] // 9:00-11:00 と 10:00-12:00
    const t = totals(bs, 8 * 60, 24 * 60)
    check('空きは実際に空いている時間だけ', t.freeMin === 60 + 720, `${t.freeMin}分`)
    check('空きが枠を超えない', t.freeMin <= t.frameMin)
  }

  console.log('\n【7】「いま何の時間か」が合うか')
  {
    const bs = [
      block(9 * 60, 90, 'study', '英語'),
      block(13 * 60, 60, 'life', '昼食'),
    ]
    check('計測中の時間帯', currentBlock(bs, 9 * 60 + 30)?.title === '英語')
    check('始まった瞬間は入る', currentBlock(bs, 9 * 60)?.title === '英語')
    check('終わった瞬間は外れる', currentBlock(bs, 10 * 60 + 30) === null)
    check('空き時間なら何もない', currentBlock(bs, 11 * 60) === null)
    check('次の予定が分かる', nextBlock(bs, 11 * 60)?.title === '昼食')
    check('最後の予定のあとは次が無い', nextBlock(bs, 20 * 60) === null)
  }

  console.log('\n【8】深夜0時をまたいでも「いま」が1日ずれないか')
  {
    const base = new Date(2026, 10, 19, 1, 0) // 11/19 の 1:00
    check('前日の帯から見ると翌1:00＝1500分',
      nowMinFor('2026-11-18', base) === 1500, String(nowMinFor('2026-11-18', base)))
    check('当日の帯から見ると60分',
      nowMinFor('2026-11-19', base) === 60, String(nowMinFor('2026-11-19', base)))
    check('関係ない日は null', nowMinFor('2026-11-10', base) === null)
  }

  console.log('\n【9】時刻と長さの読み書き')
  {
    check('9:00 を読める', parseMin('9:00') === 540)
    check('全角でも読める', parseMin('９：３０') === 570, String(parseMin('９：３０')))
    check('翌1:30 を読める', parseMin('翌1:30') === 1530, String(parseMin('翌1:30')))
    check('でたらめは断る', parseMin('あした') === null)
    check('分が60以上なら断る', parseMin('9:70') === null)
    check('書いて読み直すと戻る',
      parseMin(formatMin(1245)) === 1245 && parseMin(formatMin(1530)) === 1530)
    check('長さの表記', formatLen(150) === '2時間30分' && formatLen(60) === '1時間' && formatLen(45) === '45分',
      `${formatLen(150)} / ${formatLen(60)} / ${formatLen(45)}`)
  }

  console.log('\n【10】日付の受け渡しで時差ずれが起きないか')
  {
    const d = new Date(2026, 0, 1, 23, 30) // 元日の23:30
    check('その日の文字列になる', dateKey(d) === '2026-01-01', dateKey(d))
    check('翌日は月をまたぐ', shiftDate('2026-01-31', 1) === '2026-02-01', shiftDate('2026-01-31', 1))
    check('前日は年をまたぐ', shiftDate('2026-01-01', -1) === '2025-12-31', shiftDate('2026-01-01', -1))
  }

  console.log('\n【11】保存して読み直しても同じか（移行ずみのデータベース）')
  {
    const d = new LifeLogDB('schedule-test')
    await d.open()
    const now = Date.now()
    await d.parts.add({
      id: 'p1',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      name: '講義1コマ',
      durationMin: 150,
      tagId: null,
      kind: 'study',
      order: 0,
      lastDurationMin: null,
    })
    await d.blocks.add(block(9 * 60, 90, 'study', '英語長文'))
    const got = await d.blocks.where('date').equals('2026-11-18').toArray()
    check('日付で引ける', got.length === 1 && got[0].title === '英語長文')
    const part = await d.parts.get('p1')
    check('固定長の部品が残る', part?.durationMin === 150)
    const settings = await d.settings.get('settings')
    check('設定が無くても落ちない', settings === undefined)
    d.close()
  }

  console.log('\n' + (failures === 0 ? '✅ すべて通過' : `❌ ${failures}件 失敗`))
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
