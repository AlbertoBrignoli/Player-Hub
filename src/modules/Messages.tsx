import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime, initials } from '../lib/format'
import type { Message, BrandLite } from '../lib/types'

// Canali: 'team' = giocatore <-> Alberto (Management) · 'fitness' = giocatore <-> preparatore
// 'brand:<id>' = giocatore <-> brand (es. Under Armour, solo per Zortea).
type Chan = { key: string; label: string; sub: string; icon: string; accent?: string | null; logo?: string | null }

const roleLabel = (r?: string | null) =>
  r === 'admin' ? 'Management' : r === 'preparatore' ? 'Preparatore' : r === 'brand' ? 'Brand' : 'Giocatore'

export default function Messages() {
  const { session, profile, isAdmin, role } = useAuth()
  const { athleteId } = useAthlete()
  const [rows, setRows] = useState<Message[]>([])
  const [brands, setBrands] = useState<BrandLite[]>([])
  const [coachName, setCoachName] = useState<string | null>(null)
  const [hasCoach, setHasCoach] = useState(false)
  const [chan, setChan] = useState<string>('team')
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  const isBrand = role === 'brand'
  const isCoach = role === 'preparatore'

  // Canali disponibili in base al ruolo e all'atleta attivo.
  const chans: Chan[] = isBrand
    ? brands.map(b => ({ key: `brand:${b.id}`, label: b.name, sub: 'Brand', icon: 'award', accent: b.accent_color, logo: b.logo_url }))
    : isCoach
      ? [{ key: 'fitness', label: 'Area Fitness', sub: 'Preparazione atletica', icon: 'dumbbell' }]
      : [
          { key: 'team', label: 'Alberto · Management', sub: 'AUVI Agency', icon: 'briefcase' },
          ...(hasCoach ? [{ key: 'fitness', label: coachName || 'Preparatore', sub: 'Preparazione atletica', icon: 'dumbbell' }] : []),
          ...brands.map(b => ({ key: `brand:${b.id}`, label: b.name, sub: 'Partner ufficiale', icon: 'award', accent: b.accent_color, logo: b.logo_url })),
        ]

  // Tiene il canale attivo sempre valido quando cambia atleta o ruolo.
  useEffect(() => {
    if (chans.length && !chans.some(c => c.key === chan)) setChan(chans[0].key)
  }, [chans.map(c => c.key).join('|')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Brand associati all'atleta attivo, letti dal roster (crm_brand_athletes).
  useEffect(() => {
    let ok = true
    ;(async () => {
      if (isBrand) {
        const { data } = await supabase.from('crm_brands').select('id, name, accent_color, logo_url')
        if (ok) setBrands((data as BrandLite[]) || [])
        return
      }
      if (!athleteId) { setBrands([]); return }
      const { data } = await supabase
        .from('crm_brand_athletes')
        .select('player_id, crm_brands(id, name, accent_color, logo_url)')
        .eq('player_id', athleteId)
      if (!ok) return
      const list = ((data as any[]) || [])
        .map(r => r.crm_brands)
        .filter(Boolean)
        .map((b: any) => ({ id: b.id, name: b.name, accent_color: b.accent_color, logo_url: b.logo_url })) as BrandLite[]
      setBrands(list)
    })()
    return () => { ok = false }
  }, [athleteId, isBrand])

  // Nome del preparatore assegnato, per etichettare il canale fitness.
  // Se l'atleta non ha un preparatore (es. Zortea), il canale non compare.
  useEffect(() => {
    let ok = true
    ;(async () => {
      if (!athleteId || isBrand) { setCoachName(null); setHasCoach(false); return }
      const { data: a } = await supabase.from('fitness_trainer_athletes')
        .select('trainer_id').eq('player_id', athleteId).limit(1).maybeSingle()
      const tid = (a as { trainer_id?: string } | null)?.trainer_id
      if (!ok) return
      if (!tid) { setCoachName(null); setHasCoach(false); return }
      setHasCoach(true)
      const { data: c } = await supabase.from('fitness_coach_profile')
        .select('name').eq('trainer_id', tid).maybeSingle()
      if (ok) setCoachName((c as { name?: string } | null)?.name || null)
    })()
    return () => { ok = false }
  }, [athleteId, isBrand])

  async function load() {
    if (!athleteId) { setRows([]); setLoading(false); return }
    let q = supabase.from('crm_messages').select('*').eq('player_id', athleteId).order('created_at', { ascending: true })
    // 'team' include anche i messaggi storici senza canale.
    q = chan === 'team' ? q.or('channel.is.null,channel.eq.team') : q.eq('channel', chan)
    const { data } = await q
    setRows((data as Message[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true); load()
    const ch = supabase.channel('crm_messages_rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'crm_messages' }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [athleteId, chan]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [rows.length])

  async function send() {
    if (!text.trim() || !session || !athleteId) return
    setBusy(true)
    const { error } = await supabase.from('crm_messages').insert({
      sender_id: session.user.id,
      sender_name: profile?.full_name || profile?.email,
      sender_role: profile?.role,
      body: text.trim(),
      player_id: athleteId,
      channel: chan,
    })
    setBusy(false)
    if (!error) { setText(''); load() }
  }

  const active = chans.find(c => c.key === chan)
  const placeholder = isAdmin || isCoach || isBrand
    ? 'Scrivi al giocatore…'
    : `Scrivi a ${active?.label || 'AUVI'}…`

  return (
    <div className="grid" style={{ gap: 10 }}>
      {chans.length > 1 && (
        <div className="pill-tabs wrap" style={{ alignSelf: 'start' }}>
          {chans.map(c => (
            <button key={c.key} className={`pill-tab ${chan === c.key ? 'active' : ''}`} onClick={() => setChan(c.key)}
              style={c.accent && chan === c.key ? { background: c.accent, color: '#fff', borderColor: c.accent } : undefined}>
              {c.logo
                ? <img src={c.logo} alt="" style={{ width: 14, height: 14, objectFit: 'contain', borderRadius: 3 }} />
                : <Icon name={c.icon} size={13} />} {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 250px)', padding: 0 }}>
        {active && (
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 11 }}>
            {active.accent && <span style={{ width: 3, height: 30, borderRadius: 2, background: active.accent }} />}
            {active.logo && <div style={{ background: '#fff', borderRadius: 8, padding: 4, display: 'flex' }}>
              <img src={active.logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
            </div>}
            <div>
              <div style={{ fontWeight: 800, fontSize: 14.5, textTransform: active.accent ? 'uppercase' : 'none', letterSpacing: active.accent ? .5 : 0 }}>{active.label}</div>
              <div className="faint" style={{ fontSize: 11.5 }}>{active.sub} · conversazione riservata</div>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? <Spinner /> : rows.length === 0 ? (
            <Empty icon={<Icon name="message" size={30} strokeWidth={1.4} />} title="Nessun messaggio"
              hint={`Inizia la conversazione con ${active?.label || 'il tuo referente'}.`} />
          ) : (
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
          <input className="input" placeholder={placeholder} value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="btn btn-primary" disabled={busy || !text.trim()} onClick={send}>Invia</button>
        </div>
      </div>
    </div>
  )
}
