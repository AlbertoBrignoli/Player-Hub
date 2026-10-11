// Menu del nutrizionista: alimenti e integratori divisi per momento della giornata.
// Lo prepara una volta (a mano o caricando il suo file, letto dall'AI) e poi sul calendario
// dell'atleta sceglie da un menu a tendina. Quello che aggiunge a mano resta in memoria
// (lato DB, crm_set_event_nutrition).
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

export type LibItem = {
  id: string
  kind: 'cibo' | 'pasto' | 'integratore'
  name: string
  category: string | null   // momento della giornata (SLOTS)
  details: string | null    // alimento: quantità
  dose: string | null       // integratore: dose
  timing: string | null
  usage_count: number
  last_used_at: string | null
}

export const SLOTS: { key: string; label: string; food: boolean }[] = [
  { key: 'colazione', label: 'Colazione', food: true },
  { key: 'pranzo', label: 'Pranzo', food: true },
  { key: 'merenda', label: 'Merenda', food: true },
  { key: 'cena', label: 'Cena', food: true },
  { key: 'prima_di_dormire', label: 'Prima di dormire', food: true },
  { key: 'pre_allenamento', label: 'Pre allenamento / gara', food: true },
  { key: 'durante_allenamento', label: 'Durante allenamento', food: false },
  { key: 'post_allenamento', label: 'Post allenamento / gara', food: true },
]
export const FOOD_SLOTS = SLOTS.filter(s => s.food)
export const slotLabel = (k?: string | null) => SLOTS.find(s => s.key === k)?.label || 'Altro'
export const SUP_WHEN = ['Al risveglio', 'Ai pasti', 'Prima', 'Durante', 'Dopo', 'Prima di dormire']

// stessa regola del DB (crm_meal_category): dal nome/tipo dell'impegno al momento della giornata
export function mealCategoryOf(title: string, type?: string): string {
  const t = title.toLowerCase()
  if (/colazion|breakfast/.test(t)) return 'colazione'
  if (/pranzo|lunch/.test(t)) return 'pranzo'
  if (/merend|spuntin|snack/.test(t)) return 'merenda'
  if (/cena|dinner/.test(t)) return 'cena'
  if (/dormir|notte|sleep/.test(t)) return 'prima_di_dormire'
  if (type === 'partita' || type === 'allenamento' || /partita|gara|match|allenament/.test(t)) return 'pre_allenamento'
  return 'pranzo'
}

// "Avena 80 g" → { name: 'Avena', qty: '80 g' } · "Uova 2" → { name: 'Uova', qty: '2' }
export function splitQty(raw: string): { name: string; qty: string } {
  const s = raw.trim().replace(/\s+/g, ' ')
  const m = s.match(/^(.*?)\s+((?:\d+[.,]?\d*\s*(?:-\s*\d+[.,]?\d*\s*)?(?:g|gr|kg|ml|cl|l|mg|mcg|µg|ui|iu|cps|capsul[ae]|compress[ae]|cucchiai(?:no|ni|o)?|fett[ae]|porzion[ei]|bustin[ae]|scatolett[ae]|vasett[io]|bicchier[ei]|tazz[ae]|pz|pezzi)?\.?)(?:\s.*)?)$/i)
  return m && m[1] ? { name: m[1].trim(), qty: m[2].trim() } : { name: s, qty: '' }
}
// elenco incollato: una voce per riga o separate da virgola/punto e virgola
export const splitList = (raw: string) => raw.split(/[\n;,]+/).map(x => x.trim()).filter(Boolean)

// più usati prima, poi in ordine alfabetico
const byUse = (a: LibItem, b: LibItem) => (b.usage_count - a.usage_count) || a.name.localeCompare(b.name, 'it')

export function useNutriLibrary() {
  const [items, setItems] = useState<LibItem[]>([])
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    // base di partenza (solo le parti mancanti, una volta), poi il menu
    await supabase.rpc('crm_nutri_library_seed')
    const { data } = await supabase.from('crm_nutri_library').select('*')
    setItems(((data as LibItem[]) || []).filter(i => i.kind !== 'pasto').sort(byUse))
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])
  return { items, loading, reload: load, setItems }
}
