// Invia Web Push agli iscritti quando nasce una notifica in-app.
// Auth: header X-Push-Secret condiviso col trigger Postgres (webhook interno).
// Segreti SOLO in cp_secrets (leggibile dal solo service role), mai nel codice:
//   push_secret   — generato dal DB (migrazione 0025)
//   vapid_public / vapid_private — generate qui al primo avvio se mancano.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

let config: { secret: string; publicKey: string } | null = null

async function loadConfig() {
  if (config) return config
  const { data } = await supa.from('cp_secrets').select('key, value')
    .in('key', ['push_secret', 'vapid_public', 'vapid_private'])
  const s = Object.fromEntries((data || []).map((r: any) => [r.key, r.value]))
  if (!s.push_secret) throw new Error('push_secret mancante in cp_secrets')
  if (!s.vapid_public || !s.vapid_private) {
    // insert-if-absent + rilettura: se due istanze partono insieme vince la prima coppia scritta
    const keys = webpush.generateVAPIDKeys()
    await supa.from('cp_secrets').upsert([
      { key: 'vapid_public', value: keys.publicKey },
      { key: 'vapid_private', value: keys.privateKey },
    ], { onConflict: 'key', ignoreDuplicates: true })
    const { data: v } = await supa.from('cp_secrets').select('key, value')
      .in('key', ['vapid_public', 'vapid_private'])
    for (const r of v || []) s[r.key] = r.value
  }
  webpush.setVapidDetails('mailto:a.brignoli@auviagency.com', s.vapid_public, s.vapid_private)
  config = { secret: s.push_secret, publicKey: s.vapid_public }
  return config
}

Deno.serve(async (req: Request) => {
  const cfg = await loadConfig()
  if (req.headers.get('x-push-secret') !== cfg.secret) {
    return new Response('unauthorized', { status: 401 })
  }
  const { record } = await req.json()
  if (!record?.title) return new Response('no record', { status: 400 })

  const roles = record.recipient_role === 'team' ? ['admin', 'creator'] : [record.recipient_role]
  const { data: subs } = await supa.from('crm_push_subscriptions').select('*').in('role', roles)

  // Destinatari diretti, isolati per atleta.
  let targets = subs || []
  if (roles[0] === 'partner') {
    // partner dei servizi: solo il titolare del servizio di QUELLA richiesta (route ...?req=<id>)
    const reqId = /req=([0-9a-f-]{36})/.exec(record.route || '')?.[1]
    let owner: string | null = null
    if (reqId) {
      const { data: r } = await supa.from('crm_service_requests').select('service_id').eq('id', reqId).maybeSingle()
      if (r?.service_id) {
        const { data: s } = await supa.from('crm_services').select('partner_user_id').eq('id', r.service_id).maybeSingle()
        owner = s?.partner_user_id ?? null
      }
    }
    targets = targets.filter((s: any) => owner && s.user_id === owner)
  } else if (record.player_id && targets.length) {
    if (roles.includes('player')) {
      const { data: profs } = await supa.from('crm_profiles')
        .select('id').eq('player_api_id', record.player_id)
      const ok = new Set((profs || []).map((p: any) => p.id))
      targets = targets.filter((s: any) => ok.has(s.user_id))
    } else if (roles.includes('brand')) {
      const { data: ba } = await supa.from('crm_brand_athletes')
        .select('brand_id').eq('player_id', record.player_id)
      const brandIds = (ba || []).map((r: any) => r.brand_id)
      let ok = new Set<string>()
      if (brandIds.length) {
        const { data: brands } = await supa.from('crm_brands')
          .select('owner_id').in('id', brandIds)
        ok = new Set((brands || []).map((b: any) => b.owner_id).filter(Boolean))
      }
      targets = targets.filter((s: any) => ok.has(s.user_id))
    } else {
      // professionisti: solo chi è collegato a QUELL'atleta (prima assicuratore,
      // commercialista, fisioterapista e procuratore ricevevano le notifiche di tutti)
      const PRO_LINKS: Record<string, [string, string]> = {
        preparatore: ['fitness_trainer_athletes', 'trainer_id'],
        agente: ['crm_agent_athletes', 'agent_id'],
        assicuratore: ['crm_insurer_athletes', 'insurer_id'],
        commercialista: ['crm_tax_athletes', 'advisor_id'],
        fisioterapista: ['crm_physio_athletes', 'physio_id'],
      }
      const link = PRO_LINKS[roles[0]]
      if (link) {
        const { data: assigned } = await supa.from(link[0]).select(link[1]).eq('player_id', record.player_id)
        const ok = new Set((assigned || []).map((a: any) => a[link[1]]))
        targets = targets.filter((s: any) => ok.has(s.user_id))
      }
    }
  } else if (['preparatore', 'agente', 'assicuratore', 'commercialista', 'fisioterapista'].includes(roles[0])) {
    // notifica per un professionista senza atleta: non si manda a tutti quelli del ruolo
    targets = []
  }

  // Agente/procuratore: riceve le notifiche dei soli atleti che segue.
  if (record.player_id) {
    const { data: agentSubs } = await supa.from('crm_push_subscriptions').select('*').eq('role', 'agente')
    if (agentSubs?.length) {
      const { data: assigned } = await supa.from('crm_agent_athletes')
        .select('agent_id').eq('player_id', record.player_id)
      const ok = new Set((assigned || []).map((a: any) => a.agent_id))
      targets = [...targets, ...agentSubs.filter((s: any) => ok.has(s.user_id))]
    }
  }

  // Super admin: riceve copia di OGNI notifica, di qualunque atleta e destinatario.
  if (!roles.includes('admin')) {
    const { data: admins } = await supa.from('crm_push_subscriptions').select('*').eq('role', 'admin')
    targets = [...targets, ...(admins || [])]
  }

  // Mai notificare chi ha generato l'evento, e mai due volte lo stesso dispositivo.
  const seen = new Set<string>()
  targets = targets.filter((s: any) => {
    if (record.source_user_id && s.user_id === record.source_user_id) return false
    if (seen.has(s.endpoint)) return false
    seen.add(s.endpoint)
    return true
  })
  if (!targets.length) return new Response('no targets')

  const payload = JSON.stringify({
    title: record.title,
    body: record.body || '',
    route: record.route || '',
  })

  let sent = 0
  await Promise.all(targets.map(async (s: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (e: any) {
      // 404/410 = iscrizione scaduta; 401/403 = iscrizione legata a vecchie chiavi VAPID
      if ([401, 403, 404, 410].includes(e?.statusCode)) {
        await supa.from('crm_push_subscriptions').delete().eq('id', s.id)
      } else {
        console.error('push error', e?.statusCode, e?.message)
      }
    }
  }))
  return new Response(`sent ${sent}/${targets.length}`)
})
