import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive } from '../db/repo'
import { useTags } from '../components/TagPicker'
import { DayBars, DayClock, Donut, StatTile } from '../components/charts'
import { Card } from '../components/ui'
import {
  DOW_LABELS,
  aggregateByTag,
  buildDays,
  elapsedDays,
  fillDays,
  hourHistogram,
  type Period,
} from '../lib/analytics'
import { formatYen } from '../lib/money'
import { formatDuration } from '../lib/time'

const TIME_COLOR = 'var(--c-time)'
const MONEY_COLOR = 'var(--c-money)'

export function AnalyticsView() {
  const sessions = useLiveQuery(() => db.sessions.toArray(), [], undefined)
  const transactions = useLiveQuery(() => db.transactions.toArray(), [], undefined)
  const tags = useTags()

  const [period, setPeriod] = useState<Period>('week')
  const [selected, setSelected] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  const { days, totalSec, totalYen, byTime, byMoney, hours } = useMemo(() => {
    const ss = alive(sessions)
    const ts = alive(transactions)
    const base = fillDays(buildDays(period), ss, ts)
    const f = base.length ? base[0].ts : Date.now()
    const to = base.length ? base[base.length - 1].ts + 86400000 : Date.now()
    return {
      days: base,
      totalSec: base.reduce((a, d) => a + d.sec, 0),
      totalYen: base.reduce((a, d) => a + d.yen, 0),
      byTime: aggregateByTag(tags, ss, ts, f, 'sec'),
      byMoney: aggregateByTag(tags, ss, ts, f, 'yen'),
      hours: hourHistogram(ss, f, to),
    }
  }, [sessions, transactions, tags, period])

  // 月表示は日数が多いので、ラベルは間引く
  const dayLabels = days.map((d) =>
    period === 'week' ? DOW_LABELS[d.dow] : String(new Date(d.ts).getDate()),
  )
  const axisLabels = days.map((d, i) => {
    if (period === 'week') return DOW_LABELS[d.dow]
    const n = new Date(d.ts).getDate()
    return n === 1 || n % 5 === 0 || i === days.length - 1 ? String(n) : ''
  })

  const pick = (i: number | null) => setSelected(i)
  const sel = selected !== null ? days[selected] : null
  const activeDays = days.filter((d) => d.sec > 0).length

  return (
    <div className="flex flex-col gap-5">
      {/* 期間の切り替え。すべてのグラフがこの1箇所に従う */}
      <div className="flex rounded-xl border border-rule bg-surface p-1">
        {(['week', 'month'] as const).map((p) => (
          <button
            key={p}
            onClick={() => {
              setPeriod(p)
              setSelected(null)
            }}
            aria-pressed={period === p}
            className={`flex-1 rounded-lg py-2 text-[13.5px] font-semibold ${
              period === p ? 'bg-ink text-paper' : 'text-muted'
            }`}
          >
            {p === 'week' ? '今週' : '今月'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label="合計時間"
          value={totalSec > 0 ? formatDuration(totalSec) : '—'}
          sub={activeDays > 0 ? `${activeDays}日 記録あり` : undefined}
          color={TIME_COLOR}
        />
        <StatTile
          label="合計支出"
          value={totalYen > 0 ? formatYen(totalYen) : '—'}
          sub={
            totalYen > 0 ? `1日あたり ${formatYen(Math.round(totalYen / elapsedDays(days)))}` : undefined
          }
          color={MONEY_COLOR}
        />
      </div>

      {/* 日別の推移 */}
      <Card className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-bold">日別の推移</h3>
          <span className="text-[11.5px] text-muted">
            {sel ? '棒をもう一度押すと解除' : '棒を押すと内訳'}
          </span>
        </div>

        {/* 選んだ日の読み取り。数値はグラフの外にも出す */}
        <div className="tnum mt-2 flex h-[22px] items-center gap-3 text-[13px]">
          {sel ? (
            <>
              <span className="font-semibold">
                {new Date(sel.ts).getMonth() + 1}/{new Date(sel.ts).getDate()}（
                {DOW_LABELS[sel.dow]}）
              </span>
              <span className="text-time">{sel.sec > 0 ? formatDuration(sel.sec) : '—'}</span>
              <span className="text-money">{sel.yen > 0 ? formatYen(sel.yen) : '—'}</span>
            </>
          ) : (
            <span className="text-muted">
              {period === 'week' ? '月曜からの7日間' : '今月1日から今日まで'}
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-4">
          <DayBars
            label="時間"
            values={days.map((d) => d.sec)}
            color={TIME_COLOR}
            format={(v) => formatDuration(v)}
            dayLabels={dayLabels}
            selected={selected}
            onSelect={pick}
          />
          <DayBars
            label="支出"
            values={days.map((d) => d.yen)}
            color={MONEY_COLOR}
            format={(v) => formatYen(v)}
            dayLabels={dayLabels}
            selected={selected}
            onSelect={pick}
          />
        </div>

        {/* 日付の軸は2つのグラフで共通。単位が違うので縦軸は重ねない */}
        <div className="mt-1.5 flex gap-[2px]">
          {axisLabels.map((l, i) => (
            <span
              key={i}
              className={`tnum flex-1 text-center text-[10px] ${
                selected === i ? 'font-bold text-ink' : 'text-muted'
              }`}
              style={{ minWidth: 4 }}
            >
              {l}
            </span>
          ))}
        </div>

        <button
          onClick={() => setShowTable((v) => !v)}
          className="mt-3 text-[12px] text-muted underline"
        >
          {showTable ? '表を閉じる' : '数値で見る'}
        </button>

        {showTable && (
          <div className="mt-2 overflow-x-auto">
            <table className="tnum w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] tracking-wider text-muted">
                  <th className="py-1.5 text-left font-medium">日</th>
                  <th className="py-1.5 text-right font-medium">時間</th>
                  <th className="py-1.5 text-right font-medium">支出</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.key} className="border-t border-rulesoft">
                    <td className="py-1.5">
                      {new Date(d.ts).getDate()}日（{DOW_LABELS[d.dow]}）
                    </td>
                    <td className="py-1.5 text-right">
                      {d.sec > 0 ? formatDuration(d.sec) : '—'}
                    </td>
                    <td className="py-1.5 text-right">{d.yen > 0 ? formatYen(d.yen) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 何時に活動しているか */}
      <Card className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-bold">何時に活動しているか</h3>
          <span className="text-[11px] text-muted">24時間</span>
        </div>
        <div className="mt-2">
          <DayClock hours={hours} color={TIME_COLOR} format={formatDuration} />
        </div>
      </Card>

      {/* タグ別の割合 */}
      <Card className="px-4 py-4">
        <h3 className="text-[13px] font-bold">
          何に時間を使ったか<span className="ml-2 text-[11px] font-normal text-muted">タグ別</span>
        </h3>
        <div className="mt-3">
          <Donut
            rows={byTime.map((r) => ({ id: r.id, name: r.name, color: r.color, value: r.sec }))}
            total={totalSec}
            format={formatDuration}
            centerLabel="合計"
          />
        </div>
      </Card>

      <Card className="px-4 py-4">
        <h3 className="text-[13px] font-bold">
          何にお金を使ったか<span className="ml-2 text-[11px] font-normal text-muted">タグ別</span>
        </h3>
        <div className="mt-3">
          <Donut
            rows={byMoney.map((r) => ({ id: r.id, name: r.name, color: r.color, value: r.yen }))}
            total={totalYen}
            format={formatYen}
            centerLabel="合計"
          />
        </div>
      </Card>
    </div>
  )
}
