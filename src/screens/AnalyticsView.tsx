import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive } from '../db/repo'
import { useTags } from '../components/TagPicker'
import { DayBars, DayClock, Donut, StatTile } from '../components/charts'
import { Card } from '../components/ui'
import {
  PERIODS,
  aggregateByTag,
  buildBuckets,
  elapsedDaysIn,
  fillBuckets,
  granularityOptions,
  hourHistogram,
  resolveGranularity,
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
  /** null なら全タグ。タグを選ぶと推移・24時間・合計がそのタグだけになる。 */
  const [tagFilter, setTagFilter] = useState<string | null>(null)

  // 絞り込み中のタグが消えたら「すべて」に戻す
  useEffect(() => {
    if (tagFilter && !tags.some((t) => t.id === tagFilter)) setTagFilter(null)
  }, [tags, tagFilter])

  /** 全期間の起点。記録が1件も無ければ今日。 */
  const earliest = useMemo(() => {
    const ss = alive(sessions)
    const ts = alive(transactions)
    return Math.min(...ss.map((s) => s.startedAt), ...ts.map((t) => t.occurredAt), Date.now())
  }, [sessions, transactions])

  // 画面に収まらない粒度は選べないようにする
  const granOptions = useMemo(() => granularityOptions(period, earliest), [period, earliest])

  // 期間を変えたら粒度も選べるものに寄せる。1年を日ごとで開いて棒が365本、を避ける。
  useEffect(() => {
    setGranularity((g) => resolveGranularity(period, g, earliest))
    setSelected(null)
  }, [period, earliest])

  const { buckets, totalSec, totalYen, byTime, byMoney, hours, from, to, tagsInPeriod } =
    useMemo(() => {
      const allSessions = alive(sessions)
      const allTx = alive(transactions)

      // 期間の範囲は絞り込みに関係なく決まる
      const frame = buildBuckets(period, granularity, earliest)
      const f = frame.length ? frame[0].ts : Date.now()
      const t2 = frame.length ? frame[frame.length - 1].end : Date.now()

      // 推移・24時間・合計は絞り込み後のデータで作る
      const ss = tagFilter ? allSessions.filter((s) => s.tagId === tagFilter) : allSessions
      const ts = tagFilter ? allTx.filter((t) => t.tagId === tagFilter) : allTx
      const base = fillBuckets(frame, ss, ts)

      // 絞り込みのチップには、この期間に記録があるタグだけを出す
      const used = new Set<string>()
      for (const s of allSessions) if (s.tagId && s.startedAt >= f && s.startedAt < t2) used.add(s.tagId)
      for (const t of allTx) if (t.tagId && t.occurredAt >= f && t.occurredAt < t2) used.add(t.tagId)

      return {
        buckets: base,
        from: f,
        to: t2,
        totalSec: base.reduce((a, b) => a + b.sec, 0),
        totalYen: base.reduce((a, b) => a + b.yen, 0),
        // 内訳は常に全タグ。絞り込み中は表示しない
        byTime: aggregateByTag(tags, allSessions, allTx, f, t2, 'sec'),
        byMoney: aggregateByTag(tags, allSessions, allTx, f, t2, 'yen'),
        hours: hourHistogram(ss, f, t2),
        tagsInPeriod: tags.filter((t) => used.has(t.id)),
      }
    }, [sessions, transactions, tags, period, granularity, earliest, tagFilter])

  // 棒が少ないときに1本が帯のように太くならないよう、行の幅を絞る
  const chartMaxWidth = buckets.length <= 12 ? buckets.length * 40 : undefined

  const axisLabels = thinLabels(buckets, buckets.length > 40 ? 6 : 8)
  const sel = selected !== null ? buckets[selected] : null
  const days = elapsedDaysIn(buckets)
  const activeBuckets = buckets.filter((b) => b.sec > 0).length

  const unit = granularity === 'day' ? '日' : granularity === 'week' ? '週' : 'か月'
  const activeTag = tagFilter ? (tags.find((t) => t.id === tagFilter) ?? null) : null

  /** どのタグで見ているかを、絞り込みの効くグラフの見出しに必ず出す */
  const ScopeMark = () =>
    activeTag ? (
      <span className="flex items-center gap-1.5 text-[11.5px] font-semibold" style={{ color: activeTag.color }}>
        <span aria-hidden className="size-2 rounded-full" style={{ background: activeTag.color }} />
        {activeTag.name}
      </span>
    ) : (
      <span className="text-[11.5px] text-muted">すべてのタグ</span>
    )

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
          {granOptions.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                setGranularity(g.id)
                setSelected(null)
              }}
              disabled={!g.ok}
              aria-pressed={granularity === g.id}
              title={g.ok ? undefined : `この期間では${g.reason}`}
              className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold ${
                granularity === g.id ? 'bg-surface2 text-ink' : 'text-muted'
              } disabled:opacity-30`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* タグの絞り込み。推移・24時間・合計に効く */}
        {tagsInPeriod.length > 0 && (
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex w-max items-center gap-1.5">
              <button
                onClick={() => {
                  setTagFilter(null)
                  setSelected(null)
                }}
                aria-pressed={tagFilter === null}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                  tagFilter === null
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule bg-surface text-muted'
                }`}
              >
                すべて
              </button>
              {tagsInPeriod.map((t) => {
                const on = tagFilter === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTagFilter(on ? null : t.id)
                      setSelected(null)
                    }}
                    aria-pressed={on}
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${
                      on ? 'border-transparent text-paper' : 'border-rule bg-surface text-ink2'
                    }`}
                    style={on ? { background: t.color } : undefined}
                  >
                    {!on && (
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ background: t.color }}
                      />
                    )}
                    {t.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
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
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="flex items-baseline gap-2 text-[13px] font-bold">
            推移
            <ScopeMark />
          </h3>
          <span className="shrink-0 text-[11.5px] text-muted">
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
            maxWidth={chartMaxWidth}
          />
          <DayBars
            label="支出"
            values={buckets.map((b) => b.yen)}
            color={MONEY_COLOR}
            format={(v) => formatYen(v)}
            dayLabels={buckets.map((b) => b.fullLabel)}
            selected={selected}
            onSelect={setSelected}
            maxWidth={chartMaxWidth}
          />
        </div>

        {/*
          軸は2つのグラフで共通。単位が違うので縦軸は重ねない。
          棒が50本を超えると1本あたりの幅が数pxしかなく、ラベルを棒の枠に
          押し込むと文字が切れる。棒の位置に対して絶対配置し、枠をはみ出して
          描けるようにしてある。
        */}
        <div className="relative mt-1.5 h-4" style={{ maxWidth: chartMaxWidth }}>
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
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="flex items-baseline gap-2 text-[13px] font-bold">
            何時に活動しているか
            <ScopeMark />
          </h3>
          <span className="shrink-0 text-[11px] text-muted">24時間</span>
        </div>
        <div className="mt-2">
          <DayClock hours={hours} color={TIME_COLOR} format={formatDuration} />
        </div>
      </Card>

      {/*
        タグ別の割合。
        1つのタグに絞っている間は円が1切れになって意味を持たないうえ、
        上の合計（絞り込み後）と食い違う数字が同じ画面に並んでしまうので隠す。
      */}
      {activeTag ? (
        <button
          onClick={() => setTagFilter(null)}
          className="rounded-2xl border border-dashed border-rule px-5 py-5 text-center text-[12.5px] leading-relaxed text-muted"
        >
          タグ別の内訳は「すべて」のときに表示されます。
          <br />
          <span className="underline">ここを押すと絞り込みを解除します</span>
        </button>
      ) : (
        <>
          <Card className="px-4 py-4">
            <h3 className="text-[13px] font-bold">
              何に時間を使ったか
              <span className="ml-2 text-[11px] font-normal text-muted">タグ別</span>
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
              何にお金を使ったか
              <span className="ml-2 text-[11px] font-normal text-muted">タグ別</span>
            </h3>
            <div className="mt-3">
              <Donut
                rows={byMoney.map((r) => ({
                  id: r.id,
                  name: r.name,
                  color: r.color,
                  value: r.yen,
                }))}
                total={totalYen}
                format={formatYen}
                centerLabel="合計"
              />
            </div>
          </Card>
        </>
      )}

      {/* 集計範囲を明示しておく */}
      <p className="px-1 text-[11.5px] text-muted">
        {new Date(from).toLocaleDateString('ja-JP')} 〜{' '}
        {new Date(Math.min(to - 1, Date.now())).toLocaleDateString('ja-JP')} の記録
      </p>
    </div>
  )
}
