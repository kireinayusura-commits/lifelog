import { useEffect, useState } from 'react'
import { materializeRecurring, seedIfEmpty } from './db/repo'
import { TimerScreen } from './screens/TimerScreen'
import { ExpenseScreen } from './screens/ExpenseScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { TagsScreen } from './screens/TagsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useTimer } from './timer/useTimer'
import { formatClock } from './lib/time'

type TabId = 'timer' | 'expense' | 'records' | 'tags' | 'settings'

function Icon({ id, active }: { id: TabId; active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2.1 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      {id === 'timer' && (
        <>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2M9 2h6" />
        </>
      )}
      {id === 'expense' && (
        <>
          <rect x="2.8" y="6" width="18.4" height="12.5" rx="2.2" />
          <path d="M9.6 12.3h4.8M12 10v5.2M10.2 10.1 12 12m1.8-1.9L12 12" />
        </>
      )}
      {id === 'records' && <path d="M5 4h14v16H5zM8.5 9h7M8.5 13h7M8.5 17h4" />}
      {id === 'tags' && (
        <>
          <path d="M3.5 11.2V4.5a1 1 0 0 1 1-1h6.7a1 1 0 0 1 .7.3l8.3 8.3a1 1 0 0 1 0 1.4l-6.7 6.7a1 1 0 0 1-1.4 0L3.8 11.9a1 1 0 0 1-.3-.7z" />
          <circle cx="7.8" cy="7.8" r="1.3" />
        </>
      )}
      {id === 'settings' && <path d="M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M7 15v4" />}
    </svg>
  )
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'timer', label: 'タイマー' },
  { id: 'expense', label: '支出' },
  { id: 'records', label: '記録' },
  { id: 'tags', label: 'タグ' },
  { id: 'settings', label: '設定' },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('timer')
  const { active, running, elapsedMs } = useTimer()

  useEffect(() => {
    seedIfEmpty()
    // 支払日を過ぎた固定費を計上する。何度呼ばれても二重にはならない。
    materializeRecurring()
  }, [])

  return (
    // 画面いっぱいの器。高さは固定で、この要素自体はスクロールしない。
    <div className="flex h-dvh flex-col overflow-hidden bg-paper">
      {/* スクロールするのはここだけ */}
      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto overscroll-contain">
        {tab === 'timer' && <TimerScreen />}
        {tab === 'expense' && <ExpenseScreen />}
        {tab === 'records' && <RecordsScreen />}
        {tab === 'tags' && <TagsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {/* 計測中は、どの画面にいても状態が分かるようにする */}
      {active && tab !== 'timer' && (
        <button
          onClick={() => setTab('timer')}
          className="mx-auto flex w-full max-w-lg shrink-0 items-center justify-center px-4 pb-2"
        >
          <span className="flex items-center gap-2 rounded-full bg-time px-4 py-2 text-[13px] font-semibold text-paper">
            <span
              className={`size-2 rounded-full bg-paper ${running ? 'animate-pulse' : 'opacity-50'}`}
              aria-hidden
            />
            <span className="tnum">{formatClock(elapsedMs)}</span>
            <span className="opacity-80">{running ? '計測中' : '一時停止中'}</span>
          </span>
        </button>
      )}

      {/* 器の一番下に置くだけ。貼り付けていないので、スクロールしても動かない */}
      <nav className="safe-bottom shrink-0 border-t border-rule bg-surface">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const on = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10.5px] font-semibold ${
                  on ? 'text-time' : 'text-muted'
                }`}
              >
                <Icon id={t.id} active={on} />
                {t.label}
              </button>
            )
          })}
        </div>
      </nav>
    </div>
  )
}
