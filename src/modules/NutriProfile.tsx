import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner, Field, Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'

// Profilo del nutrizionista sportivo: lo compila lui, l'atleta lo vede in "Il mio team".
const ACCENT = '#4D7C0F'

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

type P = Record<string, any>

export default function NutriProfile() {
  const { session } = useAuth()
  const [p, setP] = useState<P>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const uid = session?.user.id

  useEffect(() => {
    if (!uid) return
    let ok = true
    supabase.from('crm_nutri_profile').select('*').eq('nutri_id', uid).maybeSingle()
      .then(({ data }) => { if (ok) { setP((data as P) || {}); setLoading(false) } })
    return () => { ok = false }
  }, [uid])

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
    const { error } = await supabase.from('crm_nutri_profile')
      .upsert({ ...p, nutri_id: uid, updated_at: new Date().toISOString() })
    setBusy(false)
    setMsg(error ? error.message : 'Profilo salvato.')
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 18 }}>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18,
                    background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div className="flex gap" style={{ alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: 58, height: 58, borderRadius: 15, objectFit: 'cover' }} />
            : <div style={{ width: 58, height: 58, borderRadius: 15, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 22, color: '#fff' }}>
                {(p.name || 'N').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: ACCENT }}>Nutrizionista sportivo</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>{p.name || 'Il mio profilo'}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>{p.title || 'Completa i tuoi dati: il tuo nome compare sulle indicazioni che dai agli atleti'}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Anagrafica e profilo professionale</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('name', 'Nome e cognome', 'Es. Dott.ssa Maria Rossi')}
          {F('title', 'Titolo professionale', 'Es. Biologa nutrizionista dello sport')}
          {F('licence', 'Albo / Iscrizione', "Numero iscrizione all'albo")}
          {F('languages', 'Lingue', 'Es. Italiano, Inglese')}
          {F('city', 'Città', 'Città, paese')}
          {F('years_experience', 'Anni di esperienza')}
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

      <div className="card">
        <div className="card-head"><div className="card-title">Contatti</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          {F('email', 'Email')}
          {F('phone', 'Telefono')}
          {F('whatsapp', 'WhatsApp')}
          {F('website', 'Sito web', 'https://…')}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">Esperienza e specializzazioni</div></div>
        {F('clubs', 'Club e atleti seguiti', 'Es. AEK, Nazionale U21…')}
        {A('specialties', 'Specializzazioni', 'Es. composizione corporea, integrazione, recupero, gestione del peso, trasferte…')}
        {A('bio', 'Presentazione', 'Percorso, metodo, approccio…', 4)}
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
