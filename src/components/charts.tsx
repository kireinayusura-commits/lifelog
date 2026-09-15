/**
 * グラフは SVG やライブラリを使わず、CSS だけで描いている。
 * オフラインで使う PWA なので、グラフのためにバンドルを倍にしたくない。
 * 棒グラフしか要らないなら、この方が軽く、画面幅にも素直に追従する。
 */

/** 日別の縦棒。時間と支出は単位が違うので、同じ軸に重ねず別々のグラフにして日付だけ揃える。 */
export function DayBars({
  values,
  color,
  selected,
  onSelect,
  height = 92,
  label,
  format,
  dayLabels,
  maxWidth,
}: {
  values: number[]
  color: string
  selected: number | null
  onSelect: (i: number | null) => void
  height?: number
  label: string
  format: (v: number) => string
  dayLabels: string[]
  /** 本数が少ないときに帯のように太くならないよう、行全体の幅を絞る */
  maxWidth?: number
}) {
  const max = Math.max(...values, 1)
  const empty = values.every((v) => v === 0)
  const maxLabel = format(max)

  // 本数に応じて隙間と太さを変える。本数が多いときに固定の隙間のままだと、
  // 隙間の合計だけで画面幅を超えてしまう。
  // 逆に本数が少ないときは、太さに上限を置かないとただの帯になる。
  const gap = values.length > 60 ? 1 : 2

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-wider" style={{ color }}>
          {label}
        </span>
        <span className="tnum text-[11px] text-muted">{empty ? '記録なし' : `最大 ${maxLabel}`}</span>
      </div>

      <div
        className="relative flex items-end border-b border-rule"
        style={{ height, gap, maxWidth }}
        role="img"
        aria-label={`${label}の日別グラフ`}
      >
        {/* 目盛りは1本だけ。線を増やすとデータより目立つ */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-rulesoft" />

        {values.map((v, i) => {
          const on = selected === i
          const h = empty ? 0 : (v / max) * 100
          return (
            <button
              key={i}
              onClick={() => onSelect(on ? null : i)}
              aria-label={`${dayLabels[i] ?? i + 1}: ${v === 0 ? 'なし' : format(v)}`}
              className="group relative flex h-full flex-1 items-end"
              style={{ minWidth: 0 }}
            >
              {/* 当たり判定を棒より広く取る */}
              <span className="absolute inset-x-[-2px] inset-y-0" />
              {v > 0 ? (
                <span
                  className="w-full rounded-t-[4px] transition-opacity"
                  style={{
                    height: `${Math.max(h, 3)}%`,
                    background: color,
                    opacity: selected === null || on ? 1 : 0.35,
                  }}
                />
              ) : (
                <span className="h-[2px] w-full rounded-full bg-rulesoft" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** タグ別の横棒。色は装飾で、識別はタグ名が担う。 */
export function TagBars({
  rows,
  total,
  format,
}: {
  rows: { id: string; name: string; color: string; value: number }[]
  total: number
  format: (v: number) => string
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-[12.5px] text-muted">
        この期間の記録はありません
      </div>
    )
  }
  const max = Math.max(...rows.map((r) => r.value), 1)

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <div key={r.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium">{r.name}</span>
            <span className="tnum shrink-0 text-[13px] font-semibold">
              {format(r.value)}
              <span className="ml-1.5 text-[11px] font-normal text-muted">
                {Math.round((r.value / total) * 100)}%
              </span>
            </span>
          </div>
          <div className="h-[7px] w-full overflow-hidden rounded-full bg-rulesoft">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: r.color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * 円グラフ（ドーナツ）。全体に対する割合を一目で掴むためのもので、
 * 近い値どうしの比較には向かないので、凡例に実数を必ず併記する。
 * 区分は6つまでで、それ以降は「その他」にまとめる。
 */
export function Donut({
  rows,
  total,
  format,
  centerLabel,
}: {
  rows: { id: string; name: string; color: string; value: number }[]
  total: number
  format: (v: number) => string
  centerLabel: string
}) {
  if (rows.length === 0 || total <= 0) {
    return (
      <div className="rounded-xl border border-dashed border-rule px-4 py-6 text-center text-[12.5px] text-muted">
        この期間の記録はありません
      </div>
    )
  }

  const R = 46
  const W = 17
  const C = 2 * Math.PI * R
  const GAP = rows.length > 1 ? 3 : 0 // 区分どうしの隙間。境界を線で囲まない

  let offset = 0
  const arcs = rows.map((r) => {
    const len = Math.max((r.value / total) * C - GAP, 0.5)
    const a = { ...r, len, offset }
    offset += (r.value / total) * C
    return a
  })

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-5">
      <svg viewBox="0 0 120 120" className="h-[136px] w-[136px] shrink-0" role="img"
        aria-label={`${centerLabel}のタグ別割合`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--c-rule-soft)" strokeWidth={W} />
        {arcs.map((a) => (
          <circle
            key={a.id}
            cx="60"
            cy="60"
            r={R}
            fill="none"
            stroke={a.color}
            strokeWidth={W}
            strokeDasharray={`${a.len} ${C - a.len}`}
            strokeDashoffset={-a.offset}
            transform="rotate(-90 60 60)"
          />
        ))}
        <text
          x="60"
          y="57"
          textAnchor="middle"
          className="fill-[var(--c-muted)]"
          style={{ fontSize: 9, fontWeight: 600 }}
        >
          {centerLabel}
        </text>
        <text
          x="60"
          y="72"
          textAnchor="middle"
          className="fill-[var(--c-ink)]"
          style={{ fontSize: 13, fontWeight: 700 }}
        >
          {format(total)}
        </text>
      </svg>

      <ul className="w-full min-w-0 flex-1 flex-col gap-1.5">
        {rows.map((r) => (
          <li key={r.id} className="flex items-baseline gap-2 py-[3px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 translate-y-[1px] rounded-full"
              style={{ background: r.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[13px]">{r.name}</span>
            <span className="tnum shrink-0 text-[13px] font-semibold">{format(r.value)}</span>
            <span className="tnum w-9 shrink-0 text-right text-[11.5px] text-muted">
              {Math.round((r.value / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 24時間の活動分布。1日の輪の上に、その時間帯の活動量を外向きの棒で出す。 */
export function DayClock({
  hours,
  color,
  format,
}: {
  hours: number[]
  color: string
  format: (v: number) => string
}) {
  const max = Math.max(...hours)
  const empty = max <= 0

  // 時刻ラベルは輪の外側に出るので、viewBox には輪の直径ではなく
  // ラベルまで収まる大きさを取る。ここを詰めると 0 / 6 / 12 / 18 が切れる。
  const SIZE = 192
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R0 = 34
  const R1 = 74
  const R_LABEL = R1 + 14

  const peak = hours.indexOf(max)
  const top = hours
    .map((v, h) => ({ v, h }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
    .slice(0, 3)

  const point = (h: number, r: number) => {
    const a = ((h * 15 - 90) * Math.PI) / 180
    return [CX + r * Math.cos(a), CY + r * Math.sin(a)]
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="h-[196px] w-[196px] max-w-full"
        role="img"
        aria-label="24時間の活動分布"
      >
        {/* 目盛りの輪 */}
        <circle cx={CX} cy={CY} r={R0 - 4} fill="none" stroke="var(--c-rule-soft)" strokeWidth="1" />
        <circle cx={CX} cy={CY} r={R1 + 3} fill="none" stroke="var(--c-rule-soft)" strokeWidth="1" />

        {hours.map((v, h) => {
          const [x0, y0] = point(h, R0)
          const len = empty ? 0 : (v / max) * (R1 - R0)
          const [x1, y1] = point(h, R0 + Math.max(len, v > 0 ? 3 : 0))
          return v > 0 ? (
            <line
              key={h}
              x1={x0}
              y1={y0}
              x2={x1}
              y2={y1}
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
            />
          ) : (
            <circle key={h} cx={x0} cy={y0} r="1.5" fill="var(--c-rule)" />
          )
        })}

        {/* 0 / 6 / 12 / 18 だけ数字を出す */}
        {[0, 6, 12, 18].map((h) => {
          const [x, y] = point(h, R_LABEL)
          return (
            <text
              key={h}
              x={x}
              y={y + 3.5}
              textAnchor="middle"
              className="fill-[var(--c-muted)]"
              style={{ fontSize: 10, fontWeight: 600 }}
            >
              {h}
            </text>
          )
        })}

        {!empty && (
          <>
            <text
              x={CX}
              y={CY - 3}
              textAnchor="middle"
              className="fill-[var(--c-muted)]"
              style={{ fontSize: 9, fontWeight: 600 }}
            >
              最も多い
            </text>
            <text
              x={CX}
              y={CY + 12}
              textAnchor="middle"
              className="fill-[var(--c-ink)]"
              style={{ fontSize: 14, fontWeight: 700 }}
            >
              {peak}時台
            </text>
          </>
        )}
      </svg>

      {empty ? (
        <p className="text-[12.5px] text-muted">この期間の記録はありません</p>
      ) : (
        <ul className="tnum flex flex-wrap justify-center gap-x-4 gap-y-1 text-[12px] text-muted">
          {top.map((x) => (
            <li key={x.h}>
              <span className="font-semibold text-ink">{x.h}時台</span> {format(x.v)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 数字そのものが答えになる場面では、棒1本のグラフより数字を大きく出す。 */
export function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string
  value: string
  sub?: string
  color: string
}) {
  return (
    <div className="rounded-xl border border-rule bg-surface px-3.5 py-3">
      <div className="text-[11px] font-semibold tracking-wider" style={{ color }}>
        {label}
      </div>
      <div className="mt-0.5 text-[23px] font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  )
}
