// Thread di lavoro su una richiesta servizio: messaggi e file (report, video, PDF)
// tra atleta, AUVI e partner. Le regole di chi vede/scrive sono nel DB (crm_request_visible).
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import Icon from './Icon'
import { fmtDateTime } from '../lib/format'

const BUCKET = 'service-files'

type Msg = {
  id: string; author_id: string; author_role: string | null; author_name: string | null
  body: string | null; file_path: string | null; file_name: string | null; created_at: string
}

const ROLE_TAG: Record<string, string> = { partner: 'Partner', admin: 'AUVI', creator: 'AUVI', player: 'Atleta' }

export default function RequestThread({ requestId, placeholder }: { requestId: string; placeholder?: string }) {
  const { profile } = useAuth()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const { data } = await supabase.from('crm_service_request_messages')
      .select('id, author_id, author_role, author_name, body, file_path, file_name, created_at')
      .eq('request_id', requestId).order('created_at')
    setMsgs((data as Msg[]) || [])
  }
  useEffect(() => { load() }, [requestId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(file?: File) {
    const text = body.trim()
    if (!text && !file) return
    setBusy(true)
    let file_path: string | null = null
    if (file) {
      const safe = file.name.replace(/[^\w.\-]+/g, '_')
      file_path = `${requestId}/${Date.now()}-${safe}`
      const up = await supabase.storage.from(BUCKET).upload(file_path, file, { upsert: false })
      if (up.error) { setBusy(false); toast(up.error.message, 'err'); return }
    }
    const { error } = await supabase.from('crm_service_request_messages').insert({
      request_id: requestId, body: text || null, file_path, file_name: file?.name || null,
    })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setBody('')
    load()
  }

  async function open(m: Msg) {
    if (!m.file_path) return
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(m.file_path, 300)
    if (error || !data) { toast(error?.message || 'File non disponibile', 'err'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="rq-thread">
      {msgs.length === 0 ? (
        <div className="faint" style={{ fontSize: 12.5 }}>Ancora nessun messaggio. Qui passano aggiornamenti, report e file.</div>
      ) : (
        <div className="rq-msgs">
          {msgs.map(m => {
            const mine = m.author_id === profile?.id
            return (
              <div key={m.id} className={`rq-msg ${mine ? 'mine' : ''}`}>
                <div className="rq-meta">
                  <b>{mine ? 'Tu' : m.author_name || 'Utente'}</b>
                  {!mine && m.author_role && ROLE_TAG[m.author_role] && <span className="rq-tag">{ROLE_TAG[m.author_role]}</span>}
                  <span>{fmtDateTime(m.created_at)}</span>
                </div>
                {m.body && <div className="rq-body">{m.body}</div>}
                {m.file_path && (
                  <button className="rq-file" onClick={() => open(m)}>
                    <Icon name="file" size={15} /> <span>{m.file_name || 'File'}</span> <Icon name="download" size={14} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="rq-compose">
        <textarea className="input" rows={2} value={body} placeholder={placeholder || 'Scrivi un messaggio…'}
          onChange={e => setBody(e.target.value)} />
        <div className="flex gap" style={{ gap: 8, justifyContent: 'flex-end' }}>
          <input ref={fileRef} type="file" hidden onChange={e => { const f = e.target.files?.[0]; if (f) send(f); e.target.value = '' }} />
          <button className="btn btn-sm" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> File
          </button>
          <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()} onClick={() => send()}>
            <Icon name="send" size={14} /> Invia
          </button>
        </div>
      </div>
    </div>
  )
}
