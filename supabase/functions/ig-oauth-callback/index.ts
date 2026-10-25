// ig-oauth-callback — ritorno dal login "Collega Instagram" (Instagram API with Instagram Login).
// Instagram rimanda qui con ?code=…&state=…: lo stato (creato da crm_ig_oauth_start) dice
// per quale atleta; il codice si scambia con un token, poi con quello long-lived (60 giorni),
// che salviamo in cp_social_accounts. Subito dopo parte la prima sincronizzazione e
// l'utente torna nel Player Hub (Business › Profilo commerciale).
// Deploy con verify_jwt=false: chi arriva qui è il browser dell'atleta, senza JWT.
import { createClient } from 'npm:@supabase/supabase-js@2'

const APP_URL = 'https://playerhub.auviagency.com/#/commercial?tab=profilo'
const SELF = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ig-oauth-callback`
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const back = (ok: boolean, msg?: string) => new Response(null, {
  status: 302,
  headers: { Location: `${APP_URL}&ig=${ok ? 'ok' : 'error'}${msg ? `&msg=${encodeURIComponent(msg.slice(0, 160))}` : ''}` },
})

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)
  const state = url.searchParams.get('state') || ''
  // Instagram a volte aggiunge "#_" in fondo al codice
  const code = (url.searchParams.get('code') || '').replace(/#_$/, '')
  if (url.searchParams.get('error')) return back(false, url.searchParams.get('error_description') || 'Autorizzazione annullata')
  if (!code || !state) return back(false, 'Risposta di Instagram incompleta')

  // stato valido per 15 minuti, usabile una sola volta
  const { data: st } = await admin.from('crm_ig_oauth_states').select('*').eq('state', state).maybeSingle()
  await admin.from('crm_ig_oauth_states').delete().eq('state', state)
  if (!st || Date.now() - new Date(st.created_at).getTime() > 15 * 60_000) return back(false, 'Collegamento scaduto: riprova')

  const { data: sec } = await admin.from('cp_secrets').select('key,value').in('key', ['ig_app_id', 'ig_app_secret', 'sync_secret'])
  const s = Object.fromEntries((sec ?? []).map((r: any) => [r.key, r.value]))
  if (!s.ig_app_id || !s.ig_app_secret) return back(false, 'App Instagram non configurata')

  try {
    // 1) codice → token breve
    const form = new URLSearchParams({
      client_id: s.ig_app_id, client_secret: s.ig_app_secret,
      grant_type: 'authorization_code', redirect_uri: SELF, code,
    })
    const r1 = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: form })
    const j1 = await r1.json()
    if (!r1.ok || !j1.access_token) throw new Error(j1.error_message || j1.error?.message || 'Scambio del codice non riuscito')

    // 2) token breve → long-lived (60 giorni)
    const r2 = await fetch(`https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(s.ig_app_secret)}&access_token=${encodeURIComponent(j1.access_token)}`)
    const j2 = await r2.json()
    if (!r2.ok || !j2.access_token) throw new Error(j2.error?.message || 'Token di lunga durata non ottenuto')

    // 3) chi è (account professionale)
    const r3 = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(j2.access_token)}`)
    const me = await r3.json()
    if (me.error) throw new Error(me.error.message)
    if (me.account_type && !['BUSINESS', 'MEDIA_CREATOR'].includes(me.account_type)) {
      throw new Error('Il profilo Instagram deve essere professionale (Business o Creator)')
    }

    const { error } = await admin.from('cp_social_accounts').upsert({
      player_id: st.player_id, platform: 'instagram', auth_type: 'instagram_login',
      access_token: j2.access_token,
      token_expires_at: new Date(Date.now() + (j2.expires_in ? j2.expires_in * 1000 : 60 * 86400_000)).toISOString(),
      ig_user_id: String(me.user_id || j1.user_id || ''), ig_username: me.username || null,
      app_id: null, app_secret: null, page_id: null,
      last_sync_status: null, last_sync_error: null,
    }, { onConflict: 'player_id,platform' })
    if (error) throw new Error(error.message)

    // 4) prima sincronizzazione subito (follower, engagement, pubblico)
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-instagram`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': s.sync_secret },
      body: JSON.stringify({ player_id: st.player_id }),
    }).catch(() => null)

    return back(true)
  } catch (e) {
    return back(false, e instanceof Error ? e.message : String(e))
  }
})
