// "I miei file": l'archivio personale di ogni professionista (e di AUVI).
// I file ricevuti in chat arrivano da soli in "Ricevuti in chat"; qui si creano cartelle,
// si spostano i file, se ne caricano di propri, si aprono e si eliminano.
import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { fmtDate } from '../lib/format'
import { fileUrl, fmtSize, isImage, uploadChatFile } from '../lib/chatFiles'
import { STAFF_ROLE } from '../components/StaffChat'
import { Modal, Spinner, Empty } from '../components/ui'
import Icon from '../components/Icon'

type Folder = { id: string; name: string; system_key: string | null; created_at: string }
type FileRow = {
  id: string; folder_id: string | null; name: string; file_path: string; mime: string | null; size: number | null
  from_name: string | null; from_role: string | null; player_id: number | null; source: string; created_at: string
}

const ALL = '__all'

export default function MyFiles() {
  const { t } = useLang()
  const { session } = useAuth()
  const { athletes } = useAthlete()
  const uid = session?.user.id
  const [folders, setFolders] = useState<Folder[]>([])
  const [files, setFiles] = useState<FileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [cur, setCur] = useState<string>(ALL)
  const [q, setQ] = useState('')
  const [naming, setNaming] = useState<{ id?: string; name: string } | null>(null)
  const [moving, setMoving] = useState<FileRow | null>(null)
  const [uploading, setUploading] = useState(false)
  const upRef = useRef<HTMLInputElement>(null)

  async function load() {
    const [f, x] = await Promise.all([
      supabase.from('crm_file_folders').select('id, name, system_key, created_at').order('created_at'),
      supabase.from('crm_my_files').select('*').order('created_at', { ascending: false }),
    ])
    setFolders((f.data as Folder[]) || [])
    setFiles((x.data as FileRow[]) || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // la cartella di sistema per prima, poi le tue in ordine alfabetico
  const sorted = useMemo(() => [...folders].sort((a, b) =>
    (a.system_key ? 0 : 1) - (b.system_key ? 0 : 1) || a.name.localeCompare(b.name)), [folders])
  const count = (id: string) => files.filter(f => f.folder_id === id).length
  const athleteName = (id: number | null) => (id && athletes.find(a => a.api_player_id === id)?.name) || null
  const shown = files.filter(f => (cur === ALL || f.folder_id === cur)
    && (!q.trim() || [f.name, f.from_name, athleteName(f.player_id)].some(v => (v || '').toLowerCase().includes(q.trim().toLowerCase()))))
  const folderName = (f: Folder) => f.system_key === 'chat' ? t('Ricevuti in chat') : f.name
  const curFolder = folders.find(f => f.id === cur)

  async function saveFolder() {
    if (!naming?.name.trim()) return
    const { error } = naming.id
      ? await supabase.from('crm_file_folders').update({ name: naming.name.trim() }).eq('id', naming.id)
      : await supabase.from('crm_file_folders').insert({ name: naming.name.trim() })
    if (error) { toast(error.message, 'err'); return }
    setNaming(null); load()
  }
  async function deleteFolder(f: Folder) {
    if (!confirm(t('Eliminare la cartella «{name}»? I file restano in "Tutti i file".').replace('{name}', f.name))) return
    const { error } = await supabase.from('crm_file_folders').delete().eq('id', f.id)
    if (error) { toast(error.message, 'err'); return }
    setCur(ALL); load()
  }
  async function move(file: FileRow, folder: string | null) {
    const { error } = await supabase.from('crm_my_files').update({ folder_id: folder }).eq('id', file.id)
    if (error) { toast(error.message, 'err'); return }
    setMoving(null); toast(t('File spostato')); load()
  }
  async function remove(file: FileRow) {
    if (!confirm(t('Togliere «{name}» dai tuoi file?').replace('{name}', file.name))) return
    const { error } = await supabase.from('crm_my_files').delete().eq('id', file.id)
    if (error) { toast(error.message, 'err'); return }
    // un file caricato da te (non arrivato in chat) si cancella anche dallo spazio file
    if (file.source === 'upload' && uid && file.file_path.startsWith(uid + '/')) await supabase.storage.from('chat-files').remove([file.file_path])
    load()
  }
  async function open(file: FileRow, download = false) {
    const w = window.open('', '_blank')
    const u = await fileUrl(file.file_path, download ? file.name : undefined)
    if (u && w) w.location.href = u
    else { w?.close(); toast(t('File non disponibile'), 'err') }
  }
  async function upload(list: FileList) {
    if (!uid) return
    setUploading(true)
    for (const f of Array.from(list)) {
      try {
        const a = await uploadChatFile(uid, f, 'archivio')
        const { error } = await supabase.from('crm_my_files').insert({
          name: a.file_name, file_path: a.file_path, mime: a.file_mime, size: a.file_size,
          folder_id: cur === ALL ? null : cur, source: 'upload',
        })
        if (error) throw error
      } catch (e: any) { toast(`${f.name}: ${t(e?.message || 'Caricamento non riuscito')}`, 'err') }
    }
    setUploading(false); load()
  }

  if (loading) return <Spinner />

  return (
    <div className="mf">
      <style>{MF_CSS}</style>

      <aside className="mf-side card">
        <div className="mf-side-h">{t('Cartelle')}</div>
        <button className={`mf-f ${cur === ALL ? 'on' : ''}`} onClick={() => setCur(ALL)}>
          <Icon name="archive" size={16} /> <span>{t('Tutti i file')}</span> <b>{files.length}</b>
        </button>
        {sorted.map(f => (
          <button key={f.id} className={`mf-f ${cur === f.id ? 'on' : ''}`} onClick={() => setCur(f.id)}>
            <Icon name={f.system_key === 'chat' ? 'message' : 'folder'} size={16} /> <span>{folderName(f)}</span> <b>{count(f.id) || ''}</b>
          </button>
        ))}
        <button className="mf-f mf-new" onClick={() => setNaming({ name: '' })}><Icon name="folder-plus" size={16} /> <span>{t('Nuova cartella')}</span></button>
      </aside>

      <section className="grid" style={{ gap: 12, alignContent: 'start', minWidth: 0 }}>
        <div className="mf-top">
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: -.3 }}>{curFolder ? folderName(curFolder) : t('Tutti i file')}</div>
            <div className="faint" style={{ fontSize: 12.5 }}>
              {curFolder?.system_key === 'chat'
                ? t('Qui arrivano da soli i file che ricevi in chat.')
                : t('{n} file').replace('{n}', String(shown.length))}
            </div>
          </div>
          <div className="flex gap" style={{ gap: 6, flexWrap: 'wrap' }}>
            {curFolder && !curFolder.system_key && <>
              <button className="btn btn-sm btn-ghost" onClick={() => setNaming({ id: curFolder.id, name: curFolder.name })}><Icon name="edit" size={13} /> {t('Rinomina')}</button>
              <button className="btn btn-sm btn-ghost" onClick={() => deleteFolder(curFolder)}><Icon name="trash" size={13} /></button>
            </>}
            <button className="btn btn-sm btn-primary" disabled={uploading} onClick={() => upRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploading ? t('Carico…') : t('Carica file')}
            </button>
            <input ref={upRef} type="file" multiple hidden onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = '' }} />
          </div>
        </div>

        {/* cartelle in orizzontale sul telefono */}
        <div className="mf-chips">
          <button className={`mf-chip ${cur === ALL ? 'on' : ''}`} onClick={() => setCur(ALL)}>{t('Tutti')}</button>
          {sorted.map(f => <button key={f.id} className={`mf-chip ${cur === f.id ? 'on' : ''}`} onClick={() => setCur(f.id)}>{folderName(f)}</button>)}
          <button className="mf-chip" onClick={() => setNaming({ name: '' })}>+ {t('Cartella')}</button>
        </div>

        <input className="input" placeholder={t('Cerca per nome, mittente o atleta…')} value={q} onChange={e => setQ(e.target.value)} />

        {shown.length === 0 ? (
          <div className="card"><Empty icon={<Icon name="folder" size={30} strokeWidth={1.4} />} title={t('Nessun file')}
            hint={t('I documenti e le foto che ricevi in chat si salvano qui da soli. Puoi anche caricarne di tuoi.')} /></div>
        ) : (
          <div className="mf-list card">
            {shown.map(f => (
              <div key={f.id} className="mf-row">
                <button className="mf-open" onClick={() => open(f)}>
                  <FileThumb f={f} />
                  <div style={{ minWidth: 0 }}>
                    <div className="mf-name">{f.name}</div>
                    <div className="mf-meta">
                      {f.source === 'upload' ? t('Caricato da te') : <>{t('Da')} {f.from_name || '—'}{f.from_role ? ` · ${t(STAFF_ROLE[f.from_role] || (f.from_role === 'player' ? 'Atleta' : f.from_role))}` : ''}</>}
                      {athleteName(f.player_id) && <> · {athleteName(f.player_id)}</>}
                      {' · '}{fmtDate(f.created_at)}{f.size ? ` · ${fmtSize(f.size)}` : ''}
                    </div>
                  </div>
                </button>
                <div className="mf-act">
                  <button className="btn btn-sm btn-ghost" title={t('Sposta in una cartella')} onClick={() => setMoving(f)}><Icon name="folder" size={14} /></button>
                  <button className="btn btn-sm btn-ghost" title={t('Scarica')} onClick={() => open(f, true)}><Icon name="download" size={14} /></button>
                  <button className="btn btn-sm btn-ghost" title={t('Elimina')} onClick={() => remove(f)}><Icon name="trash" size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {naming && (
        <Modal title={naming.id ? t('Rinomina cartella') : t('Nuova cartella')} onClose={() => setNaming(null)}
          footer={<><button className="btn" onClick={() => setNaming(null)}>{t('Annulla')}</button>
            <button className="btn btn-primary" disabled={!naming.name.trim()} onClick={saveFolder}>{t('Salva')}</button></>}>
          <div className="field"><label>{t('Nome della cartella')}</label>
            <input className="input" autoFocus value={naming.name} placeholder={t('Es. Certificati fiscali')}
              onChange={e => setNaming({ ...naming, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') saveFolder() }} /></div>
        </Modal>
      )}

      {moving && (
        <Modal title={t('Sposta «{name}»').replace('{name}', moving.name)} onClose={() => setMoving(null)}>
          <div className="grid" style={{ gap: 6 }}>
            {sorted.map(f => (
              <button key={f.id} className={`mf-f ${moving.folder_id === f.id ? 'on' : ''}`} onClick={() => move(moving, f.id)}>
                <Icon name={f.system_key === 'chat' ? 'message' : 'folder'} size={16} /> <span>{folderName(f)}</span>
                {moving.folder_id === f.id && <b>{t('qui')}</b>}
              </button>
            ))}
            <button className="mf-f mf-new" onClick={() => { setMoving(null); setNaming({ name: '' }) }}>
              <Icon name="folder-plus" size={16} /> <span>{t('Nuova cartella')}</span>
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function FileThumb({ f }: { f: FileRow }) {
  const [url, setUrl] = useState<string | null>(null)
  const img = isImage(f.mime)
  useEffect(() => { if (img) fileUrl(f.file_path).then(setUrl) }, [f.file_path, img])
  if (img && url) return <img src={url} alt="" className="mf-th" style={{ objectFit: 'cover' }} />
  const ext = (f.name.split('.').pop() || 'FILE').toUpperCase().slice(0, 4)
  return <span className="mf-th" style={{ background: ext === 'PDF' ? '#E5484D' : 'var(--text-dim)' }}>{ext}</span>
}

const MF_CSS = `
.mf { display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start; }
.mf-side { padding: 10px; display: grid; gap: 2px; position: sticky; top: 12px; }
.mf-side-h { font-size: 10.5px; letter-spacing: 1.4px; text-transform: uppercase; font-weight: 800; color: var(--text-dim); padding: 6px 10px; }
.mf-f { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 10px; border-radius: 10px; border: 0; background: transparent; color: var(--text); cursor: pointer; text-align: left; font-size: 13.5px; font-weight: 600; }
.mf-f span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-f b { font-size: 11.5px; color: var(--text-dim); font-weight: 700; }
.mf-f.on { background: var(--text); color: var(--bg, #fff); }
.mf-f.on b { color: inherit; opacity: .7; }
.mf-f:not(.on):hover { background: var(--bg-2); }
.mf-new { color: var(--text-dim); }
.mf-top { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
.mf-chips { display: none; gap: 6px; overflow-x: auto; padding-bottom: 2px; }
.mf-chip { white-space: nowrap; padding: 7px 12px; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text-dim); font-weight: 700; font-size: 12.5px; cursor: pointer; }
.mf-chip.on { background: var(--text); color: var(--bg, #fff); border-color: var(--text); }
.mf-list { padding: 0; }
.mf-row { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
.mf-row:last-child { border-bottom: 0; }
.mf-open { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; border: 0; background: none; color: var(--text); text-align: left; cursor: pointer; padding: 4px; }
.mf-th { width: 42px; height: 42px; border-radius: 9px; flex-shrink: 0; display: grid; place-items: center; color: #fff; font-size: 10.5px; font-weight: 900; }
.mf-name { font-weight: 800; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-meta { font-size: 11.5px; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mf-act { display: flex; gap: 2px; flex-shrink: 0; }
@media (max-width: 760px) {
  .mf { grid-template-columns: 1fr; }
  .mf-side { display: none; }
  .mf-chips { display: flex; }
  .mf-act .btn { padding: 6px; }
}
`
