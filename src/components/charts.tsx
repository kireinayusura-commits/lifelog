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
}: {
  values: number[]
  color: string
  selected: number | null
  onSelect: (i: number | null) => void
  height?: number
  label: string
  format: (v: number) => string
  dayLabels: string[]
}) {
  const max = Math.max(...values, 1)
  const empty = values.every((v) => v === 0)
  const maxLabel = format(max)

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold tracking-wider" style={{ color }}>
          {label}
        </span>
        <span className="tnum text-[11px] text-muted">{empty ? '記録なし' : `最大 ${maxLabel}`}</span>
      </div>

      <div
        className="relative flex items-end gap-[2px] border-b border-rule"
        style={{ height }}
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
              style={{ minWidth: 4 }}
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
