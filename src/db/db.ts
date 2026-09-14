import Dexie, { type Table } from 'dexie'
import type {
  ActiveTimer,
  Category,
  Group,
  Session,
  Settings,
  Tag,
  Transaction,
} from './types'

export class LifeLogDB extends Dexie {
  groups!: Table<Group, string>
  tags!: Table<Tag, string>
  sessions!: Table<Session, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  settings!: Table<Settings, string>
  activeTimer!: Table<ActiveTimer, string>

  constructor() {
    super('lifelog')
    // スキーマを変えるときは version を上げて upgrade() を足す。
    // 既存ユーザーのデータを消さずに移行できる。
    this.version(1).stores({
      groups: 'id, order, updatedAt, deletedAt',
      tags: 'id, groupId, order, updatedAt, deletedAt',
      sessions: 'id, tagId, startedAt, updatedAt, deletedAt',
      categories: 'id, updatedAt, deletedAt',
      transactions: 'id, date, tagId, categoryId, updatedAt, deletedAt',
      settings: 'id',
      activeTimer: 'id',
    })
  }
}

export const db = new LifeLogDB()

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  weekStart: 1,
  monthlyBudget: null,
  lastBackupAt: null,
  longRunWarnHours: 8,
  updatedAt: 0,
}

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('settings')
  return s ?? DEFAULT_SETTINGS
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...patch, id: 'settings', updatedAt: Date.now() })
}
