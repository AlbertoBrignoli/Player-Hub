// Menu del nutrizionista: pasti e integratori che ha già usato o preparato.
// Si carica con una base pronta la prima volta; ogni indicazione salvata su un impegno
// la arricchisce da sola (lato DB, crm_set_event_nutrition).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type LibItem = {
  id: string
  kind: 'pasto' | 'integratore'
  name: string
  category: string | null
  details: string | null
  dose: string | null
  timing: string | null
  usage_count: number
  last_used_at: string | null
}

export const MEAL_CATS: { key: string; label: string }[] = [
  { key: 'colazione', label: 'Colazione' },
  { key: 'pranzo', label: 'Pranzo' },
  { key: 'cena', label: 'Cena' },
  { key: 'spuntino', label: 'Spuntino' },
  { key: 'pre-gara', label: 'Pre-gara' },
  { key: 'post-gara', label: 'Post-gara' },
]
export const SUP_CATS: { key: string; label: string }[] = [
  { key: 'recupero', label: 'Recupero' },
  { key: 'energia', label: 'Energia' },
  { key: 'idratazione', label: 'Idratazione' },
  { key: 'performance', label: 'Performance' },
  { key: 'salute', label: 'Salute' },
  { key: 'articolazioni', label: 'Articolazioni' },
  { key: 'sonno', label: 'Sonno' },
  { key: 'altro', label: 'Altro' },
]
export const SUP_WHEN = ['Prima', 'Durante', 'Dopo', 'Al risveglio', 'Ai pasti', 'Prima di dormire']

// stessa regola del DB (crm_meal_category): dal nome dell'impegno alla categoria di pasto
export function mealCategoryOf(title: string, type?: string): string | null {
  const t = title.toLowerCase()
  if (/colazion|breakfast/.test(t)) return 'colazione'
  if (/pranzo|lunch/.test(t)) return 'pranzo'
  if (/cena|dinner/.test(t)) return 'cena'
  if (/spuntin|snack|merend/.test(t)) return 'spuntino'
  if (type === 'partita' || /partita|gara|match/.test(t)) return 'pre-gara'
  if (type === 'allenamento') return 'spuntino'
  return null
}

// più usati prima, poi in ordine alfabetico
const byUse = (a: LibItem, b: LibItem) => (b.usage_count - a.usage_count) || a.name.localeCompare(b.name, 'it')

export function useNutriLibrary() {
  const [items, setItems] = useState<LibItem[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    const q = () => supabase.from('crm_nutri_library').select('*')
    let { data } = await q()
    if (!data || data.length === 0) {
      // primo accesso: base di pasti e integratori già pronta
      const { data: n } = await supabase.rpc('crm_nutri_library_seed')
      if (n) ({ data } = await q())
    }
    setItems(((data as LibItem[]) || []).sort(byUse))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  return { items, loading, reload: load, setItems }
}
