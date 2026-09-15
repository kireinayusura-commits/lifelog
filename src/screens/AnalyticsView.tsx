import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive } from '../db/repo'
import { useTags } from '../components/TagPicker'
import { DayBars, DayClock, Donut, StatTile } from '../components/charts'
import { Card } from '../components/ui'
import {
  DEFAULT_GRANULARITY,
  GRANULARITIES,
  PERIODS,
  aggregateByTag,
  buildBuckets,
  elapsedDaysIn,
  fillBuckets,
  hourHistogram,
  thinLabels,
  type Granularity,
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

  const [period, setPeriod] = useState<Period>('month')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const [selected, setSelected] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)

  // 期間を変えたら粒度も妥当なものに戻す。1年を日ごとで開いて驚くのを避ける。
  useEffect(() => {
    setGranularity(DEFAULT_GRANULARITY[period])
    setSelected(null)
  }, [period])

  const { buckets, totalSec, totalYen, byTime, byMoney, hours, from, to } = useMemo(() => {
    const ss = alive(sessions)
    const ts = alive(transactions)
    const earliest = Math.min(
      ...ss.map((s) => s.startedAt),
      ...ts.map((t) => t.occurredAt),
      Date.now(),
    )
    const base = fillBuckets(buildBuckets(period, granularity, earliest), ss, ts)
    const f = base.length ? base[0].ts : Date.now()
    const t2 = base.length ? base[base.length - 1].end : Date.now()
    return {
      buckets: base,
      from: f,
      to: t2,
      totalSec: base.reduce((a, b) => a + b.sec, 0),
      totalYen: base.reduce((a, b) => a + b.yen, 0),
      byTime: aggregateByTag(tags, ss, ts, f, t2, 'sec'),
      byMoney: aggregateByTag(tags, ss, ts, f, t2, 'yen'),
      hours: hourHistogram(ss, f, t2),
    }
  }, [sessions, transactions, tags, period, granularity])

  const axisLabels = thinLabels(buckets, buckets.length > 40 ? 6 : 8)
  const sel = selected !== null ? buckets[selected] : null
  const days = elapsedDaysIn(buckets)
  const activeBuckets = buckets.filter((b) => b.sec > 0).length

  const unit = granularity === 'day' ? '日' : granularity === 'week' ? '週' : 'か月'

  return (
    <div className="flex flex-col gap-5">
      {/* 期間と粒度。すべてのグラフがこの2つに従う */}
      <div className="flex flex-col gap-2">
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex w-max gap-1.5">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => setPeriod(p.id)}
                aria-pressed={period === p.id}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold ${
                  period === p.id
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-surface text-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex rounded-xl border border-rule bg-surface p-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setGranularity(g.id)
                setSelected(null)
              }}
              aria-pressed={granularity === g.id}
              className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold ${
                granularity === g.id ? 'bg-surface2 text-ink' : 'text-muted'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatTile
          label="合計時間"
          value={totalSec > 0 ? formatDuration(totalSec) : '—'}
          sub={activeBuckets > 0 ? `${activeBuckets}${unit} 記録あり` : undefined}
          color={TIME_COLOR}
        />
        <StatTile
          label="合計支出"
          value={totalYen > 0 ? formatYen(totalYen) : '—'}
          sub={totalYen > 0 ? `1日あたり ${formatYen(Math.round(totalYen / days))}` : undefined}
          color={MONEY_COLOR}
        />
      </div>

      {/* 推移 */}
      <Card className="px-4 py-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-[13px] font-bold">推移</h3>
          <span className="text-[11.5px] text-muted">
            {sel ? '押すと解除' : '棒を押すと内訳'}
          </span>
        </div>

        <div className="tnum mt-2 flex h-[22px] items-center gap-3 text-[13px]">
          {sel ? (
            <>
              <span className="font-semibold">{sel.fullLabel}</span>
              <span className="text-time">{sel.sec > 0 ? formatDuration(sel.sec) : '—'}</span>
              <span className="text-money">{sel.yen > 0 ? formatYen(sel.yen) : '—'}</span>
            </>
          ) : (
            <span className="text-muted">
              {buckets.length}
              {unit}分
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-4">
          <DayBars
            label="時間"
            values={buckets.map((b) => b.sec)}
            color={TIME_COLOR}
            format={(v) => formatDuration(v)}
            dayLabels={buckets.map((b) => b.fullLabel)}
            selected={selected}
            onSelect={setSelected}
          />
          <DayBars
            label="支出"
            values={buckets.map((b) => b.yen)}
            color={MONEY_COLOR}
            format={(v) => formatYen(v)}
            dayLabels={buckets.map((b) => b.fullLabel)}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        {/*
          軸は2つのグラフで共通。単位が違うので縦軸は重ねない。
          棒が50本を超えると1本あたりの幅が数pxしかなく、ラベルを棒の枠に
          押し込むと文字が切れる。棒の位置に対して絶対配置し、枠をはみ出して
          描けるようにしてある。
        */}
        <div className="relative mt-1.5 h-4">
          {axisLabels.map((l, i) =>
            l ? (
              <span
                key={i}
                className={`tnum absolute top-0 text-[10px] whitespace-nowrap ${
                  selected === i ? 'font-bold text-ink' : 'text-muted'
                }`}
                style={{
                  left: `${((i + 0.5) / axisLabels.length) * 100}%`,
                  transform:
                    i === 0
                      ? 'translateX(0)'
                      : i === axisLabels.length - 1
                        ? 'translateX(-100%)'
                        : 'translateX(-50%)',
                }}
              >
                {l}
              </span>
            ) : null,
          )}
        </div>

        <button
          onClick={() => setShowTable((v) => !v)}
          className="mt-3 text-[12px] text-muted underline"
        >
          {showTable ? '表を閉じる' : '数値で見る'}
        </button>

        {showTable && (
          <div className="mt-2 max-h-[320px] overflow-auto">
            <table className="tnum w-full text-[12.5px]">
              <thead className="sticky top-0 bg-surface">
                <tr className="text-[10.5px] tracking-wider text-muted">
                  <th className="py-1.5 text-left font-medium">期間</th>
                  <th className="py-1.5 text-right font-medium">時間</th>
                  <th className="py-1.5 text-right font-medium">支出</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key} className="border-t border-rulesoft">
                    <td className="py-1.5">{b.fullLabel}</td>
                    <td className="py-1.5 text-right">
                      {b.sec > 0 ? formatDuration(b.sec) : '—'}
                    </td>
                    <td className="py-1.5 text-right">{b.yen > 0 ? formatYen(b.yen) : '—'}</td>
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

      {/* 集計範囲を明示しておく */}
      <p className="px-1 text-[11.5px] text-muted">
        {new Date(from).toLocaleDateString('ja-JP')} 〜{' '}
        {new Date(Math.min(to - 1, Date.now())).toLocaleDateString('ja-JP')} の記録
      </p>
    </div>
  )
}
