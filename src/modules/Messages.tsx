import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime, initials } from '../lib/format'
import type { Message, Brand } from '../lib/types'

interface Channel { key: string; label: string }

export default function Messages() {
  const { session, profile, isAdmin, isBrand } = useAuth()
  const { athleteId } = useAthlete()
  const [rows, setRows] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [channels, setChannels] = useState<Channel[]>([])
  const [active, setActive] = useState<string>('team')
  const endRef = useRef<HTMLDivElement>(null)

  // Elenco canali: il brand ha solo il proprio; team/AUVI ha 'team' + un canale per brand.
  useEffect(() => {
    (async () => {
      if (isBrand) {
        const { data } = await supabase.from('crm_brands').select('id,name').eq('owner_id', session?.user.id).maybeSingle()
        if (data) { setChannels([{ key: `brand:${(data as any).id}`, label: 'AUVI Agency' }]); setActive(`brand:${(data as any).id}`) }
        else { setChannels([]); setActive('') }
      } else {
        const { data } = await supabase.from('crm_brands').select('*').order('created_at')
        const brandChans = ((data as Brand[]) || []).map(b => ({ key: `brand:${b.id}`, label: b.name }))
        setChannels([{ key: 'team', label: 'Team' }, ...brandChans])
        setActive('team')
      }
    })()
  }, [isBrand]) // eslint-disable-line react-hooks/exhaustive-deps

  async function load(ch = active) {
    if (!ch) { setLoading(false); return }
    let q = supabase.from('crm_messages').select('*').order('created_at', { ascending: true })
    if (ch === 'team') {
      // chat interna: legata all'atleta selezionato (multi-atleta)
      if (!athleteId) { setRows([]); setLoading(false); return }
      q = q.eq('player_id', athleteId).or('channel.is.null,channel.eq.team')
    } else {
      q = q.eq('channel', ch)
    }
    const { data } = await q
    setRows((data as Message[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!active) return
    setLoading(true); load(active)
    const rt = supabase.channel('crm_messages_rt_' + active)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, () => load(active))
      .subscribe()
    return () => { supabase.removeChannel(rt) }
  }, [active, athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [rows.length])

  async function send() {
    if (!text.trim() || !session || !active) return
    setBusy(true)
    const { error } = await supabase.from('crm_messages').insert({
      sender_id: session.user.id,
      sender_name: profile?.full_name || profile?.email,
      sender_role: profile?.role,
      body: text.trim(),
      player_id: active === 'team' ? athleteId : null,
      channel: active === 'team' ? null : active,
    })
    setBusy(false)
    if (!error) { setText(''); load(active) }
  }

  const roleLabel = (r?: string | null) => r === 'admin' ? 'AUVI' : r === 'brand' ? 'Brand' : r === 'creator' ? 'Team' : 'Giocatore'

  if (isBrand && channels.length === 0) {
    return <div className="card"><Empty icon={<Icon name="message" size={30} strokeWidth={1.4} />} title="Compila prima la tua scheda" hint="Vai su “La mia scheda”, salva i dati del brand e la chat con AUVI si attiva." /></div>
  }
  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 12 }}>
      {channels.length > 1 && (
        <div className="pill-tabs wrap" style={{ alignSelf: 'start' }}>
          {channels.map(c => (
            <button key={c.key} className={`pill-tab ${active === c.key ? 'active' : ''}`} onClick={() => setActive(c.key)}>{c.label}</button>
          ))}
        </div>
      )}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 230px)', padding: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {rows.length === 0 ? <Empty icon={<Icon name="message" size={30} strokeWidth={1.4} />} title="Nessun messaggio" hint={active.startsWith('brand') ? 'Scrivi il primo messaggio.' : 'Inizia la conversazione diretta.'} /> : (
            <div className="chat">
              {rows.map(m => {
                const mine = m.sender_id === session?.user.id
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                    {!mine && <div className="flex gap" style={{ marginBottom: 4, gap: 7 }}>
                      <div className="avatar" style={{ width: 22, height: 22, fontSize: 10 }}>{initials(m.sender_name)}</div>
                      <span className="faint" style={{ fontSize: 11 }}>{m.sender_name} · {roleLabel(m.sender_role)}</span>
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
          <input className="input" placeholder={isBrand ? 'Scrivi ad AUVI…' : active.startsWith('brand') ? 'Scrivi al brand…' : isAdmin ? 'Scrivi al giocatore…' : 'Scrivi ad AUVI…'} value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={send}>Invia</button>
        </div>
      </div>
    </div>
  )
}
