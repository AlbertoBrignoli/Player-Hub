import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { Spinner, Field, Input, Textarea } from '../components/ui'
import Icon from '../components/Icon'

// Profilo del procuratore: contatti personali + agenzia per cui lavora.
// L'agente lo modifica; l'atleta seguito lo vede in sola lettura.
const ACCENT = '#2E9BD6' // oro sobrio: area procura, distinta da brand (rosso) e fitness (verde)

const kicker: React.CSSProperties = {
  fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800,
}

type P = Record<string, any>

export default function InsurerProfile() {
  const { session, role } = useAuth()
  const { athletes } = useAthlete()
  const [p, setP] = useState<P>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const uid = session?.user.id
  const isAgent = role === 'assicuratore'

  useEffect(() => {
    if (!uid) return
    let ok = true
    ;(async () => {
      // L'agente vede il proprio; l'atleta vede quello di chi lo segue.
      let q = supabase.from('crm_insurer_profile').select('*')
      if (isAgent) q = q.eq('insurer_id', uid)
      const { data } = await q.limit(1).maybeSingle()
      if (!ok) return
      setP((data as P) || {})
      setLoading(false)
    })()
    return () => { ok = false }
  }, [uid, isAgent])

  const set = (k: string, v: any) => setP(prev => ({ ...prev, [k]: v }))

  // Upload immagini sul bucket pubblico: niente URL da incollare a mano.
  const photoRef = useRef<HTMLInputElement>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const [upl, setUpl] = useState('')

  async function upload(file: File, field: 'photo_url' | 'agency_logo_url') {
    if (!uid) return
    setUpl(field); setMsg('')
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    const path = `${uid}/${field === 'photo_url' ? 'foto' : 'logo'}-${Date.now()}.${ext}`
    const up = await supabase.storage.from('agent-profiles').upload(path, file, { upsert: true })
    if (up.error) { setUpl(''); setMsg(up.error.message); return }
    const { data } = supabase.storage.from('agent-profiles').getPublicUrl(path)
    set(field, data.publicUrl)
    setUpl('')
    setMsg('Immagine caricata — ricordati di salvare.')
  }

  async function save() {
    if (!uid) return
    setBusy(true); setMsg('')
    const { error } = await supabase.from('crm_insurer_profile')
      .upsert({ ...p, insurer_id: uid, updated_at: new Date().toISOString() })
    setBusy(false)
    setMsg(error ? error.message : 'Profilo salvato.')
  }

  if (loading) return <Spinner />

  // Vista in sola lettura per l'atleta seguito
  if (!isAgent) {
    if (!p.insurer_id) return null
    return (
      <div className="card" style={{ padding: 20 }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 14 }}>
          {p.photo_url
            ? <img src={p.photo_url} alt="" style={{ width: 56, height: 56, borderRadius: 14, objectFit: 'cover' }} />
            : <div style={{ width: 56, height: 56, borderRadius: 14, background: ACCENT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#111', fontSize: 20 }}>
                {(p.name || 'A').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ ...kicker, color: ACCENT }}>Il tuo assicuratore</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{p.name || 'Agente'}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>{[p.title, p.agency_name].filter(Boolean).join(' · ')}</div>
          </div>
        </div>
        <div className="grid g3" style={{ gap: 10, marginTop: 16 }}>
          <Info k="Email" v={p.email} href={p.email ? `mailto:${p.email}` : undefined} />
          <Info k="Telefono" v={p.phone} href={p.phone ? `tel:${p.phone}` : undefined} />
          <Info k="Agenzia" v={p.agency_name} />
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
                {(p.name || 'A').slice(0, 1)}
              </div>}
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...kicker, color: ACCENT }}>Assicuratore</div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.3, marginTop: 2 }}>
              {p.name || 'Il mio profilo'}
            </div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
              {[p.title, p.agency_name].filter(Boolean).join(' · ') || 'Completa i tuoi dati'}
            </div>
          </div>
          {p.agency_logo_url && (
            <div style={{ background: '#fff', borderRadius: 12, padding: 7, display: 'flex' }}>
              <img src={p.agency_logo_url} alt="" style={{ width: 40, height: 40, objectFit: 'contain' }} />
            </div>
          )}
          <div>
            <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>Assistiti</div>
            <div style={{ fontSize: 22, fontWeight: 900, borderBottom: `2px solid ${ACCENT}`, display: 'inline-block' }}>
              {athletes.length}
            </div>
          </div>
        </div>
      </div>

      {/* --- dati personali --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">I miei contatti</div></div>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label="Nome e cognome"><Input value={p.name || ''} onChange={e => set('name', e.target.value)} /></Field>
          <Field label="Ruolo"><Input value={p.title || ''} onChange={e => set('title', e.target.value)} placeholder="Es. Consulente assicurativo" /></Field>
          <Field label="Email"><Input value={p.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label="Telefono"><Input value={p.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label="WhatsApp"><Input value={p.whatsapp || ''} onChange={e => set('whatsapp', e.target.value)} /></Field>
          <Field label="Iscrizione RUI"><Input value={p.licence || ''} onChange={e => set('licence', e.target.value)} placeholder="Numero iscrizione" /></Field>
        </div>
        <Field label="Foto profilo">
          <div className="flex gap" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={upl === 'photo_url'} onClick={() => photoRef.current?.click()}>
              <Icon name="upload" size={13} /> {upl === 'photo_url' ? 'Carico…' : 'Carica foto'}
            </button>
            <input ref={photoRef} type="file" accept="image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'photo_url'); e.target.value = '' }} />
            {p.photo_url && <img src={p.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />}
          </div>
        </Field>
      </div>

      {/* --- agenzia --- */}
      <div className="card">
        <div className="card-head"><div className="card-title">Agenzia / Compagnia</div></div>
        <div className="faint" style={{ fontSize: 12, marginBottom: 12 }}>
          I dati dell'agenzia o compagnia per cui lavori: li vedono AUVI e gli atleti che segui.
        </div>
        <div className="grid g2" style={{ gap: 10 }}>
          <Field label="Agenzia / Compagnia"><Input value={p.agency_name || ''} onChange={e => set('agency_name', e.target.value)} /></Field>
          
          <Field label="Sito web"><Input value={p.agency_website || ''} onChange={e => set('agency_website', e.target.value)} placeholder="https://…" /></Field>
          
          <Field label="Email agenzia"><Input value={p.agency_email || ''} onChange={e => set('agency_email', e.target.value)} /></Field>
          <Field label="Telefono agenzia"><Input value={p.agency_phone || ''} onChange={e => set('agency_phone', e.target.value)} /></Field>
          
          
        </div>
        <Field label="Sede"><Input value={p.agency_address || ''} onChange={e => set('agency_address', e.target.value)} placeholder="Via, città, paese" /></Field>
        <Field label="Logo agenzia">
          <div className="flex gap" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" disabled={upl === 'agency_logo_url'} onClick={() => logoRef.current?.click()}>
              <Icon name="upload" size={13} /> {upl === 'agency_logo_url' ? 'Carico…' : 'Carica logo'}
            </button>
            <input ref={logoRef} type="file" accept="image/*" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, 'agency_logo_url'); e.target.value = '' }} />
            {p.agency_logo_url && <img src={p.agency_logo_url} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'contain', background: '#fff' }} />}
          </div>
        </Field>
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
