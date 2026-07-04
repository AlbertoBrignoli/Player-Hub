import { supabase } from './supabase'
import type { Role } from './types'

// Crea una notifica in-app per il ruolo destinatario (la campanella nella Shell
// la riceve via realtime). Fallisce in silenzio: la notifica non deve mai
// bloccare l'azione principale.
export async function notify(role: Role, title: string, body?: string, route?: string) {
  try {
    await supabase.from('crm_notifications').insert({
      recipient_role: role,
      title,
      body: body || null,
      route: route || null,
    })
  } catch {
    // best effort
  }
}
