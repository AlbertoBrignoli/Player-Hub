import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useRouteParam } from '../lib/route'
import { fmtDateTime, initials } from '../lib/format'
import { fmtSize } from '../lib/chatFiles'
import { Modal, Field, Input, Textarea, Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'

// Casella di posta dell'atleta (es. albertobrignoli@hub.auviagency.com): tutte le mail
// della gestione arrivano qui, raggruppate per conversazione. La leggono l'atleta e AUVI.
type MailFile = { name: string; type: string; size: number; path: string }
type Mail = {
  id: string; thread_id: string; direction: 'in' | 'out'; from_addr: string | null; from_name: string | null
  to_addrs: string[]; cc_addrs: string[]; subject: string | null; text_body: string | null; html_body: string | null
  attachments: MailFile[]; read_at: string | null; archived_at: string | null; created_at: string
}
type Box = { player_id: number; address: string; display_name: string | null }
type Thread = { id: string; last: Mail; first: Mail; msgs: Mail[]; unread: number; who: string; files: boolean; archived: boolean }

const snippet = (m: Mail) => (m.text_body || (m.html_body || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim().slice(0, 140)
const counterpart = (m: Mail) => m.direction === 'in' ? (m.from_name || m.from_addr || '') : (m.to_addrs[0] || '')

export default function Mail() {
  const { t } = useLang()
  const { athleteId } = useAthlete()
  const openParam = useRouteParam('thread')
  const [box, setBox] = useState<Box | null | undefined>(undefined)
  const [rows, setRows] = useState<Mail[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'inbox' | 'archive'>('inbox')
  const [openId, setOpenId] = useState<string | null>(openParam)
  const [compose, setCompose] = useState<{ to: string; subject: string; replyTo?: Mail } | null>(null)

  useEffect(() => { if (openParam) setOpenId(openParam) }, [openParam])

  async function load() {
    if (!athleteId) return
    const [{ data: b }, { data: m }] = await Promise.all([
      supabase.from('crm_mailboxes').select('player_id, address, display_name').eq('player_id', athleteId).maybeSingle(),
      supabase.from('crm_mail_messages').select('*').eq('player_id', athleteId).order('created_at', { ascending: false }).limit(500),
    ])
    setBox((b as Box) || null)
    setRows((m as Mail[]) || [])
    setLoading(false)
  }
  useEffect(() => {
    setLoading(true); setOpenId(openParam); load()
    const id = setInterval(load, 60000)
    const onFocus = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onFocus)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onFocus) }
  }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const threads = useMemo(() => {
    const by = new Map<string, Mail[]>()
    for (const r of rows) by.set(r.thread_id, [...(by.get(r.thread_id) || []), r])
    const out: Thread[] = []
    by.forEach((msgs, id) => {
      const asc = [...msgs].sort((a, b) => a.created_at.localeCompare(b.created_at))
      const last = asc[asc.length - 1]
      const lastIn = [...asc].reverse().find(m => m.direction === 'in')
      out.push({
        id, msgs: asc, last, first: asc[0],
        unread: asc.filter(m => m.direction === 'in' && !m.read_at).length,
        who: counterpart(lastIn || last), files: asc.some(m => m.attachments?.length),
        archived: asc.every(m => !!m.archived_at),
      })
    })
    return out.sort((a, b) => b.last.created_at.localeCompare(a.last.created_at))
  }, [rows])

  const open = threads.find(th => th.id === openId) || null
  const list = threads.filter(th => (view === 'archive') === th.archived)
  const unreadTot = threads.filter(th => !th.archived).reduce((s, th) => s + th.unread, 0)

  // aprendo una conversazione le mail ricevute diventano lette
  useEffect(() => {
    if (!open || !open.unread) return
    const now = new Date().toISOString()
    const ids = open.msgs.filter(m => m.direction === 'in' && !m.read_at).map(m => m.id)
    setRows(rs => rs.map(r => ids.includes(r.id) ? { ...r, read_at: now } : r))
    supabase.from('crm_mail_messages').update({ read_at: now }).in('id', ids).then(() => {})
  }, [open?.id, open?.unread]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setArchived(th: Thread, archived: boolean) {
    const v = archived ? new Date().toISOString() : null
    const ids = th.msgs.map(m => m.id)
    setRows(rs => rs.map(r => ids.includes(r.id) ? { ...r, archived_at: v } : r))
    await supabase.from('crm_mail_messages').update({ archived_at: v }).in('id', ids)
    toast(archived ? t('Conversazione archiviata') : t('Conversazione ripristinata'))
    setOpenId(null)
  }

  function reply(th: Thread) {
    const lastIn = [...th.msgs].reverse().find(m => m.direction === 'in')
    const base = lastIn || th.last
    const to = base.direction === 'in' ? (base.from_addr || '') : base.to_addrs.join(', ')
    const subj = th.first.subject || ''
    setCompose({ to, subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`, replyTo: base })
  }

  if (loading || box === undefined) return <Spinner />
  if (!box) return <Empty icon={<Icon name="mail" size={22} />} title={t('Casella non ancora attiva')}
    hint={t('AUVI attiverà presto un indirizzo email dedicato a questo atleta.')} />

  return (
    <div className="grid" style={{ gap: 12 }}>
      <AddressCard box={box} />

      {open ? (
        <ThreadView th={open} onBack={() => setOpenId(null)} onReply={() => reply(open)}
          onArchive={() => setArchived(open, !open.archived)} />
      ) : (
        <>
          <div className="flex gap" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {(['inbox', 'archive'] as const).map(k => (
              <button key={k} onClick={() => setView(k)} className="btn btn-sm"
                style={view === k ? { background: 'var(--text)', color: 'var(--bg, #fff)', borderColor: 'var(--text)' } : undefined}>
                <Icon name={k === 'inbox' ? 'inbox' : 'archive'} size={13} /> {k === 'inbox' ? t('In arrivo') : t('Archiviate')}
                {k === 'inbox' && unreadTot > 0 && <span style={{ marginLeft: 6, fontWeight: 800 }}>{unreadTot}</span>}
              </button>
            ))}
            <span style={{ flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={() => setCompose({ to: '', subject: '' })}>
              <Icon name="edit" size={13} /> {t('Scrivi')}
            </button>
          </div>

          {list.length === 0
            ? <Empty icon={<Icon name="inbox" size={22} />} title={view === 'inbox' ? t('Nessuna mail') : t('Nessuna mail archiviata')}
                hint={view === 'inbox' ? t("Le mail inviate al tuo indirizzo AUVI compariranno qui.") : undefined} />
            : (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {list.map((th, i) => (
                  <button key={th.id} onClick={() => setOpenId(th.id)} style={{
                    display: 'flex', gap: 12, width: '100%', textAlign: 'left', padding: '12px 14px', background: 'none',
                    border: 0, borderTop: i ? '1px solid var(--border)' : 0, cursor: 'pointer', color: 'inherit', alignItems: 'flex-start',
                  }}>
                    <span style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0, display: 'grid', placeItems: 'center',
                      background: 'var(--bg-2)', fontSize: 12, fontWeight: 800 }}>{initials(th.who)}</span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="flex" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                        <span style={{ fontWeight: th.unread ? 800 : 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {th.who}{th.msgs.length > 1 && <span style={{ color: 'var(--text-dim)', fontWeight: 500 }}> · {th.msgs.length}</span>}
                        </span>
                        <span style={{ fontSize: 11.5, color: 'var(--text-dim)', flexShrink: 0 }}>{fmtDateTime(th.last.created_at)}</span>
                      </span>
                      <span style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                        {th.unread > 0 && <span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--accent)', flexShrink: 0 }} />}
                        <span style={{ fontSize: 13.5, fontWeight: th.unread ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {th.first.subject || t('(senza oggetto)')}
                        </span>
                        {th.files && <Icon name="paperclip" size={12} />}
                      </span>
                      <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                        {th.last.direction === 'out' && <>{t('Tu')}: </>}{snippet(th.last)}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
        </>
      )}

      {compose && <Composer box={box} init={compose} onClose={() => setCompose(null)}
        onSent={(threadId) => { setCompose(null); load().then(() => setOpenId(threadId)) }} />}
    </div>
  )
}

function AddressCard({ box }: { box: Box }) {
  const { t } = useLang()
  async function copy() {
    try { await navigator.clipboard.writeText(box.address); toast(t('Indirizzo copiato')) } catch { /* no-op */ }
  }
  return (
    <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--bg-2)', flexShrink: 0 }}>
        <Icon name="mail" size={18} />
      </span>
      <div style={{ minWidth: 0, flex: '1 1 200px' }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>{t('Il tuo indirizzo AUVI')}</div>
        <div style={{ fontWeight: 800, wordBreak: 'break-all' }}>{box.address}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 2 }}>{t('Dallo a club, sponsor, staff e a chiunque lavori con te: tutto arriva qui.')}</div>
      </div>
      <button className="btn btn-sm" onClick={copy}><Icon name="copy" size={13} /> {t('Copia')}</button>
    </div>
  )
}

function ThreadView({ th, onBack, onReply, onArchive }: { th: Thread; onBack: () => void; onReply: () => void; onArchive: () => void }) {
  const { t } = useLang()
  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="flex gap" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={onBack}>← {t('Posta')}</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-sm" onClick={onArchive}><Icon name="archive" size={13} /> {th.archived ? t('Ripristina') : t('Archivia')}</button>
        <button className="btn btn-primary btn-sm" onClick={onReply}><Icon name="send" size={13} /> {t('Rispondi')}</button>
      </div>
      <h2 style={{ margin: '4px 2px', fontSize: 19, lineHeight: 1.3 }}>{th.first.subject || t('(senza oggetto)')}</h2>
      {th.msgs.map(m => <MailCard key={m.id} m={m} />)}
      <button className="btn btn-primary" onClick={onReply} style={{ justifySelf: 'start' }}><Icon name="send" size={14} /> {t('Rispondi')}</button>
    </div>
  )
}

function MailCard({ m }: { m: Mail }) {
  const { t } = useLang()
  const mine = m.direction === 'out'
  return (
    <div className="card" style={{ padding: 14, ...(mine ? { background: 'var(--bg-2)' } : null) }}>
      <div className="flex" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <span style={{ width: 32, height: 32, borderRadius: 16, flexShrink: 0, display: 'grid', placeItems: 'center',
          background: mine ? 'var(--text)' : 'var(--bg-2)', color: mine ? 'var(--bg, #fff)' : 'inherit', fontSize: 11, fontWeight: 800 }}>
          {initials(m.from_name || m.from_addr)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <b style={{ fontSize: 14 }}>{mine ? t('Tu') : (m.from_name || m.from_addr)}</b>
            {!mine && m.from_name && <span style={{ fontSize: 12, color: 'var(--text-dim)', wordBreak: 'break-all' }}>{m.from_addr}</span>}
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{fmtDateTime(m.created_at)}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 1, wordBreak: 'break-all' }}>
            {t('A')}: {m.to_addrs.join(', ')}{m.cc_addrs.length > 0 && <> · Cc: {m.cc_addrs.join(', ')}</>}
          </div>
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        {!mine && m.html_body
          ? <HtmlBody html={m.html_body} />
          : <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>{m.text_body}</div>}
      </div>
      {m.attachments?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          {m.attachments.map(f => <FileChip key={f.path} f={f} />)}
        </div>
      )}
    </div>
  )
}

// HTML della mail in un riquadro isolato: niente script, link in una nuova scheda, altezza adattata.
function HtmlBody({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [h, setH] = useState(120)
  const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank">
<style>body{margin:0;font:14px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#111;background:#fff;word-break:break-word}img{max-width:100%;height:auto}table{max-width:100%!important}</style>
</head><body>${html}</body></html>`
  function fit() {
    const d = ref.current?.contentDocument
    if (d?.body) setH(Math.min(Math.max(d.documentElement.scrollHeight, 60), 4000))
  }
  return <iframe ref={ref} title="mail" srcDoc={doc} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
    onLoad={() => { fit(); setTimeout(fit, 400) }}
    style={{ width: '100%', height: h, border: 0, borderRadius: 10, background: '#fff' }} />
}

function FileChip({ f }: { f: MailFile }) {
  async function open() {
    const w = window.open('', '_blank')   // aperta subito, legata al tocco (iPhone)
    const { data } = await supabase.storage.from('mail-files').createSignedUrl(f.path, 3600)
    if (data?.signedUrl && w) w.location.href = data.signedUrl
    else { w?.close(); toast('File non disponibile', 'err') }
  }
  const ext = (f.name || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'
  return (
    <button onClick={open} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, cursor: 'pointer',
      border: '1px solid var(--border)', background: 'var(--bg-2)', color: 'inherit', maxWidth: 260, textAlign: 'left' }}>
      <span style={{ width: 30, height: 34, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 900,
        background: ext === 'PDF' ? '#E5484D' : 'var(--text-dim)', color: '#fff' }}>{ext}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
        <span style={{ display: 'block', fontSize: 11, opacity: .7 }}>{fmtSize(f.size)}</span>
      </span>
    </button>
  )
}

function Composer({ box, init, onClose, onSent }: {
  box: Box; init: { to: string; subject: string; replyTo?: Mail }; onClose: () => void; onSent: (threadId: string) => void
}) {
  const { t } = useLang()
  const [to, setTo] = useState(init.to)
  const [cc, setCc] = useState('')
  const [showCc, setShowCc] = useState(false)
  const [subject, setSubject] = useState(init.subject)
  const [text, setText] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const pick = useRef<HTMLInputElement>(null)
  const split = (s: string) => s.split(/[,;\s]+/).map(x => x.trim()).filter(Boolean)

  async function send() {
    if (!split(to).length) { toast(t('Inserisci almeno un destinatario'), 'err'); return }
    if (!text.trim()) { toast(t('Scrivi il messaggio'), 'err'); return }
    setBusy(true)
    try {
      const folder = `${box.player_id}/out-${crypto.randomUUID()}`
      const attachments: { path: string; name: string }[] = []
      for (const f of files) {
        const path = `${folder}/${f.name.replace(/[^\w.\-]+/g, '_')}`
        const { error } = await supabase.storage.from('mail-files').upload(path, f, { contentType: f.type || undefined })
        if (error) throw new Error(error.message)
        attachments.push({ path, name: f.name })
      }
      const { data, error } = await supabase.functions.invoke('mail-send', {
        body: { player_id: box.player_id, to: split(to), cc: split(cc), subject, text, reply_to_id: init.replyTo?.id, attachments },
      })
      if (error || data?.error) {
        let msg = data?.error
        try { msg = msg || (await (error as any)?.context?.json())?.error } catch { /* no-op */ }
        throw new Error(msg || t('Invio non riuscito'))
      }
      toast(t('Mail inviata'))
      onSent(data.thread_id)
    } catch (e) {
      toast((e as Error).message, 'err')
      setBusy(false)
    }
  }

  return (
    <Modal title={init.replyTo ? t('Rispondi') : t('Nuova mail')} onClose={onClose}
      footer={<div className="flex gap" style={{ width: '100%', gap: 8 }}>
        <button className="btn" style={{ flex: '0 0 auto', width: 'auto' }} onClick={() => pick.current?.click()} disabled={busy}>
          <Icon name="paperclip" size={14} /> {t('Allega')}
        </button>
        <button className="btn btn-primary" style={{ flex: 1 }} onClick={send} disabled={busy}>
          <Icon name="send" size={14} /> {busy ? t('Invio…') : t('Invia')}
        </button>
      </div>}>
      <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 10 }}>{t('Da')}: <b>{box.address}</b></div>
      <Field label={t('A')}>
        <Input value={to} onChange={e => setTo(e.target.value)} placeholder="nome@esempio.com" type="email" multiple autoFocus={!init.to} />
      </Field>
      {showCc
        ? <Field label="Cc"><Input value={cc} onChange={e => setCc(e.target.value)} placeholder="nome@esempio.com" /></Field>
        : <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }} onClick={() => setShowCc(true)}>+ Cc</button>}
      <Field label={t('Oggetto')}><Input value={subject} onChange={e => setSubject(e.target.value)} /></Field>
      <Field label={t('Messaggio')}><Textarea rows={8} value={text} onChange={e => setText(e.target.value)} autoFocus={!!init.to} /></Field>
      {init.replyTo && <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{t('Il messaggio originale viene citato sotto la tua risposta.')}</div>}
      <input ref={pick} type="file" hidden multiple onChange={e => { const l = Array.from(e.target.files || []); setFiles(fs => [...fs, ...l]); e.target.value = '' }} />
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {files.map((f, i) => (
            <span key={i} className="btn btn-sm" style={{ cursor: 'default' }}>
              <Icon name="paperclip" size={12} /> {f.name} · {fmtSize(f.size)}
              <button onClick={() => setFiles(fs => fs.filter((_, j) => j !== i))} aria-label={t('Rimuovi')}
                style={{ border: 0, background: 'none', cursor: 'pointer', color: 'inherit', padding: '0 0 0 4px' }}><Icon name="x" size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </Modal>
  )
}
