import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { toast } from '../lib/toast'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'

const ACCENT = '#2E9BD6'
const BUCKET = 'crm-documents'

const TYPES: { k: string; l: string }[] = [
  { k: 'infortuni', l: 'Infortuni' }, { k: 'vita', l: 'Vita' }, { k: 'figli', l: 'Figli' },
  { k: 'casa', l: 'Casa' }, { k: 'auto', l: 'Auto' }, { k: 'altro', l: 'Altro' },
]
const typeLabel = (k: string) => TYPES.find(t => t.k === k)?.l || k

type Offer = {
  id: string; insurer_id: string; player_id: number | null; type: string; category: string; title: string
  description: string | null; price_hint: string | null; brochure_path: string | null; brochure_name: string | null; active: boolean
}

async function openPath(path: string) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (data?.signedUrl) window.open(data.signedUrl, '_blank')
}

// =================== PROPOSTE ===================
export function OffersTab({ athleteId, isInsurer, canInterest, uid }: { athleteId: number | null; isInsurer: boolean; canInterest: boolean; uid: string | null }) {
  const { t: tr } = useLang()
  const { athletes } = useAthlete()
  const [offers, setOffers] = useState<Offer[]>([])
  const [cat, setCat] = useState<'sport' | 'personale'>('sport')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)

  async function load() {
    setLoading(true)
    let q = supabase.from('crm_insurance_offers').select('*').order('created_at', { ascending: false })
    if (isInsurer) q = q.eq('insurer_id', uid)
    else q = q.eq('active', true)
    const { data } = await q
    setOffers((data as Offer[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [athleteId, isInsurer]) // eslint-disable-line react-hooks/exhaustive-deps

  async function interested(o: Offer) {
    const { error } = await supabase.rpc('crm_offer_interest', { p_offer_id: o.id })
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Interesse inviato al tuo assicuratore'))
  }
  async function del(o: Offer) {
    const { error } = await supabase.from('crm_insurance_offers').delete().eq('id', o.id)
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Proposta eliminata')); load()
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 14 }}>
      <div className="card flex between wrap gap" style={{ alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 800, color: ACCENT }}>{tr('Proposte')}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            {isInsurer ? 'Proposte che i tuoi atleti vedono nella loro area. Aggiungile e gestiscile qui.'
                       : 'Soluzioni pensate per te dal tuo assicuratore. Apri, leggi e segnala se ti interessano.'}
          </div>
        </div>
        {isInsurer && <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> Nuova proposta</button>}
      </div>

      {/* due grandi tab: Sport / Personale */}
      <div className="flex gap" style={{ gap: 12 }}>
        {([{ k: 'sport', l: 'Sport', icon: 'dumbbell' }, { k: 'personale', l: 'Personale', icon: 'home' }] as const).map(c => (
          <button key={c.k} onClick={() => setCat(c.k)}
            style={{ flex: 1, padding: 18, borderRadius: 16, cursor: 'pointer', fontWeight: 800, fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: cat === c.k ? ACCENT : 'var(--card)', color: cat === c.k ? '#fff' : 'var(--text)',
              border: '1px solid ' + (cat === c.k ? ACCENT : 'var(--border)') }}>
            <Icon name={c.icon} size={20} /> {c.l}
          </button>
        ))}
      </div>

      {(() => {
        const shown = offers.filter(o => (o.category || 'sport') === cat)
        if (shown.length === 0) return (
          <div className="card"><Empty icon={<Icon name="lock" size={28} strokeWidth={1.4} />}
            title={isInsurer ? `Nessuna proposta ${cat === 'sport' ? 'Sport' : 'Personale'}` : 'Nessuna proposta al momento'}
            hint={isInsurer ? 'Aggiungi una proposta con "Nuova proposta".' : 'Quando il tuo assicuratore aggiunge proposte, compaiono qui.'} /></div>
        )
        return (
          <div className="grid" style={{ gap: 12 }}>
            {shown.map(o => (
              <div key={o.id} className="card" style={{ opacity: o.active ? 1 : .55 }}>
                <div className="flex between" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="flex gap" style={{ alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <Badge>{tr(typeLabel(o.type))}</Badge>
                      {o.price_hint && <span style={{ fontSize: 12.5, fontWeight: 700, color: ACCENT }}>{o.price_hint}</span>}
                      {isInsurer && <span className="faint" style={{ fontSize: 11 }}>· {o.player_id ? (athletes.find(a => a.api_player_id === o.player_id)?.name || 'atleta') : 'tutti i tuoi atleti'}{o.active ? '' : ' · nascosta'}</span>}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }}>{o.title}</div>
                    {o.description && <div className="faint" style={{ fontSize: 13, marginTop: 4, whiteSpace: 'pre-wrap' }}>{o.description}</div>}
                  </div>
                </div>
                <div className="flex gap" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {o.brochure_path && <button className="btn btn-sm" onClick={() => openPath(o.brochure_path!)}><Icon name="file" size={13} /> {o.brochure_name || 'Brochure'}</button>}
                  {!isInsurer && canInterest && <button className="btn btn-primary btn-sm" onClick={() => interested(o)}><Icon name="check" size={13} /> Mi interessa</button>}
                  {isInsurer && <><button className="btn btn-sm" onClick={() => setEditing(o)}><Icon name="edit" size={13} /> Modifica</button>
                    <ConfirmButton onConfirm={() => del(o)}>{tr('Elimina')}</ConfirmButton></>}
                </div>
              </div>
            ))}
          </div>
        )
      })()}

      {editing && <OfferModal offer={editing === 'new' ? null : editing} uid={uid} defaultCategory={cat}
        onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </div>
  )
}

function OfferModal({ offer, uid, defaultCategory, onClose, onSaved }: { offer: Offer | null; uid: string | null; defaultCategory: 'sport' | 'personale'; onClose: () => void; onSaved: () => void }) {
  const { t: tr } = useLang()
  const { athletes } = useAthlete()
  const [f, setF] = useState<any>(offer || { type: 'infortuni', category: defaultCategory, title: '', description: '', price_hint: '', player_id: null, active: true, brochure_path: null, brochure_name: null })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }))

  async function uploadBrochure(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setUploading(true)
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    setUploading(false)
    if (up.error) { toast(up.error.message, 'err'); return }
    set('brochure_path', path); set('brochure_name', file.name); toast(tr('Brochure caricata'))
  }

  async function save() {
    if (!f.title.trim()) { toast(tr('Serve un titolo'), 'err'); return }
    setBusy(true)
    const payload = {
      insurer_id: uid, type: f.type, category: f.category || 'sport', title: f.title.trim(), description: f.description || null,
      price_hint: f.price_hint || null, player_id: f.player_id || null, active: f.active !== false,
      brochure_path: f.brochure_path || null, brochure_name: f.brochure_name || null, updated_at: new Date().toISOString(),
    }
    const res = offer
      ? await supabase.from('crm_insurance_offers').update(payload).eq('id', offer.id)
      : await supabase.from('crm_insurance_offers').insert(payload)
    setBusy(false)
    if (res.error) { toast(res.error.message, 'err'); return }
    toast(offer ? tr('Proposta aggiornata') : tr('Proposta creata')); onSaved()
  }

  return (
    <Modal title={offer ? tr('Modifica proposta') : tr('Nuova proposta')} onClose={onClose}
      footer={<div className="flex gap" style={{ marginLeft: 'auto' }}>
        <button className="btn" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? tr('Salvo…') : tr('Salva')}</button>
      </div>}>
      <div className="grid" style={{ gap: 12 }}>
        <div className="flex gap" style={{ gap: 10 }}>
          <Field label={tr("Categoria")}><Select value={f.category || 'sport'} onChange={e => set('category', e.target.value)}>
            <option value="sport">{tr('Sport')}</option><option value="personale">{tr('Personale')}</option>
          </Select></Field>
          <Field label={tr("Tipo")}><Select value={f.type} onChange={e => set('type', e.target.value)}>{TYPES.map(t => <option key={t.k} value={t.k}>{t.l}</option>)}</Select></Field>
          <Field label={tr("Prezzo indicativo")}><Input value={f.price_hint || ''} onChange={e => set('price_hint', e.target.value)} placeholder={tr("es. da 15€/mese")} /></Field>
        </div>
        <Field label={tr("Titolo")}><Input value={f.title} onChange={e => set('title', e.target.value)} placeholder={tr("es. Polizza infortuni extra-professionale")} /></Field>
        <Field label={tr("Descrizione / vantaggi")}><Textarea value={f.description || ''} onChange={e => set('description', e.target.value)} rows={4} placeholder={tr("Cosa copre, per chi è pensata, i vantaggi principali…")} /></Field>
        <Field label={tr("Destinatario")}>
          <Select value={f.player_id ? String(f.player_id) : ''} onChange={e => set('player_id', e.target.value ? Number(e.target.value) : null)}>
            <option value="">{tr('Tutti i miei atleti')}</option>
            {athletes.map(a => <option key={a.api_player_id} value={a.api_player_id}>{a.name}</option>)}
          </Select>
        </Field>
        <div>
          <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>{tr('Brochure (PDF/immagine, facoltativa)')}</div>
          <div className="flex gap" style={{ gap: 8, alignItems: 'center' }}>
            <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="upload" size={13} /> {uploading ? tr('Carico…') : f.brochure_path ? tr('Sostituisci') : tr('Carica')}</button>
            {f.brochure_path && <><button className="btn btn-ghost btn-sm" onClick={() => openPath(f.brochure_path)}>{tr('Apri')}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { set('brochure_path', null); set('brochure_name', null) }}>{tr('Rimuovi')}</button></>}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" hidden onChange={uploadBrochure} />
          </div>
        </div>
        <label className="flex gap" style={{ alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5 }}>
          <input type="checkbox" checked={f.active !== false} onChange={e => set('active', e.target.checked)} /> Visibile agli atleti
        </label>
      </div>
    </Modal>
  )
}

