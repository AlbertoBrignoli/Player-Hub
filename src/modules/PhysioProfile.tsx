import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { Spinner, Field, Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'

// Profilo del fisioterapista (Sezione 1 · Registrazione): anagrafica, profilo
// professionale, lingue, contatti e biografia. Il fisio lo modifica; l'atleta
// seguito lo vede in sola lettura. Stessi componenti/pattern dei ruoli esistenti.
const ACCENT = '#3E8E9E' // verde-acqua sobrio: area clinica, distinta dagli altri ruoli

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

      {/* --- anagrafica e profilo professionale --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Anagrafica e profilo professionale</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label="Nome e cognome"><Input value={p.name || ''} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Titolo professionale"><Input value={p.title || ''} onChange={e => set('title', e.target.value)} placeholder="Es. Fisioterapista dello sport" /></Field>
          <Field label="Albo / Iscrizione"><Input value={p.licence || ''} onChange={e => set('licence', e.target.value)} placeholder="Numero iscrizione all'albo" /></Field>
          <Field label="Lingue"><Input value={p.languages || ''} onChange={e => set('languages', e.target.value)} placeholder="Es. Italiano, Inglese, Greco" /></Field>
          <Field label="Città"><Input value={p.city || ''} onChange={e => set('city', e.target.value)} placeholder="Città, paese" /></Field>
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

      {/* --- contatti --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Contatti</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label="Email"><Input value={p.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Telefono"><Input value={p.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={p.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} /></Field>
          <Field label="Sito web"><Input value={p.website || ''} onChange={e => set('website', e.target.value)} placeholder="https://…" /></Field>
        </div>
      </div>

      {/* --- biografia --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Biografia</div></div>
        <Field label="Presentazione"><Textarea rows={4} value={p.bio || ''} onChange={e => set('bio', e.target.value)} placeholder="Percorso, esperienza, approccio…" /></Field>
        <Field label="Note"><Textarea rows={2} value={p.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      </div>

      <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
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
