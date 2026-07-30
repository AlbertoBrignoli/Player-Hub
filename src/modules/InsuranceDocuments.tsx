import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { toast } from '../lib/toast'
import { Modal, Field, Input, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, initials } from '../lib/format'

const BUCKET = 'crm-documents'
const ACCENT = '#2E9BD6'

type Folder = { id: string; name: string; parent_id: string | null }
type Doc = { id: string; name: string; file_path: string | null; mime: string | null; size: number | null; created_at: string; folder_id: string | null }
type Athlete = { api_player_id: number; name: string; photo_url?: string | null }

// Mini-desktop documenti dell'assicuratore: una cartella per atleta (solo i suoi),
// sottocartelle libere dentro, file caricati da lui. Isolato per RLS: qui c'è solo
// la sua roba, mai i documenti generali dell'atleta.
export default function InsuranceDocuments() {
  const { session } = useAuth()
  const { t } = useLang()
  const { athletes } = useAthlete()
  const [atleta, setAtleta] = useState<Athlete | null>(null)
  const [stack, setStack] = useState<{ id: string; name: string }[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<Doc[]>([])
  const [loading, setLoading] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [newFolderOpen, setNewFolderOpen] = useState(false)

  const currentFolderId = stack.length ? stack[stack.length - 1].id : null

  async function load() {
    if (!atleta) { setFolders([]); setFiles([]); return }
    setLoading(true)
    let fq = supabase.from('crm_doc_folders').select('id, name, parent_id').eq('player_id', atleta.api_player_id)
    fq = currentFolderId ? fq.eq('parent_id', currentFolderId) : fq.is('parent_id', null)
    let dq = supabase.from('crm_documents').select('id, name, file_path, mime, size, created_at, folder_id').eq('player_id', atleta.api_player_id)
    dq = currentFolderId ? dq.eq('folder_id', currentFolderId) : dq.is('folder_id', null)
    const [{ data: fd }, { data: dd }] = await Promise.all([fq.order('name'), dq.order('created_at', { ascending: false })])
    setFolders((fd as Folder[]) || [])
    setFiles((dd as Doc[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [atleta, currentFolderId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function openFile(d: Doc) {
    if (!d.file_path) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function delFile(d: Doc) {
    const { error } = await supabase.from('crm_documents').delete().eq('id', d.id)
    if (error) { toast(error.message, 'err'); return }
    if (d.file_path) await supabase.storage.from(BUCKET).remove([d.file_path])
    toast(t('Documento eliminato')); load()
  }

  async function delFolder(f: Folder) {
    // solo cartelle vuote, per evitare cancellazioni a catena inattese
    const [{ count: nf }, { count: ndoc }] = await Promise.all([
      supabase.from('crm_doc_folders').select('id', { count: 'exact', head: true }).eq('parent_id', f.id),
      supabase.from('crm_documents').select('id', { count: 'exact', head: true }).eq('folder_id', f.id),
    ])
    if ((nf || 0) > 0 || (ndoc || 0) > 0) { toast(t('Svuota prima la cartella per eliminarla.'), 'err'); return }
    const { error } = await supabase.from('crm_doc_folders').delete().eq('id', f.id)
    if (error) { toast(error.message, 'err'); return }
    toast(t('Cartella eliminata')); load()
  }

  // ---------- RADICE: gli atleti come cartelle ----------
  if (!atleta) {
    return (
      <div className="grid" style={{ gap: 16 }}>
        <div className="card">
          <div style={{ fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: 800, color: ACCENT }}>{t('Documenti')}</div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 2 }}>Una cartella per ogni tuo atleta. Solo i tuoi documenti assicurativi.</div>
        </div>
        {athletes.length === 0 ? (
          <div className="card"><Empty icon={<Icon name="folder" size={30} strokeWidth={1.4} />} title={t("Nessun atleta")} hint="Quando vieni collegato a un atleta, comparirà qui." /></div>
        ) : (
          <div className="grid" style={{ gap: 10 }}>
            {athletes.map(a => (
              <button key={a.api_player_id} onClick={() => { setAtleta(a as Athlete); setStack([]) }}
                className="flex between" style={{ alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                  background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 14, padding: 14, color: 'var(--text)' }}>
                <span className="flex gap" style={{ alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', color: ACCENT }}><Icon name="folder" size={22} /></span>
                  {a.photo_url
                    ? <img src={a.photo_url} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                    : <span className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>{initials(a.name)}</span>}
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{a.name}</span>
                </span>
                <Icon name="chevron-right" size={18} />
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ---------- DENTRO UN ATLETA / CARTELLA ----------
  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* breadcrumb */}
      <div className="card flex between wrap gap" style={{ alignItems: 'center' }}>
        <div className="flex gap" style={{ alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: 13.5 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setAtleta(null); setStack([]) }}><Icon name="folder" size={13} /> Atleti</button>
          <span className="faint">/</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setStack([])} style={{ fontWeight: stack.length ? 400 : 800 }}>{atleta.name}</button>
          {stack.map((s, i) => (
            <span key={s.id} className="flex gap" style={{ alignItems: 'center', gap: 6 }}>
              <span className="faint">/</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setStack(st => st.slice(0, i + 1))}
                style={{ fontWeight: i === stack.length - 1 ? 800 : 400 }}>{s.name}</button>
            </span>
          ))}
        </div>
        <div className="flex gap" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => setNewFolderOpen(true)}><Icon name="folder" size={13} /> Nuova cartella</button>
          <button className="btn btn-primary btn-sm" onClick={() => setUploadOpen(true)}><Icon name="upload" size={13} /> Carica file</button>
        </div>
      </div>

      {loading ? <Spinner /> : (folders.length === 0 && files.length === 0) ? (
        <div className="card"><Empty icon={<Icon name="folder" size={30} strokeWidth={1.4} />} title={t("Cartella vuota")} hint="Crea una sottocartella o carica un documento." /></div>
      ) : (
        <div className="card">
          <div className="list">
            {folders.map(f => (
              <div className="row" key={f.id}>
                <button onClick={() => setStack(st => [...st, { id: f.id, name: f.name }])}
                  className="flex gap" style={{ alignItems: 'center', gap: 12, background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <span style={{ color: ACCENT, display: 'inline-flex' }}><Icon name="folder" size={20} /></span>
                  <span className="row-title">{f.name}</span>
                </button>
                <ConfirmButton onConfirm={() => delFolder(f)}>{t('Elimina')}</ConfirmButton>
              </div>
            ))}
            {files.map(d => (
              <div className="row" key={d.id}>
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center' }}>
                  <Icon name={d.mime?.includes('image') ? 'image' : 'file'} size={16} strokeWidth={1.5} />
                </div>
                <div className="row-main">
                  <div className="row-title">{d.name}</div>
                  <div className="row-sub">{humanSize(d.size)} · {fmtDate(d.created_at)}</div>
                </div>
                <button className="btn btn-sm" onClick={() => openFile(d)}>{t('Apri')}</button>
                <ConfirmButton onConfirm={() => delFile(d)}>Elimina</ConfirmButton>
              </div>
            ))}
          </div>
        </div>
      )}

      {newFolderOpen && <NewFolder onClose={() => setNewFolderOpen(false)} onCreate={async (name) => {
        const { error } = await supabase.from('crm_doc_folders').insert({ player_id: atleta.api_player_id, parent_id: currentFolderId, name })
        if (error) { toast(error.message, 'err'); return }
        setNewFolderOpen(false); toast(t('Cartella creata')); load()
      }} />}

      {uploadOpen && <UploadDialog
        onClose={() => setUploadOpen(false)}
        onDone={() => { setUploadOpen(false); load() }}
        playerId={atleta.api_player_id}
        folderId={currentFolderId}
        uid={session?.user.id || null}
      />}
    </div>
  )
}

function NewFolder({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const { t } = useLang()
  const [name, setName] = useState('')
  return (
    <Modal title={t("Nuova cartella")} onClose={onClose}
      footer={<div className="flex gap" style={{ marginLeft: 'auto' }}>
        <button className="btn" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => onCreate(name.trim())}>{t('Crea')}</button>
      </div>}>
      <Field label={t("Nome cartella")}><Input value={name} onChange={e => setName(e.target.value)} placeholder={t("Es. Polizze, Sinistri, Quietanze…")} autoFocus /></Field>
    </Modal>
  )
}

function UploadDialog({ onClose, onDone, playerId, folderId, uid }: {
  onClose: () => void; onDone: () => void; playerId: number; folderId: string | null; uid: string | null
}) {
  const { t } = useLang()
  const [busy, setBusy] = useState(false)
  const [scadenza, setScadenza] = useState('')
  const [files, setFiles] = useState<File[]>([])

  async function carica() {
    if (!files.length) return
    setBusy(true)
    let ok = 0
    for (const file of files) {
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(`${file.name}: ${up.error.message}`, 'err'); continue }
      const ins = await supabase.from('crm_documents').insert({
        name: file.name, category: 'altro', file_path: path, size: file.size, mime: file.type,
        uploaded_by: uid, player_id: playerId, folder_id: folderId,
      })
      if (ins.error) { toast(ins.error.message, 'err'); continue }
      // Scadenza manuale: crea la voce nell'area Scadenze (agenda dell'assicuratore).
      if (scadenza) {
        await supabase.from('crm_events').insert({
          title: `Scadenza · ${file.name}`, type: 'scadenza',
          start_at: new Date(scadenza + 'T09:00:00').toISOString(),
          player_id: playerId, created_by: uid, notes: 'Da documento assicurativo',
        })
      }
      ok++
    }
    setBusy(false)
    if (ok) { toast(`${ok} file caricat${ok > 1 ? 'i' : 'o'}${scadenza ? ' · scadenza aggiunta' : ''}`); onDone() }
  }

  return (
    <Modal title={t("Carica documento")} onClose={onClose}
      footer={<div className="flex gap" style={{ marginLeft: 'auto' }}>
        <button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !files.length} onClick={carica}>{busy ? 'Carico…' : 'Carica'}</button>
      </div>}>
      <div className="grid" style={{ gap: 14 }}>
        <Field label={t("File (puoi selezionarne più di uno)")}>
          <input type="file" multiple accept="image/*,application/pdf"
            onChange={e => setFiles(Array.from(e.target.files || []))}
            style={{ fontSize: 13 }} />
        </Field>
        {files.length > 0 && <div className="faint" style={{ fontSize: 12 }}>{files.length} file selezionat{files.length > 1 ? 'i' : 'o'}</div>}
        <Field label={t("Data scadenza (facoltativa) — finisce nell'area Scadenze")}>
          <Input type="date" value={scadenza} onChange={e => setScadenza(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

function humanSize(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}
