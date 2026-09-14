export type Id = string

/**
 * 全レコード共通のフィールド。
 * Phase 3 でクラウド同期を足すときに作り直さなくて済むよう、
 * 最初から UUID・更新時刻・論理削除（tombstone）を持たせている。
 * 削除は物理削除せず deletedAt に時刻を入れる。
 */
export interface Base {
  id: Id
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

/** ユーザーが自由に作る分類の器。「勉強」「趣味」などのプリセットは持たない。 */
export interface Group extends Base {
  name: string
  color: string
  order: number
}

/** 統合の背骨。時間の記録にも支出にも、同じタグを付けられる。 */
export interface Tag extends Base {
  name: string
  groupId: Id | null
  color: string
  archived: boolean
  order: number
}

/** 時間の記録。勉強に限定しない。 */
export interface Session extends Base {
  tagId: Id | null
  startedAt: number
  endedAt: number
  durationSec: number
  memo: string
  source: 'timer' | 'manual'
}

/**
 * 支出。カテゴリは持たせず、名称・金額・タグの3つだけで扱う。
 * レジの前で開いたときに入力が1ステップでも増えると続かないため、
 * 分類は時間の記録と共通のタグに任せる。
 */
export interface Transaction extends Base {
  amount: number
  type: 'expense' | 'income'
  tagId: Id | null
  name: string
  /** 発生時刻。時間の記録と同じ絶対時刻で持ち、統合タイムラインで並べられるようにする。 */
  occurredAt: number
}

export interface Settings {
  id: 'settings'
  weekStart: 0 | 1
  monthlyBudget: number | null
  lastBackupAt: number | null
  longRunWarnHours: number
  updatedAt: number
}

/**
 * 計測中のタイマー。単一レコード。
 *
 * ここが実装の肝。経過秒数を数えて保存することは一切しない。
 * 保存するのは「いつ始まったか」という絶対時刻だけで、
 * 経過時間は表示のたびに Date.now() との差分で算出する。
 * そのため画面を消しても、アプリを閉じても、端末を再起動しても
 * 計測は途切れない。
 */
export interface ActiveTimer {
  id: 'active'
  tagId: Id | null
  /** 計測全体の開始時刻。保存される記録の startedAt になる。 */
  originStartedAt: number
  /** いま動いている区間の開始時刻。再開のたびに更新される。 */
  segmentStartedAt: number
  /** 一時停止で確定した区間の合計（ミリ秒） */
  accumulatedMs: number
  isPaused: boolean
  memo: string
  updatedAt: number
}

export const TAG_COLORS = [
  '#2F4BC4',
  '#1F7A6B',
  '#A85328',
  '#7B3FA0',
  '#2F7D5B',
  '#B03A5B',
  '#4A6572',
  '#8A6D1F',
] as const
