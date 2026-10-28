// mail-inbound — riceve le mail delle caselle atleta (<nome>@hub.auviagency.com).
// Resend riceve la posta sul sottodominio (MX) e chiama questo webhook con l'evento
// "email.received" (solo metadati): qui si scarica il contenuto, si salvano gli allegati
// nel bucket mail-files, si aggancia la mail alla conversazione giusta e si notifica
// l'atleta e AUVI.
// Segreti SOLO in cp_secrets (mai nel codice): resend_api_key, resend_webhook_secret.
// verify_jwt = false: l'autenticità la garantisce la firma Svix del webhook.

import { createClient } from 'npm:@supabase/supabase-js@2'

const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)
const API = 'https://api.resend.com'

async function secrets() {
  const { data } = await supa.from('cp_secrets').select('key, value')
    .in('key', ['resend_api_key', 'resend_webhook_secret'])
  return Object.fromEntries((data || []).map((r: any) => [r.key, r.value])) as Record<string, string>
}

// Firma Svix: HMAC-SHA256 di "<id>.<timestamp>.<body>" con il segreto whsec_ (base64)
async function verify(req: Request, body: string, secret: string) {
  const id = req.headers.get('svix-id'), ts = req.headers.get('svix-timestamp'), sig = req.headers.get('svix-signature')
  if (!id || !ts || !sig) return false
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, '')), c => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
  return sig.split(' ').some(s => s.split(',')[1] === expected)
}

const lower = (a: unknown) => (Array.isArray(a) ? a : a ? [a] : []).map(x => String(x).trim().toLowerCase())
// "Nome Cognome <a@b.it>" -> { name, addr }
function parseAddr(v?: string | null) {
  const s = (v || '').trim()
  const m = /^(.*?)\s*<([^>]+)>$/.exec(s)
  return m ? { name: m[1].replace(/^"|"$/g, '').trim() || null, addr: m[2].trim() } : { name: null, addr: s }
}
const baseSubject = (s?: string | null) => (s || '').replace(/^(\s*(re|r|fw|fwd|i|aw|sv)\s*:\s*)+/i, '').trim().toLowerCase()
const safeName = (n: string) => n.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file'

Deno.serve(async (req) => {
  const body = await req.text()
  const s = await secrets()
  if (!s.resend_webhook_secret || !s.resend_api_key) return new Response('not configured', { status: 503 })
  if (!(await verify(req, body, s.resend_webhook_secret))) return new Response('bad signature', { status: 401 })

  const event = JSON.parse(body)
  if (event.type !== 'email.received') return new Response('ignored')
  const emailId = event.data?.email_id
  if (!emailId) return new Response('no id', { status: 400 })

  const { data: dup } = await supa.from('crm_mail_messages').select('id').eq('provider_id', emailId).maybeSingle()
  if (dup) return new Response('duplicate')

  const auth = { Authorization: `Bearer ${s.resend_api_key}` }
  const email = await (await fetch(`${API}/emails/receiving/${emailId}?html_format=data_uri`, { headers: auth })).json()
  if (!email?.id) return new Response('fetch failed', { status: 502 })

  // casella destinataria: la prima che compare tra to / cc / received_for
  const rcpts = [...lower(email.to), ...lower(email.cc), ...lower(email.received_for)]
    .map(r => parseAddr(r).addr)
  const { data: boxes } = await supa.from('crm_mailboxes').select('player_id, address').eq('active', true)
  const box = (boxes || []).find((b: any) => rcpts.includes(b.address.toLowerCase()))
  if (!box) return new Response('no mailbox')
  const playerId = box.player_id

  const h = email.headers || {}
  const from = parseAddr(h.from || email.from)
  const inReplyTo = (h['in-reply-to'] || '').trim() || null
  const refs = [inReplyTo, ...String(h.references || '').match(/<[^>]+>/g) || []].filter(Boolean)

  // conversazione: prima per Message-ID citati, poi per oggetto + stesso mittente
  let threadId: string | null = null
  if (refs.length) {
    const { data } = await supa.from('crm_mail_messages').select('thread_id')
      .eq('player_id', playerId).in('message_id', refs).limit(1)
    threadId = data?.[0]?.thread_id ?? null
  }
  if (!threadId && baseSubject(email.subject)) {
    const since = new Date(Date.now() - 60 * 864e5).toISOString()
    const { data } = await supa.from('crm_mail_messages').select('thread_id, subject, from_addr, to_addrs')
      .eq('player_id', playerId).gte('created_at', since).order('created_at', { ascending: false }).limit(200)
    const who = from.addr.toLowerCase()
    const hit = (data || []).find((m: any) => baseSubject(m.subject) === baseSubject(email.subject)
      && (m.from_addr?.toLowerCase() === who || (m.to_addrs || []).map((x: string) => x.toLowerCase()).includes(who)))
    threadId = hit?.thread_id ?? null
  }
  threadId = threadId || crypto.randomUUID()

  // allegati veri (le immagini inline sono già nell'html come data URI)
  const msgUuid = crypto.randomUUID()
  const files: { name: string; type: string; size: number; path: string }[] = []
  if ((email.attachments || []).some((a: any) => a.content_disposition !== 'inline')) {
    const list = await (await fetch(`${API}/emails/receiving/${emailId}/attachments`, { headers: auth })).json()
    for (const a of list?.data || []) {
      if (a.content_disposition === 'inline' && a.content_id) continue
      try {
        const bin = await (await fetch(a.download_url)).arrayBuffer()
        const path = `${playerId}/${msgUuid}/${safeName(a.filename || 'file')}`
        const { error } = await supa.storage.from('mail-files').upload(path, bin, { contentType: a.content_type || 'application/octet-stream', upsert: true })
        if (!error) files.push({ name: a.filename || 'file', type: a.content_type || '', size: a.size || bin.byteLength, path })
      } catch (_) { /* un allegato perso non blocca la mail */ }
    }
  }

  const { error } = await supa.from('crm_mail_messages').insert({
    id: msgUuid, player_id: playerId, thread_id: threadId, direction: 'in', provider_id: emailId,
    message_id: email.message_id || null, in_reply_to: inReplyTo,
    from_addr: from.addr, from_name: from.name,
    to_addrs: lower(email.to).map(x => parseAddr(x).addr), cc_addrs: lower(email.cc).map(x => parseAddr(x).addr),
    subject: email.subject || null, text_body: email.text || null, html_body: email.html || null,
    attachments: files, created_at: email.created_at || new Date().toISOString(),
  })
  if (error) return new Response(error.message, { status: 500 })

  const title = `Nuova mail da ${from.name || from.addr}`
  const route = `mail?thread=${threadId}`
  // una sola notifica all'atleta: AUVI (admin) la vede e riceve comunque copia di tutte
  await supa.from('crm_notifications').insert({ recipient_role: 'player', title, body: email.subject || null, route, player_id: playerId })
  return new Response('ok')
})
