import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, saveSettings } from '../db/db'
import { downloadBackup, readBackupFile } from '../db/backup'
import { Button, Card, Field, Screen, inputClass } from '../components/ui'

export function SettingsScreen() {
  const settings = useLiveQuery(() => db.settings.get('settings'), [], undefined)
  const fileRef = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const lastBackup = settings?.lastBackupAt
    ? new Date(settings.lastBackupAt).toLocaleDateString('ja-JP')
    : null

  const onImport = async (file: File | undefined) => {
    if (!file) return
    setErr(null)
    setMsg(null)
    try {
      const r = await readBackupFile(file)
      setMsg(`取り込みました（新規 ${r.added} / 更新 ${r.updated} / 変更なし ${r.skipped}）`)
    } catch (e) {
      setErr(e instanceof Error ? e.message : '取り込みに失敗しました')
    }
  }

  return (
    <Screen title="設定">
      <section>
        <h2 className="mb-2 px-1 text-[13px] font-bold">データのバックアップ</h2>
        <Card className="px-4 py-4">
          <p className="text-[13px] leading-relaxed text-ink2">
            記録はこの端末の中だけに保存されています。iOS ではしばらく使わないとブラウザが
            保存領域を消すことがあるため、ホーム画面に追加したうえで、ときどき書き出しておくと安全です。
          </p>
          {lastBackup && (
            <p className="mt-2 text-[12px] text-muted">前回の書き出し：{lastBackup}</p>
          )}
          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <Button variant="primary" onClick={() => downloadBackup()}>
              JSONで書き出す
            </Button>
            <Button onClick={() => fileRef.current?.click()}>ファイルから読み込む</Button>
            <input
              id="import-file"
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                onImport(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </div>
          {msg && <p className="mt-3 text-[12.5px] text-good">{msg}</p>}
          {err && <p className="mt-3 text-[12.5px] text-danger">{err}</p>}
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            読み込みは上書きではなく、同じ記録なら新しい方を残す方式です。別端末のファイルを
            続けて読み込んでも壊れません。
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[13px] font-bold">タイマー</h2>
        <Card className="px-4 py-4">
          <Field label="止め忘れを知らせるまでの時間">
            <div className="flex items-center gap-2">
              <input
                id="warn-hours"
                type="number"
                min={1}
                max={24}
                value={settings?.longRunWarnHours ?? 8}
                onChange={(e) =>
                  saveSettings({ longRunWarnHours: Math.min(24, Math.max(1, Number(e.target.value))) })
                }
                className={`${inputClass} w-24`}
              />
              <span className="text-[13px] text-muted">時間</span>
            </div>
          </Field>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            この時間を超えて計測が続いていると、終了時刻を手で直せる案内を出します。
          </p>
        </Card>
      </section>

      <section className="mt-6">
        <h2 className="mb-2 px-1 text-[13px] font-bold">このバージョンについて</h2>
        <Card className="px-4 py-4">
          <p className="text-[13px] leading-relaxed text-ink2">
            Phase 1 の途中です。時間の記録・タグ・バックアップまでが動きます。
            支出の記録と分析グラフはこの次に実装します。
          </p>
        </Card>
      </section>
    </Screen>
  )
}