// =================== EDITORIALE (Perché / Il broker) ===================
export function EditorialTab({ slug, isInsurer, uid, defaultTitle, defaultBody }: {
  slug: string; isInsurer: boolean; uid: string | null; defaultTitle: string; defaultBody: string
}) {
  const { t: tr } = useLang()
  const [page, setPage] = useState<{ title: string; body: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    let q = supabase.from('crm_insurance_pages').select('title, body').eq('slug', slug)
    if (isInsurer) q = q.eq('insurer_id', uid)
    const { data } = await q.limit(1).maybeSingle()
    setPage(data as any || null)
    setLoading(false)
  }
  useEffect(() => { load() }, [slug, isInsurer]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true)
    const { error } = await supabase.from('crm_insurance_pages')
      .upsert({ insurer_id: uid, slug, title: title.trim() || defaultTitle, body, updated_at: new Date().toISOString() }, { onConflict: 'insurer_id,slug' })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    toast(tr('Salvato')); setEditing(false); load()
  }

  if (loading) return <Spinner />
  const shownTitle = page?.title || defaultTitle
  const shownBody = page?.body || defaultBody

  if (editing) {
    return (
      <div className="card grid" style={{ gap: 12 }}>
        <Field label="Titolo"><Input value={title} onChange={e => setTitle(e.target.value)} /></Field>
        <Field label={tr("Testo")}><Textarea value={body} onChange={e => setBody(e.target.value)} rows={14} /></Field>
        <div className="flex gap" style={{ marginLeft: 'auto' }}>
          <button className="btn" onClick={() => setEditing(false)}>Annulla</button>
          <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex between" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 10 }}>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -0.4 }}>{shownTitle}</div>
        {isInsurer && <button className="btn btn-sm" onClick={() => { setTitle(page?.title || defaultTitle); setBody(page?.body || defaultBody); setEditing(true) }}>
          <Icon name="edit" size={13} /> Modifica</button>}
      </div>
      <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--text)' }}>{shownBody}</div>
      {isInsurer && !page && <div className="faint" style={{ fontSize: 12, marginTop: 12 }}>Questo è un testo di partenza: premi "Modifica" per personalizzarlo. Lo vedono i tuoi atleti.</div>}
    </div>
  )
}

