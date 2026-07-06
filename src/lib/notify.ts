import { supabase } from './supabase'
import type { Role } from './types'

// Crea una notifica in-app per il ruolo destinatario (la campanella nella Shell
// la riceve via realtime). 'team' raggiunge admin e creator insieme.
// Fallisce in silenzio: la notifica non deve mai bloccare l'azione principale.
export async function notify(role: Role | 'team', title: string, body?: string, route?: string, playerId?: number | null) {
  try {
    await supabase.from('crm_notifications').insert({
      recipient_role: role,
      title,
      body: body || null,
      route: route || null,
      player_id: playerId ?? null,
    })
  } catch {
    // best effort
  }
}
