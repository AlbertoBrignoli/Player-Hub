// mail-send — invia (o risponde) dalla casella dell'atleta tramite Resend.
// Body: { player_id, to: string[], cc?: string[], subject, text, reply_to_id?, attachments?: [{ path, name }] }
// Gli allegati sono già caricati dal client in mail-files/<player_id>/... .
// Auth: JWT dell'utente; può inviare solo chi può leggere la casella (AUVI o l'atleta).
// Segreto SOLO in cp_secrets: resend_api_key.

import { createClient } from 'npm:@supabase/supabase-js@2'

const URL_ = Deno.env.get('SUPABASE_URL')!
const supa = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const emailOk = (s: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)
const b64 = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf); let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const authz = req.headers.get('Authorization') || ''
    const { data: u } = await supa.auth.getUser(authz.replace(/^Bearer\s+/i, ''))
    if (!u?.user) return json({ error: 'unauthorized' }, 401)

    const b = await req.json()
    const playerId = Number(b.player_id)
    // stessa regola della lettura, valutata con il token dell'utente
    const asUser = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authz } } })
    const { data: ok } = await asUser.rpc('crm_mail_access', { p_api: playerId })
    if (!ok) return json({ error: 'forbidden' }, 403)

    const to = (b.to || []).map((x: string) => x.trim()).filter(Boolean)
    const cc = (b.cc || []).map((x: string) => x.trim()).filter(Boolean)
    if (!to.length || [...to, ...cc].some((x: string) => !emailOk(x))) return json({ error: 'Indirizzo non valido' }, 400)
    const subject = String(b.subject || '').trim() || '(senza oggetto)'
    const text = String(b.text || '')

    const { data: box } = await supa.from('crm_mailboxes').select('*').eq('player_id', playerId).maybeSingle()
    if (!box?.active) return json({ error: 'Casella non attiva' }, 400)
    const { data: sec } = await supa.from('cp_secrets').select('value').eq('key', 'resend_api_key').maybeSingle()
    if (!sec?.value) return json({ error: 'Invio non ancora configurato' }, 503)

    // risposta: stessa conversazione, intestazioni di threading e testo citato
    let threadId: string = crypto.randomUUID()
    const headers: Record<string, string> = {}
    let quote = ''
    if (b.reply_to_id) {
      const { data: p } = await supa.from('crm_mail_messages').select('*').eq('id', b.reply_to_id).eq('player_id', playerId).maybeSingle()
      if (p) {
        threadId = p.thread_id
        if (p.message_id) { headers['In-Reply-To'] = p.message_id; headers['References'] = p.message_id }
        const when = new Date(p.created_at).toLocaleString('it-IT', { timeZone: 'Europe/Athens' })
        const orig = (p.text_body || '').split('\n').map((l: string) => '> ' + l).join('\n')
        if (orig.trim()) quote = `\n\nIl ${when}, ${p.from_name || p.from_addr} ha scritto:\n${orig}`
      }
    }
    const fullText = text + quote
    const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;white-space:pre-wrap">${esc(fullText)}</div>`

    const files: { name: string; type: string; size: number; path: string }[] = []
    const atts: { filename: string; content: string }[] = []
    for (const a of b.attachments || []) {
      if (!String(a.path || '').startsWith(`${playerId}/`)) continue
      const { data: blob } = await supa.storage.from('mail-files').download(a.path)
      if (!blob) continue
      const buf = await blob.arrayBuffer()
      atts.push({ filename: a.name || a.path.split('/').pop(), content: b64(buf) })
      files.push({ name: a.name || a.path.split('/').pop(), type: blob.type, size: buf.byteLength, path: a.path })
    }

    const from = box.display_name ? `${box.display_name} <${box.address}>` : box.address
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${sec.value}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, cc: cc.length ? cc : undefined, subject, text: fullText, html, headers, attachments: atts.length ? atts : undefined }),
    })
    const out = await res.json()
    if (!res.ok) return json({ error: out?.message || 'Invio non riuscito' }, 502)

    const { data: row, error } = await supa.from('crm_mail_messages').insert({
      player_id: playerId, thread_id: threadId, direction: 'out', provider_id: out.id,
      in_reply_to: headers['In-Reply-To'] || null,
      from_addr: box.address, from_name: box.display_name, to_addrs: to, cc_addrs: cc,
      subject, text_body: fullText, html_body: html, attachments: files,
      read_at: new Date().toISOString(), sent_by: u.user.id,
    }).select('id, thread_id').single()
    if (error) return json({ error: error.message }, 500)
    return json({ ok: true, ...row })
  } catch (e) {
    return json({ error: (e as Error).message }, 500)
  }
})
