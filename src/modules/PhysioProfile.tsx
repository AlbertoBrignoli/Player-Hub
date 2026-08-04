import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner, Field, Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'

// Profilo/Registrazione del fisioterapista. Il fisio lo compila; l'atleta seguito
// lo vede in sola lettura. Stessi componenti/pattern dei ruoli esistenti.
const ACCENT = '#3E8E9E'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

type P = Record<string, any>

export default function PhysioProfile() {
  const { session, role } = useAuth()
  const [p, setP] = useState<P>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const uid = session?.user.id
  const isPhysio = role === 'fisioterapista'

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      let q = supabase.from('crm_physio_profile').select('*')
      if (isPhysio) q = q.eq('physio_id', uid)
      const { data } = await q.limit(1).maybeSingle()
      if (!ok) return
      setP((data as P) || {})
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid, isPhysio])

  const set = (k: string, v: any) => setP(prev => ({ ...prev, [k]: v }))
  const F = (k: string, label: string, ph = '') => (
    <Field label={label}><Input value={p[k] || ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></Field>
  )
  const A = (k: string, label: string, ph = '', rows = 2) => (
    <Field label={label}><Textarea rows={rows} value={p[k] || ''} onChange={e => set(k, e.target.value)} placeholder={ph} /></Field>
  )

  const photoRef = useRef<HTMLInputElement>(null)
  const [upl, setUpl] = useState(false)

  async function upload(file: File) {
    if (!uid) return
    setUpl(true); setMsg('')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${uid}/foto-${Date.now()}.${ext}`
    const up = await supabase.storage.from('agent-profiles').upload(path, file, { upsert: true })
    if (up.error) { setUpl(false); setMsg(up.error.message); return }
    const { data } = supabase.storage.from('agent-profiles').getPublicUrl(path)
    set('photo_url', data.publicUrl)
    setUpl(false)
    setMsg('Immagine caricata — ricordati di salvare.')
  }

  async function save() {
    if (!uid) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('crm_physio_profile')
      .upsert({ ...p, physio_id: uid, updated_at: new Date().toISOString() })
    setBusy(false)
    setMsg(error ? error.message : 'Profilo salvato.')
  }

  if (loading) return <Spinner />

  // Vista in sola lettura per l'atleta seguito
  if (!isPhysio) {
    if (!p.physio_id) return null
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 14 }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} />
            : <div style={{ width: 56, height: 56, borderRadius: 14, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#111', fontSize: 20 }}>
                {(p.name || 'F').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ ...kicker, color: ACCENT }}>Il tuo fisioterapista</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{p.name || 'Fisioterapista'}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{p.title || ''}</div>
          </div>
        </div>
        <div className="grid g3" style={{ gap: 10, marginTop: 16 }}>
          <Info k="Email" v={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
          <Info k="Telefono" v={p.phone} href={p.phone ? `tel:${p.phone}` : undefined} />
          <Info k="Lingue" v={p.languages} />
          <Info k="Specializzazioni" v={p.sports} />
          <Info k="Tecniche" v={p.techniques} />
          <Info k="Studio" v={p.clinic_name} />
        </div>
      </div>
    )
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* --- intestazione --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: 58, height: 58, borderRadius: 15, objectFit: 'cover' }} />
            : <div style={{ width: 58, height: 58, borderRadius: 15, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#111' }}>
                {(p.name || 'F').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: ACCENT }}>Fisioterapista</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>
              {p.name || 'Il mio profilo'}
            </div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {p.title || 'Completa i tuoi dati'}
            </div>
          </div>
        </div>
      </div>

      {/* --- 1 · anagrafica e profilo professionale --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Anagrafica e profilo professionale</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('name', 'Nome e cognome')}
          {F('title', 'Titolo professionale', 'Es. Fisioterapista dello sport')}
          {F('licence', "Albo / Iscrizione", "Numero iscrizione all'albo")}
          {F('languages', 'Lingue', 'Es. Italiano, Inglese, Greco')}
          {F('city', 'Città', 'Città, paese')}
        </div>
        <Field label="Foto profilo">
          <div className="flex gap" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={upl} onClick={() => photoRef.current?.click()}>
              <Icon name="upload" size={13} /> {upl ? 'Carico…' : 'Carica foto'}
            </button>
            <input ref={photoRef} type="file" accept="image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
            {p.photo_url && <img src={p.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />}
          </div>
        </Field>
      </div>

      {/* --- 2 · contatti --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Contatti</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('email', 'Email')}
          {F('phone', 'Telefono')}
          {F('whatsapp', 'WhatsApp')}
          {F('website', 'Sito web', 'https://…')}
        </div>
      </div>

      {/* --- 3 · qualifiche professionali --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Qualifiche professionali</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('degree', 'Laurea', 'Es. Laurea in Fisioterapia')}
          {F('masters', 'Master / Specializzazioni post-laurea')}
        </div>
        {A('certifications', 'Certificazioni', 'Elenca le certificazioni professionali…')}
        {F('insurance', 'Assicurazione professionale', 'Compagnia · numero polizza')}
      </div>

      {/* --- 4 · esperienza --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Esperienza</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('clubs', 'Club professionistici', 'Es. AEK, Bologna…')}
          {F('national_teams', 'Nazionali')}
          {F('years_experience', 'Anni di esperienza')}
          {F('clinic_name', 'Cliniche / Centri', 'Centri riabilitativi')}
        </div>
        {A('experience_desc', 'Descrizione', 'Racconta il tuo percorso ed esperienza…', 3)}
      </div>

      {/* --- 5 · specializzazioni --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Specializzazioni</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('sports', 'Sport', 'Es. Calcio, Basket…')}
          {F('body_areas', 'Aree del corpo', 'Es. Ginocchio, Spalla…')}
          {F('pathologies', 'Patologie', 'Es. Lesioni muscolari…')}
          {F('techniques', 'Tecniche', 'Es. Terapia manuale…')}
        </div>
        {A('methods', 'Metodi di trattamento', 'Metodi e approcci che utilizzi…')}
      </div>

      {/* --- 6 · studio / clinica --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Studio / Clinica</div></div>
        {F('clinic_address', 'Indirizzo', 'Via, città, paese')}
        {A('clinic_facilities', 'Strutture disponibili', 'Es. palestra, piscina, sala valutazione, parcheggio, accessibilità…')}
      </div>

      {/* --- 7 · disponibilità --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Disponibilità</div></div>
        {A('availability', 'Modalità', 'Es. In studio, a domicilio, online, ritiri, trasferte internazionali…')}
        <div className="grid g2" style={{ gap: 10 }}>
          {F('working_days', 'Giorni lavorativi', 'Es. Lun–Ven')}
          {F('working_hours', 'Orari', 'Es. 09:00–19:00')}
        </div>
      </div>

      {/* --- biografia --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Biografia</div></div>
        {A('bio', 'Presentazione', 'Percorso, esperienza, approccio…', 4)}
        {A('notes', 'Note', '', 2)}
      </div>

      <div className="flex gap" style={{ alignItems: 'center', gap: 12, position: 'sticky', bottom: 0 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>
          <Icon name="check" size={14} /> {busy ? 'Salvo…' : 'Salva profilo'}
        </button>
        {msg && <span className="faint" style={{ fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  )
}

function Info({ k, v, href }: { k: string; v?: string; href?: string }) {
  return (
    <div>
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700 }}>{k}</div>
      <div style={{ fontSize: 13.5, marginTop: 2 }}>
        {v ? (href ? <a href={href} style={{ color: ACCENT }}>{v}</a> : v) : '—'}
      </div>
    </div>
  )
}
