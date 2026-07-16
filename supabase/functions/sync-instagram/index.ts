// sync-instagram — sincronizza i dati Instagram (Graph API Meta) nel Commercial Profile.
//
// Per ogni riga di cp_social_accounts:
//   1. rinnova il token long-lived se in scadenza (fb_exchange_token, ~60gg)
//   2. scopre l'account IG Business collegato alla pagina (al primo sync)
//   3. legge follower, media recenti (→ engagement rate), reach per post,
//      demografia follower (paesi, età, genere)
//   4. aggiorna player.instagram_* e cp_profiles.audience (merge, non sovrascrive
//      tiktok/youtube/authenticity inseriti a mano)
//
// Auth: header x-sync-secret (cron) OPPURE Bearer JWT di un utente admin (bottone in app).
// Il secret è generato per-istanza dalla migration 0018 e vive SOLO nel DB
// (tabella cp_secrets, senza policy → leggibile solo dal service role).
// Deploy con verify_jwt=false: l'auth è gestita qui sotto.
import { createClient } from 'npm:@supabase/supabase-js@2'

const GRAPH = 'https://graph.facebook.com/v21.0'

const COUNTRY: Record<string, string> = {
  IT: 'Italia', GR: 'Grecia', ES: 'Spagna', FR: 'Francia', DE: 'Germania', GB: 'Regno Unito',
  US: 'USA', BR: 'Brasile', AR: 'Argentina', PT: 'Portogallo', NL: 'Paesi Bassi', TR: 'Turchia',
  AL: 'Albania', CH: 'Svizzera', BE: 'Belgio', AT: 'Austria', RO: 'Romania', PL: 'Polonia',
  MX: 'Messico', ID: 'Indonesia', IN: 'India', EG: 'Egitto', MA: 'Marocco', TN: 'Tunisia',
}

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

