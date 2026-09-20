import Dexie, { type Table } from 'dexie'
import { useLiveQuery } from 'dexie-react-hooks'
import type {
  ActiveTimer,
  Group,
  Recurring,
  Session,
  Settings,
  SyncState,
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
  syncState!: Table<SyncState, string>
  /** サーバーに入っていると分かっている版。同期の対象にはしない。 */
  pushed!: Table<{ key: string; updatedAt: number }, string>

  /** name を変えると別のデータベースになる。2台の端末を模したテストで使う。 */
  constructor(name = 'lifelog') {
    super(name)

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

    // version(5) — 同期の準備。
    //
    // 計測中のタイマーを他の端末にも見せるため、activeTimer を
    // 「行を消す」方式から「deletedAt に時刻を入れる」方式に変える。
    // 行を消すと「止めた」という事実が他の端末に伝わらず、
    // 止めたはずのタイマーが復活してしまう。
    this.version(5)
      .stores({ syncState: 'id', pushed: 'key' })
      .upgrade(async (tx) => {
        const now = Date.now()
        await tx
          .table('activeTimer')
          .toCollection()
          .modify((t) => {
            if (t.deletedAt === undefined) t.deletedAt = null
            if (!t.createdAt) t.createdAt = t.updatedAt ?? now
            if (!t.deviceId) t.deviceId = 'legacy'
            if (!t.deviceName) t.deviceName = 'この端末'
          })
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
