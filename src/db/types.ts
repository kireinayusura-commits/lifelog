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

/**
 * タグの用途。グループ単位で決める。
 * これで、タイマーに「ゲーム課金」が出てきたり、
 * 支出登録に「英語」が出てきたりするのを防ぐ。
 */
export type TagScope = 'both' | 'time' | 'money'

export const SCOPE_LABEL: Record<TagScope, string> = {
  both: '両方',
  time: '時間だけ',
  money: 'お金だけ',
}

/** ユーザーが自由に作る分類の器。「勉強」「趣味」などのプリセットは持たない。 */
export interface Group extends Base {
  name: string
  color: string
  order: number
  /** このグループのタグをどこで出すか。グループに属さないタグは常に「両方」。 */
  scope: TagScope
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
  /** 固定費から自動で作られた支出なら、その固定費のID */
  recurringId: Id | null
}

/**
 * 毎月の固定支出（サブスク・家賃・定期代など）。
 *
 * これ自体は「毎月いくら出ていくか」の設定でしかなく、
 * 実際の支出は支払日を過ぎたときに transactions へ自動で計上される。
 * 計上済みの支出には `rec-{固定費ID}-{年月}` という決まったIDを付けるので、
 * 同じ月に二重計上されることがない。
 */
export interface Recurring extends Base {
  name: string
  amount: number
  tagId: Id | null
  /** 毎月の支払日（1〜31）。31日が無い月は月末に丸める。 */
  dayOfMonth: number
  active: boolean
  /** 計上を始める月（YYYY-MM）。これより前には遡らない。 */
  startMonth: string
}

export interface Settings {
  id: 'settings'
  weekStart: 0 | 1
  monthlyBudget: number | null
  lastBackupAt: number | null
  longRunWarnHours: number
  /** 記録の表示を秒まで出すか。計測自体は常に秒単位で行われる。 */
  showSeconds: boolean
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
  /** どの端末で始めたか。他の端末では「iPhoneで計測中」と出すために使う。 */
  deviceId: string
  deviceName: string
  createdAt: number
  updatedAt: number
  /**
   * 停止しても行は消さず、ここに時刻を入れる。
   * 行を消してしまうと「停止した」という事実が他の端末に伝わらず、
   * 止めたはずのタイマーが復活してしまうため。
   */
  deletedAt: number | null
}

/** 同期の進み具合。この端末だけのもので、同期の対象にはしない。 */
export interface SyncState {
  id: 'sync'
  /** 前回どこまで取得したか（サーバー側の時刻） */
  cursor: string | null
  /** 前回どこまで送ったか（この端末の時刻） */
  pushedAt: number
  userId: string | null
  email: string | null
  lastSyncAt: number | null
  lastError: string | null
}

/**
 * タグの色。並び順のまま順番に割り当てられる。
 *
 * 隣り合う色が色覚特性（P型・D型・T型）でも区別できることを検証済み。
 * ライト面・ダーク面の両方で、明度帯・彩度の下限・隣接色の分離・
 * 地との contrast をすべて通している。順番自体が検証結果なので、
 * 色を足したり並べ替えたりするときは再検証すること。
 *
 * 保証しているのは「並びが隣どうしの色は見分けられる」ことまで。
 * 12色もあれば、離れた位置の色どうしには似た組み合わせも出てくる
 * （赤と橙など）。このアプリでは色の隣に必ずタグ名が出るので、
 * 色だけで見分ける必要がない作りにしてある。
 */
export const TAG_COLORS = [
  '#3355D1', // 青
  '#C55A14', // 橙
  '#0D8FA3', // 青緑
  '#B83A3A', // 赤
  '#8049D8', // 紫
  '#57991B', // 緑
  '#E2559E', // 桃
  '#0E7F63', // 深緑
  '#1D74C0', // 藍
  '#8A8A12', // 若草
  '#BB349D', // 赤紫
  '#A35E12', // 琥珀
] as const
