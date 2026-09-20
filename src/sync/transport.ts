import { supabase } from './client'
import type { PushRow, SyncTransport } from './engine'
import type { RemoteRecord } from './merge'

const PAGE = 500

/** 実際の Supabase につなぐ経路。 */
export function supabaseTransport(userId: string): SyncTransport {
  return {
    async pull(cursor) {
      const out: RemoteRecord[] = []
      let from = cursor

      // 一度に全部取ると大きくなりすぎるので、古い順に区切って取る
      for (;;) {
        let q = supabase()
          .from('records')
          .select('kind,id,data,updated_at,deleted_at,server_updated_at')
          .eq('user_id', userId)
          .order('server_updated_at', { ascending: true })
          .limit(PAGE)

        if (from) q = q.gt('server_updated_at', from)

        const { data, error } = await q
        if (error) throw new Error(error.message)
        if (!data || data.length === 0) break

        out.push(...(data as RemoteRecord[]))
        from = (data[data.length - 1] as RemoteRecord).server_updated_at
        if (data.length < PAGE) break
      }
      return out
    },

    async push(rows: PushRow[]) {
      for (let i = 0; i < rows.length; i += PAGE) {
        const chunk = rows.slice(i, i + PAGE).map((r) => ({ ...r, user_id: userId }))
        const { error } = await supabase()
          .from('records')
          .upsert(chunk, { onConflict: 'user_id,kind,id' })
        if (error) throw new Error(error.message)
      }
    },
  }
}
