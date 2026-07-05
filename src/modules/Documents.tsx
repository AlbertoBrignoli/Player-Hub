import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, deleteRow } from '../lib/useData'
import { Empty, Spinner, Badge, Select, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate } from '../lib/format'
import type { Doc } from '../lib/types'

const CATS: Record<string, string> = { contratto: 'Contratto', identita: 'Identità', medico: 'Medico', fiscale: 'Fiscale', altro: 'Altro' }
const BUCKET = 'crm-documents'

export default function Documents() {
  const { session } = useAuth()
  const { rows, loading, reload } = useCollection<Doc>('crm_documents', { orderBy: 'created_at' })
  const [uploading, setUploading] = useState(false)
  const [cat, setCat] = useState('altro')
  const [err, setErr] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setErr('')
    const path = `${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (up.error) { setErr(up.error.message); setUploading(false); return }
    const ins = await insertRow('crm_documents', {
      name: file.name, category: cat, file_path: path, size: file.size, mime: file.type,
      uploaded_by: session?.user.id,
    })
    if (ins.error) setErr(ins.error.message)
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    reload()
  }

  async function open(d: Doc) {
    if (!d.file_path) return
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_path, 120)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(d: Doc) {
    if (d.file_path) await supabase.storage.from(BUCKET).remove([d.file_path])
    await deleteRow('crm_documents', d.id)
    reload()
  }

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flex between wrap gap">
        <div>
          <div style={{ fontWeight: 650 }}>Carica un documento</div>
          <div className="faint" style={{ fontSize: 12.5 }}>Archivio cifrato e privato · visibile solo a te e ad AUVI</div>
        </div>
        <div className="flex gap">
          <Select value={cat} onChange={e => setCat(e.target.value)} style={{ width: 150 }}>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <button className="btn btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={14} /> {uploading ? 'Carico…' : 'Carica file'}
          </button>
          <input ref={fileRef} type="file" hidden onChange={onFile} />
        </div>
      </div>
      {err && <div className="msg-err">{err}</div>}

      <div className="card">
        {rows.length === 0 ? <Empty icon={<Icon name="archive" size={30} strokeWidth={1.4} />} title="Archivio vuoto" hint="Carica contratti, documenti d'identità, referti medici…" /> : (
          <div className="list">
            {rows.map(d => (
              <div className="row" key={d.id}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: 'var(--surface-2)', display: 'grid', placeItems: 'center', fontSize: 17 }}>{fileIcon(d.mime)}</div>
                <div className="row-main">
                  <div className="row-title">{d.name}</div>
                  <div className="row-sub">{humanSize(d.size)} · caricato {fmtDate(d.created_at)}</div>
                </div>
                <Badge>{CATS[d.category] || d.category}</Badge>
                <button className="btn btn-sm" onClick={() => open(d)}>Apri</button>
                <ConfirmButton onConfirm={() => remove(d)}>Elimina</ConfirmButton>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function fileIcon(mime: string | null) {
  if (!mime) return <Icon name="file" size={17} strokeWidth={1.5} />
  if (mime.includes('image')) return <Icon name="image" size={17} strokeWidth={1.5} />
  return <Icon name="file" size={17} strokeWidth={1.5} />
}
function humanSize(n: number | null) {
  if (!n) return '—'
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}
