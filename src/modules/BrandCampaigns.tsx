import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { notify } from '../lib/notify'
import { toast } from '../lib/toast'
import { Modal, Field, Input, Select, Textarea, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, isImageFile } from '../lib/format'
import type { EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'

// Formati pubblicabili (mappati sul campo `type` del calendario editoriale).
const FORMATS: { k: EditorialEntry['type']; label: string; icon: string }[] = [
  { k: 'post', label: 'Post feed', icon: 'file' },
  { k: 'story', label: 'Story', icon: 'smartphone' },
  { k: 'reel', label: 'Reel', icon: 'activity' },
  { k: 'carosello', label: 'Carosello', icon: 'layers' },
]
const fmtLabel = (t: string) => FORMATS.find(f => f.k === t)?.label || t

// Stato leggibile per il brand.
function brandStatus(s: string): { label: string; tone?: 'green' | 'blue' | 'gold' } {
  if (s === 'pubblicato') return { label: 'Pubblicato dall’atleta', tone: 'green' }
  return { label: 'Inviato · in attesa di pubblicazione', tone: 'blue' }
}

// Vista brand: propone contenuti e carica il materiale dello shooting.
export default function BrandCampaigns() {
  const { session } = useAuth()
  const { athleteId, athletes } = useAthlete()
  const uid = session?.user.id
  const [loading, setLoading] = useState(true)
  const [brand, setBrand] = useState<{ id: string; name: string } | null>(null)
  const [rows, setRows] = useState<EditorialEntry[]>([])
  const [editing, setEditing] = useState<EditorialEntry | 'new' | null>(null)

  const athleteName = athletes.find(a => a.api_player_id === athleteId)?.name || 'l’atleta'

  async function load() {
    if (!uid) return
    setLoading(true)
    // RLS: l'utente brand vede solo la propria area (aggancio via whitelist, non via owner)
    const b = await supabase.from('crm_brands').select('id, name').limit(1).maybeSingle()
    setBrand((b.data as any) || null)
    if (b.data) {
      const { data } = await supabase.from('crm_editorial').select('*')
        .eq('brand_id', (b.data as any).id).order('entry_date', { ascending: false })
      setRows((data as EditorialEntry[]) || [])
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [uid]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />
  if (!brand) return <Empty icon={<Icon name="award" size={28} strokeWidth={1.4} />} title="Nessun brand collegato" hint="Contatta AUVI Agency." />

  const upcoming = rows.filter(r => r.status !== 'pubblicato')
  const done = rows.filter(r => r.status === 'pubblicato')

  return (
    <div style={{ maxWidth: 900 }} className="grid">
      <div className="card mk-social-head" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="mk-ig-badge" style={{ background: 'linear-gradient(135deg,#e10b17,#7a0410)' }}><Icon name="image" size={20} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ed-kicker">Campagne & contenuti</div>
          <div style={{ fontWeight: 750, fontSize: 17 }}>Proponi contenuti a {athleteName}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>
            Carica lo shooting, prepara caption e hashtag: l’atleta li trova pronti nel suo calendario, con un tap per scaricare e copiare.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> Nuovo contenuto</button>
      </div>

      {rows.length === 0 ? (
        <div className="card"><Empty icon={<Icon name="image" size={30} strokeWidth={1.3} />} title="Ancora nessun contenuto" hint="Crea il primo: scegli il formato, carica le foto/video e scrivi caption e hashtag." /></div>
      ) : (
        <>
          <Section title="Da pubblicare" items={upcoming} onOpen={setEditing} />
          <Section title="Pubblicati" items={done} onOpen={setEditing} />
        </>
      )}

      {editing && brand && athleteId && (
        <ContentEditor
          entry={editing} brandId={brand.id} brandName={brand.name}
          athleteId={athleteId} athleteName={athleteName} uid={uid || null}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

function Section({ title, items, onOpen }: { title: string; items: EditorialEntry[]; onOpen: (e: EditorialEntry) => void }) {
  if (!items.length) return null
  return (
    <div>
      <div className="ed-masthead"><div className="ed-masthead-t">{title} · {items.length}</div><div className="ed-rule" /></div>
      <div className="grid g2" style={{ gap: 12 }}>
        {items.map(e => {
          const st = brandStatus(e.status)
          return (
            <button key={e.id} className="card" style={{ textAlign: 'left', cursor: 'pointer', border: '1px solid var(--border)' }} onClick={() => onOpen(e)}>
              <div className="flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontWeight: 700 }}>{e.title}</div>
                <Badge tone={st.tone}>{st.label}</Badge>
              </div>
              <div className="flex gap wrap" style={{ marginTop: 8, alignItems: 'center' }}>
                <Badge>{fmtLabel(e.type)}</Badge>
                <span className="faint" style={{ fontSize: 12.5 }}>{fmtDate(e.entry_date)}</span>
              </div>
              {e.copy_text && <div className="faint" style={{ fontSize: 12.5, marginTop: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.copy_text}</div>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ContentEditor({ entry, brandId, brandName, athleteId, athleteName, uid, onClose, onSaved }: {
  entry: EditorialEntry | 'new'; brandId: string; brandName: string; athleteId: number; athleteName: string
  uid: string | null; onClose: () => void; onSaved: () => void
}) {
  const isNew = entry === 'new'
  const e = isNew ? null : entry as EditorialEntry
  const [title, setTitle] = useState(e?.title || '')
  const [type, setType] = useState<EditorialEntry['type']>(e?.type || 'post')
  const [date, setDate] = useState(e?.entry_date || new Date().toISOString().slice(0, 10))
  const [copy, setCopy] = useState(e?.copy_text || '')
  const [hashtags, setHashtags] = useState(e?.hashtags || '')
  const [brief, setBrief] = useState(e?.brief || '')
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const [entryId, setEntryId] = useState<string | null>(e?.id || null)

  async function loadMedia(id: string) {
    const { data } = await supabase.from('crm_media').select('*').eq('editorial_id', id).order('created_at')
    const items = (data as MediaItem[]) || []
    setMedia(items)
    const paths = items.map(m => m.storage_path)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      const next: Record<string, string> = {}
      signed?.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
      setUrls(u => ({ ...u, ...next }))
    }
  }
  useEffect(() => { if (entryId) loadMedia(entryId) }, [entryId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Garantisce che la voce esista prima di caricare i file (serve l'id per il path).
  async function ensureEntry(): Promise<string | null> {
    if (entryId) {
      await supabase.from('crm_editorial').update({
        title: title.trim() || 'Contenuto', type, entry_date: date,
        copy_text: copy || null, hashtags: hashtags || null, brief: brief || null,
      }).eq('id', entryId)
      return entryId
    }
    if (!title.trim()) { toast('Dai un titolo al contenuto', 'err'); return null }
    const { data, error } = await supabase.from('crm_editorial').insert({
      player_id: athleteId, brand_id: brandId, type, title: title.trim(), entry_date: date,
      copy_text: copy || null, hashtags: hashtags || null, brief: brief || null, status: 'pronto',
    }).select('id').single()
    if (error) { toast(error.message, 'err'); return null }
    const id = (data as any).id as string
    setEntryId(id)
    return id
  }

  async function onUpload(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files || [])
    if (!files.length) return
    setUploading(true)
    const id = await ensureEntry()
    if (!id) { setUploading(false); return }
    let ok = 0
    for (const file of files) {
      const path = `editorial/${id}/brand-${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(up.error.message, 'err'); continue }
      const ins = await supabase.from('crm_media').insert({
        storage_path: path, file_name: file.name, kind: 'grafica', status: 'pubblicata',
        editorial_id: id, folder: 'Brand', uploaded_by: uid, uploaded_role: 'brand',
        note: title.trim() || 'Contenuto brand', player_id: athleteId,
      })
      if (!ins.error) ok++
    }
    if (ok) toast(`${ok} file caricat${ok > 1 ? 'i' : 'o'}`)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    loadMedia(id)
  }

  async function removeAsset(m: MediaItem) {
    await supabase.storage.from(BUCKET).remove([m.storage_path])
    await supabase.from('crm_media').delete().eq('id', m.id)
    if (entryId) loadMedia(entryId)
  }

  async function save(sendNotify: boolean) {
    setBusy(true)
    const id = await ensureEntry()
    setBusy(false)
    if (!id) return
    if (sendNotify) {
      notify('player', `Nuovo contenuto da ${brandName}`,
        `“${title.trim()}” è pronto nel tuo calendario editoriale: scarica e pubblica.`, 'editorial', athleteId)
      toast(`Inviato a ${athleteName}`)
    } else toast('Salvato')
    onSaved()
  }

  async function removeEntry() {
    if (!entryId) { onClose(); return }
    for (const m of media) await supabase.storage.from(BUCKET).remove([m.storage_path])
    await supabase.from('crm_media').delete().eq('editorial_id', entryId)
    await supabase.from('crm_editorial').delete().eq('id', entryId)
    onSaved()
  }

  return (
    <Modal title={isNew ? 'Nuovo contenuto' : title || 'Contenuto'} onClose={onClose} wide
      footer={
        <div className="flex between wrap gap" style={{ width: '100%' }}>
          {!isNew ? <ConfirmButton onConfirm={removeEntry}>Elimina</ConfirmButton> : <span />}
          <div className="flex gap">
            <button className="btn" onClick={onClose}>Chiudi</button>
            <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>{busy ? 'Salvo…' : (isNew ? 'Invia all’atleta' : 'Salva e avvisa')}</button>
          </div>
        </div>
      }>
      <div className="grid" style={{ gap: 14 }}>
        <Field label="Titolo del contenuto"><Input value={title} onChange={ev => setTitle(ev.target.value)} placeholder="Es. Shooting UA — lancio scarpe" /></Field>
        <div className="grid g2" style={{ gap: 12 }}>
          <Field label="Formato">
            <Select value={type} onChange={ev => setType(ev.target.value as EditorialEntry['type'])}>
              {FORMATS.map(f => <option key={f.k} value={f.k}>{f.label}</option>)}
            </Select>
          </Field>
          <Field label="Quando pubblicare"><Input type="date" value={date} onChange={ev => setDate(ev.target.value)} /></Field>
        </div>

        <Field label="Caption / copy del post">
          <Textarea rows={4} value={copy} onChange={ev => setCopy(ev.target.value)} placeholder="Il testo pronto da incollare nel post…" />
        </Field>
        <Field label="Hashtag">
          <Textarea rows={2} value={hashtags} onChange={ev => setHashtags(ev.target.value)} placeholder="#underarmour #ua #performance …" />
        </Field>
        <Field label="Istruzioni (come e quando pubblicare, tag da menzionare…)">
          <Textarea rows={2} value={brief} onChange={ev => setBrief(ev.target.value)} placeholder="Es. Pubblicare venerdì ore 18, taggare @underarmour, story con link…" />
        </Field>

        <div>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 650 }}>Materiale dello shooting <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}>{media.length ? `· ${media.length} file` : ''}</span></div>
            <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploading ? 'Carico…' : 'Carica foto/video'}
            </button>
            <input ref={fileRef} type="file" multiple accept="image/*,video/*" hidden onChange={onUpload} />
          </div>
          {media.length === 0
            ? <div className="faint" style={{ fontSize: 12.5, padding: '6px 0' }}>Carica qui le foto e i video del contenuto: l’atleta potrà scaricarli con un tap.</div>
            : (
              <div className="asset-grid">
                {media.map(m => (
                  <div className="asset-card" key={m.id} title={m.file_name || ''} style={{ position: 'relative' }}>
                    {isImageFile(m.file_name) && urls[m.storage_path]
                      ? <img src={urls[m.storage_path]} alt="" loading="lazy" />
                      : <div className="asset-ph"><Icon name="camera" size={20} strokeWidth={1.4} /></div>}
                    <button className="asset-del" title="Rimuovi" onClick={() => removeAsset(m)}><Icon name="x" size={12} /></button>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </Modal>
  )
}