async function graphGet(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${GRAPH}${path}?${qs}`)
  const json = await res.json()
  if (json.error) throw new Error(`${json.error.type || 'GraphError'}: ${json.error.message}`)
  return json
}

async function isAdminJwt(req: Request): Promise<boolean> {
  const auth = req.headers.get('authorization') || ''
  const jwt = auth.replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const { data: userData } = await admin.auth.getUser(jwt)
  if (!userData?.user) return false
  const { data: prof } = await admin.from('crm_profiles').select('role').eq('id', userData.user.id).maybeSingle()
  return prof?.role === 'admin'
}

async function syncAccount(acc: any) {
  const upd: any = {}
  let token: string = acc.access_token
  if (!token) throw new Error('Nessun access token salvato')

  // 1) Token long-lived: scambia se manca la scadenza o mancano <15 giorni
  const expSoon = !acc.token_expires_at || (new Date(acc.token_expires_at).getTime() - Date.now()) < 15 * 86400_000
  if (acc.app_id && acc.app_secret && expSoon) {
    try {
      const ex = await graphGet('/oauth/access_token', {
        grant_type: 'fb_exchange_token', client_id: acc.app_id,
        client_secret: acc.app_secret, fb_exchange_token: token,
      })
      token = ex.access_token
      upd.access_token = token
      upd.token_expires_at = new Date(Date.now() + (ex.expires_in ? ex.expires_in * 1000 : 60 * 86400_000)).toISOString()
    } catch (e) {
      // se lo scambio fallisce ma il token attuale è ancora valido, si prosegue
      console.warn(`exchange fallito per player ${acc.player_id}: ${e}`)
    }
  }

  // 2) Scoperta account IG Business (al primo sync)
  let igId: string = acc.ig_user_id
  if (!igId) {
    const pages = await graphGet('/me/accounts', { fields: 'id,name,instagram_business_account{id,username}', access_token: token })
    const page = (pages.data || []).find((p: any) => p.instagram_business_account)
    if (!page) throw new Error('Nessuna pagina Facebook con account Instagram Business collegato. Verifica che il profilo IG sia Business/Creator e collegato a una pagina.')
    igId = page.instagram_business_account.id
    upd.ig_user_id = igId
    upd.ig_username = page.instagram_business_account.username || null
    upd.page_id = page.id
  }

  // 3) Profilo: follower
  const prof = await graphGet(`/${igId}`, { fields: 'followers_count,media_count,username', access_token: token })
  const followers: number = prof.followers_count || 0
  if (prof.username) upd.ig_username = prof.username

  // 4) Media recenti → engagement rate medio
  let er: number | null = null
  let reach: number | null = null
  try {
    const media = await graphGet(`/${igId}/media`, { fields: 'id,like_count,comments_count,media_type,timestamp', limit: '12', access_token: token })
    const items = (media.data || []).filter((m: any) => m.like_count != null)
    if (items.length && followers > 0) {
      const per = items.map((m: any) => ((m.like_count || 0) + (m.comments_count || 0)) / followers)
      er = Math.round((per.reduce((a: number, b: number) => a + b, 0) / per.length) * 10000) / 100
    }
    // reach medio per post (best effort, salta i media senza insights)
    const reaches: number[] = []
    for (const m of items.slice(0, 8)) {
      try {
        const ins = await graphGet(`/${m.id}/insights`, { metric: 'reach', access_token: token })
        const v = ins.data?.[0]?.values?.[0]?.value
        if (typeof v === 'number' && v > 0) reaches.push(v)
      } catch { /* alcuni formati non hanno reach */ }
    }
    if (reaches.length) reach = Math.round(reaches.reduce((a, b) => a + b, 0) / reaches.length)
  } catch (e) { console.warn(`media insights: ${e}`) }

  // 5) Demografia follower (serve un account con almeno ~100 follower)
  let geo: string[] | null = null
  let ageBand: string | null = null
  let genderSplit: string | null = null
  const demo = async (breakdown: string) => {
    const r = await graphGet(`/${igId}/insights`, {
      metric: 'follower_demographics', period: 'lifetime', timeframe: 'this_month',
      metric_type: 'total_value', breakdown, access_token: token,
    })
    return r.data?.[0]?.total_value?.breakdowns?.[0]?.results || []
  }
  try {
    const byCountry = await demo('country')
    if (byCountry.length) {
      geo = byCountry
        .sort((a: any, b: any) => b.value - a.value).slice(0, 3)
        .map((r: any) => COUNTRY[r.dimension_values?.[0]] || r.dimension_values?.[0])
    }
  } catch (e) { console.warn(`demografia country: ${e}`) }
  try {
    const byAge = await demo('age')
    if (byAge.length) {
      const top = byAge.sort((a: any, b: any) => b.value - a.value)[0]
      ageBand = top?.dimension_values?.[0] || null
    }
  } catch { /* opzionale */ }
  try {
    const byGender = await demo('gender')
    if (byGender.length) {
      const tot = byGender.reduce((s: number, r: any) => s + r.value, 0)
      const m = byGender.find((r: any) => r.dimension_values?.[0] === 'M')?.value || 0
      const share = tot ? m / tot : 0.5
      genderSplit = share >= 0.6 ? 'Prevalenza uomini' : share <= 0.4 ? 'Prevalenza donne' : 'Bilanciato'
    }
  } catch { /* opzionale */ }

  // 6) Storico follower → crescita % ultimi 90gg
  const today = new Date().toISOString().slice(0, 10)
  const history: { d: string; f: number }[] = Array.isArray(acc.history) ? [...acc.history] : []
  if (!history.find(h => h.d === today)) history.push({ d: today, f: followers })
  while (history.length > 400) history.shift()
  upd.history = history
  let growth: number | null = null
  const past = history.filter(h => (Date.now() - new Date(h.d).getTime()) >= 85 * 86400_000).pop()
  if (past && past.f > 0) growth = Math.round(((followers - past.f) / past.f) * 1000) / 10

  // 7) Scrittura: player.instagram_* (+ flag connected)
  const playerUpd: any = { instagram_followers: followers, instagram_connected: true }
  if (er != null) playerUpd.instagram_engagement = er
  if (reach != null) playerUpd.instagram_reach = reach
  await admin.from('player').update(playerUpd).eq('api_player_id', acc.player_id)

  // 8) cp_profiles.audience: merge senza toccare tiktok/youtube/authenticity manuali
  const { data: cp } = await admin.from('cp_profiles').select('id, audience').eq('player_id', acc.player_id).maybeSingle()
  const audience = { ...(cp?.audience || {}) }
  audience.instagram = { ...(audience.instagram || {}), followers, er, ...(growth != null ? { growth } : {}) }
  if (geo) audience.geo = geo
  if (ageBand) audience.age_band = ageBand
  if (genderSplit) audience.gender_split = genderSplit
  audience.last_synced_at = new Date().toISOString()
  if (cp) await admin.from('cp_profiles').update({ audience }).eq('id', cp.id)
  else await admin.from('cp_profiles').insert({ player_id: acc.player_id, audience })

  // 9) Stato del collegamento
  await admin.from('cp_social_accounts').update({
    ...upd, last_sync_at: new Date().toISOString(), last_sync_status: 'ok', last_sync_error: null,
  }).eq('id', acc.id)

  return { player_id: acc.player_id, ok: true, username: upd.ig_username || acc.ig_username, followers, er, reach, geo, age_band: ageBand, gender_split: genderSplit, growth }
}

Deno.serve(async (req: Request) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret' }
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  const { data: secretRow } = await admin.from('cp_secrets').select('value').eq('key', 'sync_secret').maybeSingle()
  const given = req.headers.get('x-sync-secret')
  const bySecret = !!secretRow?.value && !!given && given === secretRow.value
  if (!bySecret && !(await isAdminJwt(req))) {
    return new Response(JSON.stringify({ error: 'Non autorizzato' }), { status: 401, headers })
  }

  let playerId: number | null = null
  try { const body = await req.json(); playerId = body?.player_id ?? null } catch { /* body vuoto dal cron */ }

  let q = admin.from('cp_social_accounts').select('*')
  if (playerId) q = q.eq('player_id', playerId)
  const { data: accounts, error } = await q
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers })
  if (!accounts?.length) return new Response(JSON.stringify({ error: 'Nessun account collegato', results: [] }), { status: 200, headers })

  const results: any[] = []
  for (const acc of accounts) {
    try {
      results.push(await syncAccount(acc))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await admin.from('cp_social_accounts').update({ last_sync_at: new Date().toISOString(), last_sync_status: 'error', last_sync_error: msg }).eq('id', acc.id)
      results.push({ player_id: acc.player_id, ok: false, error: msg })
    }
  }
  return new Response(JSON.stringify({ results }), { headers })
})
