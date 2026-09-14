import { db, getSettings, saveSettings } from './db'

const FORMAT = 'lifelog-backup'
const FORMAT_VERSION = 1

export interface Backup {
  format: typeof FORMAT
  version: number
  exportedAt: number
  data: Record<string, unknown[]>
}

/**
 * iOS の Safari は、一定期間使われていないサイトのストレージを破棄することがある。
 * ホーム画面に追加していれば基本的に保護されるが、それに頼り切らないために
 * 手動バックアップを最初から用意しておく。
 */
export async function exportBackup(): Promise<Backup> {
  const [groups, tags, sessions, transactions, settings] = await Promise.all([
    db.groups.toArray(),
    db.tags.toArray(),
    db.sessions.toArray(),
    db.transactions.toArray(),
    getSettings(),
  ])
  return {
    format: FORMAT,
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    data: { groups, tags, sessions, transactions, settings: [settings] },
  }
}

export async function downloadBackup(): Promise<void> {
  const backup = await exportBackup()
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const name = `lifelog-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  await saveSettings({ lastBackupAt: Date.now() })
}

export interface ImportResult {
  added: number
  updated: number
  skipped: number
}

/**
 * 取り込みは「同じ id なら updatedAt が新しい方を残す」方式。
 * 全消ししてから入れ直さないので、複数端末のバックアップを順に読ませても壊れない。
 * Phase 3 のクラウド同期も同じ規則にするため、ここで先に実装してある。
 */
export async function importBackup(json: unknown): Promise<ImportResult> {
  const b = json as Backup
  if (!b || b.format !== FORMAT) throw new Error('このファイルはバックアップ形式ではありません')
  if (b.version > FORMAT_VERSION) throw new Error('新しいバージョンのバックアップです。アプリを更新してください')

  const result: ImportResult = { added: 0, updated: 0, skipped: 0 }

  const tables = [
    ['groups', db.groups],
    ['tags', db.tags],
    ['sessions', db.sessions],
    ['transactions', db.transactions],
  ] as const

  for (const [key, table] of tables) {
    const rows = (b.data[key] ?? []) as { id: string; updatedAt: number }[]
    for (const row of rows) {
      const existing = await table.get(row.id)
      if (!existing) {
        await table.add(row as never)
        result.added++
      } else if (row.updatedAt > existing.updatedAt) {
        await table.put(row as never)
        result.updated++
      } else {
        result.skipped++
      }
    }
  }

  const s = (b.data.settings ?? [])[0] as Record<string, unknown> | undefined
  if (s) {
    const current = await getSettings()
    if ((s.updatedAt as number) > current.updatedAt) await saveSettings(s)
  }
  return result
}

export async function readBackupFile(file: File): Promise<ImportResult> {
  const text = await file.text()
  return importBackup(JSON.parse(text))
}
