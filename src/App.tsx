import { useEffect, useState } from 'react'
import { seedIfEmpty } from './db/repo'
import { TimerScreen } from './screens/TimerScreen'
import { RecordsScreen } from './screens/RecordsScreen'
import { TagsScreen } from './screens/TagsScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { useTimer } from './timer/useTimer'
import { formatClock } from './lib/time'

type TabId = 'timer' | 'records' | 'tags' | 'settings'

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
  { id: 'records', label: '記録' },
  { id: 'tags', label: 'タグ' },
  { id: 'settings', label: '設定' },
]

export default function App() {
  const [tab, setTab] = useState<TabId>('timer')
  const { active, running, elapsedMs } = useTimer()

  useEffect(() => {
    seedIfEmpty()
  }, [])

  return (
    <div className="min-h-dvh bg-paper">
      <main className="mx-auto max-w-lg">
        {tab === 'timer' && <TimerScreen />}
        {tab === 'records' && <RecordsScreen />}
        {tab === 'tags' && <TagsScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {/* 計測中は、どの画面にいても状態が分かるようにする */}
      {active && tab !== 'timer' && (
        <button
          onClick={() => setTab('timer')}
          className="safe-bottom fixed inset-x-0 bottom-16 z-30 mx-auto flex max-w-lg items-center justify-center gap-2 px-4"
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

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface/95 backdrop-blur">
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
