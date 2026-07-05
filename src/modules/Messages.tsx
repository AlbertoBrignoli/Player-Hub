import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime, initials } from '../lib/format'
import type { Message } from '../lib/types'

export default function Messages() {
  const { session, profile, isAdmin } = useAuth()
  const [rows, setRows] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  async function load() {
    const { data } = await supabase.from('crm_messages').select('*').order('created_at', { ascending: true })
    setRows((data as Message[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    const ch = supabase.channel('crm_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [rows.length])

  async function send() {
    if (!text.trim() || !session) return
    setBusy(true)
    const { error } = await supabase.from('crm_messages').insert({
      sender_id: session.user.id,
      sender_name: profile?.full_name || profile?.email,
      sender_role: profile?.role,
      body: text.trim(),
    })
    setBusy(false)
    if (!error) { setText(''); load() }
  }

  if (loading) return <Spinner />

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 190px)', padding: 0 }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {rows.length === 0 ? <Empty icon={<Icon name="message" size={30} strokeWidth={1.4} />} title="Nessun messaggio" hint="Inizia la conversazione diretta con il tuo referente." /> : (
          <div className="chat">
            {rows.map(m => {
              const mine = m.sender_id === session?.user.id
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {!mine && <div className="flex gap" style={{ marginBottom: 4, gap: 7 }}>
                    <div className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{initials(m.sender_name)}</div>
                    <span className="faint" style={{ fontSize: 11 }}>{m.sender_name} · {m.sender_role === 'admin' ? 'AUVI' : 'Giocatore'}</span>
                  </div>}
                  <div className={`bubble ${mine ? 'bubble-out' : 'bubble-in'}`}>
                    {m.body}
                    <div className="bubble-meta">{fmtDateTime(m.created_at)}</div>
                  </div>
                </div>
              )
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
      <div className="flex gap" style={{ padding: 14, borderTop: '1px solid var(--border)' }}>
        <input className="input" placeholder={isAdmin ? 'Scrivi al giocatore…' : 'Scrivi ad AUVI…'} value={text}
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
        <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={send}>Invia</button>
      </div>
    </div>
  )
}
