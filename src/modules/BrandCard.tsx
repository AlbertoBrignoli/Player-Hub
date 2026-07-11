import { useEffect, useState } from 'react'
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

  async function load() {
    let q = supabase.from('crm_brands').select('*').order('created_at')
    if (isBrand) q = q.eq('owner_id', session?.user.id)
    const { data } = await q
    setBrands((data as Brand[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
            <div className="card-title">{b.name}</div>
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
      <div className="card">
        <div className="ed-kicker">La tua scheda</div>
        <div className="ed-display" style={{ fontSize: 24, marginTop: 4 }}>Referente brand</div>
        <div className="faint" style={{ fontSize: 12.5, marginTop: 6 }}>
          Compila i dati: così l'atleta e AUVI sanno chi contattare. Per parlare direttamente, usa la chat.
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
