import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) {
  // Fallisce chiaro in dev se le env non sono configurate
  console.error('Mancano VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (.env.local)')
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

export const PLAYER_NAME = (import.meta.env.VITE_PLAYER_NAME as string) || 'Giocatore'
export const AGENCY_NAME = (import.meta.env.VITE_AGENCY_NAME as string) || 'AUVI Agency'
