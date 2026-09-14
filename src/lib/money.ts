/** 1280 → ¥1,280 */
export function formatYen(amount: number): string {
  return `¥${Math.round(amount).toLocaleString('ja-JP')}`
}

/** 桁区切りだけ。テンキー入力中の表示に使う。 */
export function groupDigits(amount: number): string {
  return Math.round(amount).toLocaleString('ja-JP')
}

export const MAX_AMOUNT_DIGITS = 9