export const EDITORIAL_DEFAULTS: Record<string, { title: string; body: string }> = {
  why: {
    title: 'Perché assicurarti',
    body: `Il tuo corpo è il tuo capitale: un infortunio grave può ridurre o fermare la carriera. Le coperture giuste proteggono il tuo reddito quando conta davvero.

La carriera è breve, il patrimonio deve durare: casa, auto, famiglia, figli, viaggi e investimenti vanno protetti nel tempo.

Cosa controllare in una polizza:
•  Massimali — quanto copre davvero
•  Esclusioni — attenzione: spesso lo sport professionistico è escluso!
•  Franchigie e carenze — cosa paghi tu e da quando parte la copertura
•  Durata e diritto di rivalsa
•  Se copre l'attività agonistica`,
  },
  broker: {
    title: 'Il broker',
    body: `Il broker lavora per te, non per la compagnia: confronta il mercato e sceglie la copertura migliore per il tuo profilo.

•  Analizza i tuoi rischi reali (ruolo, età, contratto, patrimonio) ed elimina sovrapposizioni e buchi di tutela
•  Negozia condizioni e prezzi al posto tuo
•  Ti segue nei sinistri: gestisce la pratica per te
•  Aggiorna le coperture quando cambia la tua situazione — trasferimento, famiglia, nuovi beni

Hai una domanda? Scrivimi dalla chat: sono qui per aiutarti a scegliere con consapevolezza.`,
  },
}
