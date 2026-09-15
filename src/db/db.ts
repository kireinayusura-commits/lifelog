import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type {
  ActiveTimer,
  Group,
  Recurring,
  Session,
  Settings,
  Tag,
  Transaction,
} from './types'

export class LifeLogDB extends Dexie {
  groups!: Table<Group, string>
  tags!: Table<Tag, string>
  sessions!: Table<Session, string>
  transactions!: Table<Transaction, string>
  recurring!: Table<Recurring, string>
  settings!: Table<Settings, string>
  activeTimer!: Table<ActiveTimer, string>

  constructor() {
    super('lifelog')

    // version(1) — 時間の記録まで
    this.version(1).stores({
      groups: 'id, order, updatedAt, deletedAt',
      tags: 'id, groupId, order, updatedAt, deletedAt',
      sessions: 'id, tagId, startedAt, updatedAt, deletedAt',
      categories: 'id, updatedAt, deletedAt',
      transactions: 'id, date, tagId, categoryId, updatedAt, deletedAt',
      settings: 'id',
      activeTimer: 'id',
    })

    // version(2) — 支出を 名称・金額・タグ に整理。
    // カテゴリは使わないことにしたので categories を削除し（null を指定すると消える）、
    // 支出は時間の記録と同じ絶対時刻で並べられるよう occurredAt で索引する。
    // 変更したストアだけ書けばよく、他はそのまま引き継がれる。
    // 既にアプリを入れている端末でも、次に開いたときに自動で移行される。
    this.version(2).stores({
      transactions: 'id, occurredAt, tagId, updatedAt, deletedAt',
      categories: null,
    })

    // version(3) — 毎月の固定支出
    this.version(3).stores({
      recurring: 'id, active, updatedAt, deletedAt',
      transactions: 'id, occurredAt, tagId, recurringId, updatedAt, deletedAt',
    })

    // version(4) — タググループに用途を持たせる。
    // 索引は変えないので stores は触らず、既存のグループに「両方」を入れるだけ。
    this.version(4).upgrade((tx) =>
      tx
        .table('groups')
        .toCollection()
        .modify((g) => {
          if (!g.scope) g.scope = 'both'
        }),
    )
  }
}

export const db = new LifeLogDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  weekStart: 1,
  monthlyBudget: null,
  lastBackupAt: null,
  longRunWarnHours: 8,
  showSeconds: true,
  updatedAt: 0,
}

/**
 * 記録の表示に秒を含めるか。未設定なら含める。
 * 「1分30秒の記録が『1分』と表示される」のを避けるため、既定は有効。
 */
export function useShowSeconds(): boolean {
  const s = useLiveQuery(() => db.settings.get('settings'), [], undefined)
  return s?.showSeconds ?? true
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return s ?? DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings', updatedAt: Date.now() })
}
