// Allegato dentro un messaggio: anteprima per le foto, scheda per i documenti. Si apre toccandolo.
import { useEffect, useRef, useState } from 'react'
import { fileUrl, fmtSize, isImage, uploadChatFile, type Attachment } from '../lib/chatFiles'
import { toast } from '../lib/toast'
import { useLang } from '../lib/i18n'
import Icon from './Icon'

export function ChatAttachment({ path, name, mime, size, mine }: { path: string; name?: string | null; mime?: string | null; size?: number | null; mine?: boolean }) {
  const [url, setUrl] = useState<string | null>(null)
  const img = isImage(mime)
  useEffect(() => { if (img) fileUrl(path).then(setUrl) }, [path, img])
  async function open() {
    const w = window.open('', '_blank')   // aperta subito, legata al tocco (iPhone)
    const u = await fileUrl(path)
    if (u && w) w.location.href = u
    else if (u) window.location.href = u
    else { w?.close(); toast('File non disponibile', 'err') }
  }
  if (img) {
    return (
      <button onClick={open} style={{ display: 'block', padding: 0, border: 0, background: 'none', cursor: 'pointer', marginBottom: 4 }}>
        {url
          ? <img src={url} alt={name || ''} style={{ maxWidth: 240, maxHeight: 260, borderRadius: 12, display: 'block', objectFit: 'cover' }} />
          : <div style={{ width: 200, height: 140, borderRadius: 12, background: 'rgba(127,127,127,.15)' }} />}
      </button>
    )
  }
  const ext = (name || '').split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'
  return (
    <button onClick={open} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4, borderRadius: 12, cursor: 'pointer',
      border: '1px solid ' + (mine ? 'rgba(255,255,255,.2)' : 'var(--border)'), background: mine ? 'rgba(255,255,255,.08)' : 'var(--bg-2)',
      color: 'inherit', textAlign: 'left', maxWidth: 280,
    }}>
      <span style={{ width: 36, height: 42, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 900,
        background: ext === 'PDF' ? '#E5484D' : 'var(--text-dim)', color: '#fff' }}>{ext}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontWeight: 700, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || 'file'}</span>
        <span style={{ display: 'block', fontSize: 11, opacity: .7 }}>{fmtSize(size)}</span>
      </span>
    </button>
  )
}

// Graffetta del compositore + scheda del file in attesa d'invio
export function useAttach(uid: string | undefined) {
  const { t } = useLang()
  const ref = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const button = (
    <>
      <button type="button" className="btn btn-ghost" title={t('Allega foto o documento')} onClick={() => ref.current?.click()}
        style={{ padding: '0 10px', flexShrink: 0 }}><Icon name="paperclip" size={18} /></button>
      <input ref={ref} type="file" hidden accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        onChange={e => { const f = e.target.files?.[0]; if (f) setPending(f); e.target.value = '' }} />
    </>
  )
  const chip = pending && (
    <div className="flex gap" style={{ alignItems: 'center', gap: 8, padding: '8px 14px 0', fontSize: 12.5 }}>
      <Icon name="paperclip" size={13} />
      <span style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{pending.name}</span>
      <span className="faint">{fmtSize(pending.size)}</span>
      <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setPending(null)}><Icon name="x" size={13} /></button>
    </div>
  )
  // carica il file in attesa (se c'è) e restituisce i campi da salvare nel messaggio
  async function take(): Promise<Attachment | null | false> {
    if (!pending) return null
    if (!uid) return false
    setUploading(true)
    try { const a = await uploadChatFile(uid, pending); setPending(null); return a }
    catch (e: any) { toast(t(e?.message || 'Caricamento non riuscito'), 'err'); return false }
    finally { setUploading(false) }
  }
  return { button, chip, pending, uploading, take }
}
