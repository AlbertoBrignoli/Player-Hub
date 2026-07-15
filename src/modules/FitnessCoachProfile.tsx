import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Field, Input, Textarea, Empty } from '../components/ui'
import Icon from '../components/Icon'
import type { CoachProfile } from '../lib/types'

const ALL_SPEC = ['Performance', 'Strength', 'Return To Play', 'Speed', 'Mobility', 'Recovery', 'Prevenzione infortuni']
const ALL_SERV = ['Allenamento Online', 'Allenamento in presenza', 'Programmi personalizzati', 'Test atletici', 'Valutazioni', 'Video Analisi']
const label: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '22px 2px 10px' }
const chip = (on: boolean): React.CSSProperties => ({ padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontSize: 13, border: on ? '1.5px solid #C8FF2E' : '1px solid var(--border)', background: on ? 'rgba(200,255,46,.16)' : 'transparent' })

const empty = (tid: string): CoachProfile => ({ trainer_id: tid, verified: true, specializations: [], services: [], contacts: {} })

export default function FitnessCoachProfile({ goto }: { goto?: (r: string) => void }) {
  const { role, session } = useAuth()
  const { athleteId } = useAthlete()
  const isCoach = role === 'preparatore'
  const [p, setP] = useState<CoachProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [sentReq, setSentReq] = useState('')

  useEffect(() => {
    (async () => {
      let tid: string | null = isCoach ? (session?.user.id || null) : null
      if (!isCoach) {
        const { data } = await supabase.from('fitness_trainer_athletes').select('trainer_id').eq('player_id', athleteId).limit(1).maybeSingle()
        tid = (data as any)?.trainer_id || null
      }
      if (!tid) { setLoading(false); return }
      const { data: prof } = await supabase.from('fitness_coach_profile').select('*').eq('trainer_id', tid).maybeSingle()
      setP((prof as CoachProfile) || empty(tid))
      setLoading(false)
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />
  if (!p) return <Empty title="Nessun preparatore" hint={isCoach ? 'Completa il tuo profilo.' : 'Non hai ancora un preparatore assegnato.'} />

  const set = (k: keyof CoachProfile, v: any) => setP({ ...p, [k]: v })
  const setC = (k: string, v: string) => setP({ ...p, contacts: { ...(p.contacts || {}), [k]: v } })
  const toggle = (arr: 'specializations' | 'services', v: string) => {
    const cur = p[arr] || []
    set(arr, cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v])
  }

  async function save() {
    setBusy(true)
    await supabase.from('fitness_coach_profile').upsert({ ...p, updated_at: new Date().toISOString() }, { onConflict: 'trainer_id' })
    setBusy(false); setEditing(false)
  }

  async function request(type: 'programma' | 'allenamento' | 'messaggio') {
    if (!athleteId) return
    await supabase.from('fitness_requests').insert({ player_id: athleteId, trainer_id: p!.trainer_id, type })
    if (type === 'messaggio') { goto?.('messages'); return }
    setSentReq(type === 'programma' ? 'Richiesta di un nuovo programma inviata ✓' : 'Richiesta di prenotazione inviata ✓')
    setTimeout(() => setSentReq(''), 3000)
  }

  /* ---------------- EDIT (coach) ---------------- */
  if (isCoach && editing) {
    return (
      <div style={{ maxWidth: 820 }}>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Modifica profilo</div>
          <div className="flex gap">
            <button className="btn" onClick={() => setEditing(false)}>Annulla</button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Salvo…' : 'Salva'}</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12 }}>
          <Field label="Nome"><Input value={p.name || ''} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Ruolo / Club attuale"><Input value={p.headline || ''} onChange={e => set('headline', e.target.value)} placeholder="Preparatore Atletico · AEK Athens" /></Field>
          <Field label="Esperienza"><Input value={p.experience || ''} onChange={e => set('experience', e.target.value)} placeholder="10+ anni" /></Field>
          <Field label="Foto (URL)"><Input value={p.photo_url || ''} onChange={e => set('photo_url', e.target.value)} placeholder="https://…" /></Field>
        </div>
        <div style={label}>Biografia</div>
        <Field label="Metodo di lavoro"><Textarea rows={2} value={p.bio_method || ''} onChange={e => set('bio_method', e.target.value)} /></Field>
        <Field label="Filosofia"><Textarea rows={2} value={p.bio_philosophy || ''} onChange={e => set('bio_philosophy', e.target.value)} /></Field>
        <div style={label}>Curriculum</div>
        <Field label="Lauree / Master"><Textarea rows={2} value={p.education || ''} onChange={e => set('education', e.target.value)} /></Field>
        <Field label="Certificazioni"><Textarea rows={2} value={p.certifications || ''} onChange={e => set('certifications', e.target.value)} /></Field>
        <Field label="Squadre allenate / Esperienze"><Textarea rows={2} value={p.teams || ''} onChange={e => set('teams', e.target.value)} /></Field>
        <div style={label}>Specializzazioni</div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>
          {ALL_SPEC.map(s => <span key={s} style={chip((p.specializations || []).includes(s))} onClick={() => toggle('specializations', s)}>{s}</span>)}
        </div>
        <div style={label}>Servizi</div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>
          {ALL_SERV.map(s => <span key={s} style={chip((p.services || []).includes(s))} onClick={() => toggle('services', s)}>{s}</span>)}
        </div>
        <div style={label}>Disponibilità</div>
        <Field label="Note disponibilità"><Textarea rows={2} value={p.availability || ''} onChange={e => set('availability', e.target.value)} placeholder="Es. Lun-Ven 9-18, allenamenti online su appuntamento" /></Field>
        <div style={label}>Contatti</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
          <Field label="Email"><Input value={p.contacts?.email || ''} onChange={e => setC('email', e.target.value)} /></Field>
          <Field label="Telefono"><Input value={p.contacts?.phone || ''} onChange={e => setC('phone', e.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={p.contacts?.whatsapp || ''} onChange={e => setC('whatsapp', e.target.value)} placeholder="https://wa.me/…" /></Field>
          <Field label="Instagram"><Input value={p.contacts?.instagram || ''} onChange={e => setC('instagram', e.target.value)} /></Field>
          <Field label="LinkedIn"><Input value={p.contacts?.linkedin || ''} onChange={e => setC('linkedin', e.target.value)} /></Field>
          <Field label="Sito web"><Input value={p.contacts?.website || ''} onChange={e => setC('website', e.target.value)} /></Field>
        </div>
      </div>
    )
  }

  /* ---------------- VIEW ---------------- */
  const c = p.contacts || {}
  const links: [string, string | undefined][] = [['Email', c.email ? `mailto:${c.email}` : undefined], ['Telefono', c.phone ? `tel:${c.phone}` : undefined], ['WhatsApp', c.whatsapp], ['Instagram', c.instagram], ['LinkedIn', c.linkedin], ['Sito web', c.website]]
  return (
    <div style={{ maxWidth: 820 }}>
      {/* Header */}
      <div className="card" style={{ padding: 20, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
        {p.photo_url
          ? <img src={p.photo_url} alt="" style={{ width: 76, height: 76, borderRadius: 18, objectFit: 'cover' }} />
          : <div style={{ width: 76, height: 76, borderRadius: 18, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26 }}>{(p.name || 'C').slice(0, 1)}</div>}
        <div style={{ flex: 1, minWidth: 180 }}>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            <div style={{ fontSize: 21, fontWeight: 800 }}>{p.name || 'Preparatore'}</div>
            {p.verified && <span style={{ fontSize: 11, fontWeight: 700, color: '#3fb984', border: '1px solid #3fb984', borderRadius: 999, padding: '2px 8px' }}>✓ AUVI</span>}
          </div>
          <div className="faint" style={{ fontSize: 13.5, marginTop: 2 }}>{p.headline || 'Preparatore Atletico'}{p.experience ? ` · ${p.experience}` : ''}</div>
        </div>
        {isCoach && <button className="btn" onClick={() => setEditing(true)}><Icon name="edit" size={14} /> Modifica</button>}
      </div>

      {/* Azioni atleta */}
      {!isCoach && (
        <div className="flex gap" style={{ flexWrap: 'wrap', marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => request('programma')}>Richiedi un programma</button>
          <button className="btn" onClick={() => request('allenamento')}>Prenota allenamento</button>
          <button className="btn" onClick={() => request('messaggio')}>Invia messaggio</button>
        </div>
      )}
      {sentReq && <div style={{ color: '#3fb984', fontSize: 13, marginTop: 8 }}>{sentReq}</div>}

      {(p.bio_method || p.bio_philosophy) && <>
        <div style={label}>Biografia</div>
        <div className="card" style={{ padding: 16 }}>
          {p.bio_method && <p style={{ marginTop: 0 }}><b>Metodo:</b> {p.bio_method}</p>}
          {p.bio_philosophy && <p style={{ marginBottom: 0 }}><b>Filosofia:</b> {p.bio_philosophy}</p>}
        </div>
      </>}

      {(p.specializations || []).length > 0 && <>
        <div style={label}>Specializzazioni</div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>{(p.specializations || []).map(s => <span key={s} style={chip(true)}>{s}</span>)}</div>
      </>}

      {(p.services || []).length > 0 && <>
        <div style={label}>Servizi</div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>{(p.services || []).map(s => <span key={s} style={chip(false)}>{s}</span>)}</div>
      </>}

      {(p.education || p.certifications || p.teams) && <>
        <div style={label}>Curriculum</div>
        <div className="card" style={{ padding: 16 }}>
          {p.education && <p style={{ marginTop: 0 }}><b>Formazione:</b> {p.education}</p>}
          {p.certifications && <p><b>Certificazioni:</b> {p.certifications}</p>}
          {p.teams && <p style={{ marginBottom: 0 }}><b>Esperienze:</b> {p.teams}</p>}
        </div>
      </>}

      {p.availability && <>
        <div style={label}>Disponibilità</div>
        <div className="card" style={{ padding: 16 }}>{p.availability}</div>
      </>}

      {links.some(([, u]) => u) && <>
        <div style={label}>Contatti</div>
        <div className="flex gap" style={{ flexWrap: 'wrap' }}>
          {links.filter(([, u]) => u).map(([l, u]) => <a key={l} className="btn btn-sm" href={u} target="_blank" rel="noreferrer">{l} ↗</a>)}
        </div>
      </>}
    </div>
  )
}
