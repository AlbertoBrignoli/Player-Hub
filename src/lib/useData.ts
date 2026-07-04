import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export function useCollection<T = any>(
  table: string,
  opts: { orderBy?: string; ascending?: boolean; select?: string } = {}
) {
  const [rows, setRows] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    let q = supabase.from(table).select(opts.select || '*')
    if (opts.orderBy) q = q.order(opts.orderBy, { ascending: opts.ascending ?? false })
    const { data, error } = await q
    if (error) setError(error.message)
    else { setRows((data as T[]) || []); setError(null) }
    setLoading(false)
  }, [table, opts.orderBy, opts.ascending, opts.select])

  useEffect(() => { reload() }, [reload])
  return { rows, loading, error, reload, setRows }
}

export async function insertRow(table: string, values: any) {
  return supabase.from(table).insert(values).select().single()
}
export async function updateRow(table: string, id: string, values: any) {
  return supabase.from(table).update(values).eq('id', id).select().single()
}
export async function deleteRow(table: string, id: string) {
  return supabase.from(table).delete().eq('id', id)
}
