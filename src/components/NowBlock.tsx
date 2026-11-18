import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { alive } from '../db/repo'
import type { Block, Id } from '../db/types'
import { Button, Card, Dot } from './ui'
import { useTags } from './TagPicker'
import { currentBlock, dateKey, formatLen, formatMin, nextBlock } from '../schedule/logic'

/**
 * タイマー画面の上に出す「いま何の時間か」。
 *
 * 予定を立てても、計測のたびにタグを選び直すのでは手間が減らない。
 * 置いた予定から直接始められるようにして、そこをつなぐ。
 *
 * なお、予定から外れても何も言わない。
 * 予定どおりに動けなかったことを責める作りにはしない。
 */
export function NowBlock({
  running,
  onStart,
}: {
  running: boolean
  onStart: (tagId: Id | null) => void
}) {
  const [now, setNow] = useState(() => new Date())
  const tags = useTags()
  const today = dateKey(now)

  const blocks = useLiveQuery(
    async () => alive(await db.blocks.where('date').equals(today).toArray()),
    [today],
    undefined,
  )

  // 分が変われば表示も変える。秒単位で動かす必要はない。
  useEffect(() => {
    const tick = () => setNow(new Date())
    const iv = window.setInterval(tick, 20_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(iv)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!blocks || blocks.length === 0) return null

  const nowMin = now.getHours() * 60 + now.getMinutes()
  const cur: Block | null = currentBlock(blocks, nowMin)
  const next: Block | null = cur ? null : nextBlock(blocks, nowMin)
  const target = cur ?? next
  if (!target) return null

  const tag = tags.find((t) => t.id === target.tagId)
  const endMin = target.startMin + target.durationMin
  const left = cur ? endMin - nowMin : target.startMin - nowMin

  return (
    <Card className="mb-3 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold tracking-wider text-muted">
            {cur ? 'いまの予定' : '次の予定'}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {tag && <Dot color={tag.color} />}
            <span className="truncate text-[15px] font-bold">{target.title}</span>
          </div>
          <div className="mt-0.5 text-[12px] text-muted">
            {cur
              ? `${formatMin(endMin)} まで（のこり ${formatLen(Math.max(0, left))}）`
              : `${formatMin(target.startMin)} から（あと ${formatLen(Math.max(0, left))}）`}
          </div>
        </div>

        {target.kind === 'study' && !running && (
          <Button variant="primary" onClick={() => onStart(target.tagId)}>
            これを始める
          </Button>
        )}
      </div>
    </Card>
  )
}
