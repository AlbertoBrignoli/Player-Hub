import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { toast } from '../lib/toast'
import { Spinner, Field, Input, Textarea, Empty } from '../components/ui'
import Icon from '../components/Icon'
import type { Brand } from '../lib/types'

// Scheda brand: il brand compila i propri dati di riferimento.
// admin/player vedono l'elenco dei brand collegati.
export default function BrandCard({ goto }: { goto?: (r: string) => void }) {
  const { session, profile, isBrand } = useAuth()
  const [loading, setLoading] = useState(true)
  const [brands, setBrands] = useState<Brand[]>([])

  const uid = session?.user.id
  async function load() {
    // Attende che la sessione sia pronta: senza uid la query brand tornerebbe vuota.
    if (isBrand && !uid) return
    let q = supabase.from('crm_brands').select('*').order('created_at')
    if (isBrand) q = q.eq('owner_id', uid)
    const { data } = await q
    setBrands((data as Brand[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [uid, isBrand]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />

  // --- Vista BRAND: la propria scheda editabile ---
  if (isBrand) {
    const mine = brands[0] || null
    return <BrandForm brand={mine} ownerId={session?.user.id || null} onSaved={load} goto={goto} />
  }

  // --- Vista AUVI/giocatore: elenco brand ---
  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card">
        <div className="faint" style={{ fontSize: 12.5 }}>
          I brand con accesso compilano qui la propria scheda. Per dare accesso a un nuovo brand,
          aggiungi la sua email in Impostazioni con ruolo “Brand”.
        </div>
      </div>
      {brands.length === 0 ? (
        <div className="card"><Empty icon={<Icon name="award" size={30} strokeWidth={1.4} />} title="Nessun brand collegato" hint="Autorizza un'email con ruolo Brand dalle Impostazioni." /></div>
      ) : brands.map(b => (
        <div className="card" key={b.id}>
          <div className="card-head">
            <div className="flex gap" style={{ alignItems: 'center', gap: 12 }}>
              <BrandLogo url={b.logo_url} name={b.name} size={40} />
              <div className="card-title">{b.name}</div>
            </div>
            {goto && <button className="btn btn-sm" onClick={() => goto('messages')}><Icon name="message" size={13} /> Chat</button>}
          </div>
          <div className="grid g3" style={{ gap: 10 }}>
            <Info k="Referente" v={b.contact_name} />
            <Info k="Ruolo" v={b.contact_role} />
            <Info k="Email" v={b.email} />
            <Info k="Telefono" v={b.phone} />
            <Info k="Sito" v={b.website} />
          </div>
          {b.notes && <div className="faint" style={{ fontSize: 13, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>{b.notes}</div>}
        </div>
      ))}
    </div>
  )
}

function BrandForm({ brand, ownerId, onSaved, goto }: { brand: Brand | null; ownerId: string | null; onSaved: () => void; goto?: (r: string) => void }) {
  const { profile } = useAuth()
  const [name, setName] = useState(brand?.name || '')
  const [contactName, setContactName] = useState(brand?.contact_name || profile?.full_name || '')
  const [contactRole, setContactRole] = useState(brand?.contact_role || '')
  const [email, setEmail] = useState(brand?.email || profile?.email || '')
  const [phone, setPhone] = useState(brand?.phone || '')
  const [website, setWebsite] = useState(brand?.website || '')
  const [notes, setNotes] = useState(brand?.notes || '')
  const [busy, setBusy] = useState(false)
  const [logoUrl, setLogoUrl] = useState(brand?.logo_url || '')
  const [logoBusy, setLogoBusy] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!brand) { toast('Salva prima la scheda, poi carica il logo.', 'err'); return }
    setLogoBusy(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${brand.id}/logo-${Date.now()}.${ext}`
    const up = await supabase.storage.from('brand-logos').upload(path, file, { upsert: true })
    if (up.error) { toast(up.error.message, 'err'); setLogoBusy(false); return }
    const url = supabase.storage.from('brand-logos').getPublicUrl(path).data.publicUrl
    const res = await supabase.from('crm_brands').update({ logo_url: url }).eq('id', brand.id)
    setLogoBusy(false)
    if (res.error) { toast(res.error.message, 'err'); return }
    setLogoUrl(url); toast('Logo aggiornato')
    if (logoRef.current) logoRef.current.value = ''
  }

  async function save() {
    if (!name.trim()) { toast('Inserisci il nome del brand.', 'err'); return }
    setBusy(true)
    const payload = { name: name.trim(), contact_name: contactName || null, contact_role: contactRole || null, email: email || null, phone: phone || null, website: website || null, notes: notes || null }
    const res = brand
      ? await supabase.from('crm_brands').update(payload).eq('id', brand.id)
      : await supabase.from('crm_brands').insert({ ...payload, owner_id: ownerId })
    setBusy(false)
    if (res.error) { toast(res.error.message, 'err'); return }
    toast('Scheda salvata')
    onSaved()
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flex gap" style={{ alignItems: 'center', gap: 16 }}>
        <BrandLogo url={logoUrl} name={name} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-kicker">La tua scheda</div>
          <div className="ed-display" style={{ fontSize: 24, marginTop: 4 }}>{name || 'Referente brand'}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>
            Carica il tuo logo ufficiale: comparirà nella scheda e sui contenuti che proponi.
          </div>
        </div>
        <div>
          <button className="btn btn-sm" disabled={logoBusy || !brand} onClick={() => logoRef.current?.click()}>
            <Icon name="upload" size={13} /> {logoBusy ? 'Carico…' : logoUrl ? 'Cambia logo' : 'Carica logo'}
          </button>
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" hidden onChange={onLogo} />
        </div>
      </div>

      <div className="card grid" style={{ gap: 12 }}>
        <Field label="Brand"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Under Armour" /></Field>
        <div className="grid g2" style={{ gap: 12 }}>
          <Field label="Persona di riferimento"><Input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Nome e cognome" /></Field>
          <Field label="Ruolo"><Input value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="Es. Sport Marketing Manager" /></Field>
        </div>
        <div className="grid g2" style={{ gap: 12 }}>
          <Field label="Email"><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Telefono"><Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+39…" /></Field>
        </div>
        <Field label="Sito web"><Input value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" /></Field>
        <Field label="Note (interessi, campagne, tempistiche…)"><Textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        <div className="flex gap" style={{ justifyContent: 'flex-end' }}>
          {goto && <button className="btn" onClick={() => goto('messages')}><Icon name="message" size={14} /> Scrivi all'atleta</button>}
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva scheda'}</button>
        </div>
      </div>
    </div>
  )
}

function Info({ k, v }: { k: string; v: any }) {
  return <div><div className="faint" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 650, fontSize: 13.5 }}>{v || '—'}</div></div>
}

// Logo del brand: mostra l'immagine se caricata, altrimenti un monogramma pulito.
export function BrandLogo({ url, name, size = 56 }: { url?: string | null; name?: string; size?: number }) {
  const initials = (name || 'Brand').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'B'
  const radius = Math.round(size * 0.24)
  if (url) {
    return (
      <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', flexShrink: 0, background: '#fff', border: '1px solid var(--border)', display: 'grid', placeItems: 'center' }}>
        <img src={url} alt={name || 'logo'} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      display: 'grid', placeItems: 'center', color: '#fff',
      background: 'linear-gradient(135deg,#1a1a1d,#0b0b0d)', border: '1px solid var(--border-2, var(--border))',
      fontFamily: 'var(--font-display, inherit)', fontWeight: 800, fontSize: size * 0.4, letterSpacing: '.5px',
    }}>{initials}</div>
  )
}
