/**
 * この端末を表す識別子。
 * 同期の対象にはしない（端末ごとに違う値でなければ意味がない）。
 */

const ID_KEY = 'kirimori.deviceId'
const NAME_KEY = 'kirimori.deviceName'

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/** 端末の見た目の名前。「iPhoneで計測中」のように出すためのもの。 */
function guessName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  if (/iPad/.test(ua)) return 'iPad'
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/Android/.test(ua)) return 'Android'
  if (/Macintosh/.test(ua)) {
    // iPadOS は Macintosh を名乗ることがあるので、タッチの有無で見分ける
    const touch = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1
    return touch ? 'iPad' : 'Mac'
  }
  if (/Windows/.test(ua)) return 'Windows'
  return 'この端末'
}

let cachedId: string | null = null
let cachedName: string | null = null

export function deviceId(): string {
  if (cachedId) return cachedId
  try {
    const stored = localStorage.getItem(ID_KEY)
    if (stored) return (cachedId = stored)
    const fresh = uuid()
    localStorage.setItem(ID_KEY, fresh)
    return (cachedId = fresh)
  } catch {
    // プライベートブラウズなどで保存できない場合。
    // このセッションの間だけ有効な値で動かす。
    return (cachedId = uuid())
  }
}

export function deviceName(): string {
  if (cachedName) return cachedName
  try {
    const stored = localStorage.getItem(NAME_KEY)
    if (stored) return (cachedName = stored)
    const fresh = guessName()
    localStorage.setItem(NAME_KEY, fresh)
    return (cachedName = fresh)
  } catch {
    return (cachedName = guessName())
  }
}

export function setDeviceName(name: string): void {
  cachedName = name.trim() || guessName()
  try {
    localStorage.setItem(NAME_KEY, cachedName)
  } catch {
    /* 保存できなくても動作には影響しない */
  }
}
