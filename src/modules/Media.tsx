import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { notify } from '../lib/notify'
import { Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { MediaItem } from '../lib/types'

const BUCKET = 'crm-media'

const MEDIA_STATUS: Record<string, { label: string; tone?: 'green' | 'red' | 'gold' | 'blue' | 'accent' }> = {
  nuova: { label: 'Nuova' },
  selezionata: { label: 'Selezionata ⭐', tone: 'gold' },
  scartata: { label: 'Scartata' },
  lavorata: { label: 'Lavorata ✓', tone: 'green' },
}

export default function Media() {
  const { session, profile, isAdmin, isTeam, role } = useAuth()
  const { rows, loading, reload } = useCollection<MediaItem>('crm_media', { orderBy: 'created_at' })
  const [tab, setTab] = useState<'foto' | 'selezionate' | 'grafiche'>('foto')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const fotoRef = useRef<HTMLInputElement>(null)
  const graficaRef = useRef<HTMLInputElement>(null)

  const foto = rows.filter(m => m.kind === 'foto' && m.status !== 'scartata')
  const selezionate = foto.filter(m => m.status === 'selezionata')
  const grafiche = rows.filter(m => m.kind !== 'foto')

  // Anteprime firmate (bucket privato) per tutti gli elementi visibili.
  useEffect(() => {
    const paths = rows.map(m => m.storage_path).filter(p => !urls[p])
    if (!paths.length) return
    supabase.storage.from(BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (!data) return
      const next: Record<string, string> = {}
      data.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
      setUrls(u => ({ ...u, ...next }))
    })
  }, [rows]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadFiles(files: File[], kind: 'foto' | 'grafica') {
    setUploading(true); setErr('')
    let ok = 0
    for (const file of files) {
      const path = `${kind}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { setErr(up.error.message); continue }
      const ins = await insertRow('crm_media', {
        storage_path: path,
        file_name: file.name,
        kind,
        status: kind === 'foto' ? 'nuova' : 'lavorata',
        source_ids: kind === 'grafica' && selezionate.length ? selezionate.map(s => s.id) : null,
        uploaded_by: session?.user.id,
        uploaded_role: role,
      })
      if (!ins.error) ok++
    }
    if (ok > 0) {
      if (kind === 'foto') {
        if (isTeam) {
          notify('player', '📸 Materiale pronto per essere selezionato',
            `Il team ha caricato ${ok} nuov${ok > 1 ? 'e foto' : 'a foto'}: scegli quelle che ti piacciono.`, 'media')
        } else {
          notify('team', '📸 Nuove foto dal giocatore', `${profile?.full_name || 'Il giocatore'} ha caricato ${ok} foto.`, 'media')
        }
      } else {
        // Grafica pronta: le foto selezionate usate come sorgente diventano "lavorate".
        if (selezionate.length) {
          await Promise.all(selezionate.map(s => updateRow('crm_media', s.id, { status: 'lavorata' })))
        }
        notify('player', '🎨 Grafiche pronte', `${ok} grafic${ok > 1 ? 'he' : 'a'} da vedere nella sezione Media.`, 'media')
      }
      reload()
    }
    setUploading(false)
    if (fotoRef.current) fotoRef.current.value = ''
    if (graficaRef.current) graficaRef.current.value = ''
  }

  async function toggleSelect(m: MediaItem) {
    const next = m.status === 'selezionata' ? 'nuova' : 'selezionata'
    await updateRow('crm_media', m.id, { status: next })
    if (next === 'selezionata') {
      notify('team', '⭐ Foto selezionata', `${profile?.full_name || 'Il giocatore'} ha scelto "${m.file_name}": pronta per la grafica.`, 'media')
    }
    reload()
  }

  async function download(m: MediaItem) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300, { download: m.file_name || undefined })
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function remove(m: MediaItem) {
    await supabase.storage.from(BUCKET).remove([m.storage_path])
    await deleteRow('crm_media', m.id)
    reload()
  }

  if (loading) return <Spinner />

  const shown = tab === 'foto' ? foto : tab === 'selezionate' ? selezionate : grafiche

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flex between wrap gap">
        <div>
          <div style={{ fontWeight: 650 }}>Libreria media</div>
          <div className="faint" style={{ fontSize: 12.5 }}>
            {isTeam
              ? 'Carica le foto: il giocatore riceve la notifica e seleziona. Sulle selezionate carichi grafiche e caroselli.'
              : 'Il team carica il materiale: seleziona le foto che ti piacciono e riceverai le grafiche pronte.'}
          </div>
        </div>
        <div className="flex gap">
          <button className="btn btn-primary" disabled={uploading} onClick={() => fotoRef.current?.click()}>
            {uploading ? 'Carico…' : '⬆ Carica foto'}
          </button>
          <input ref={fotoRef} type="file" accept="image/*" multiple hidden
            onChange={e => uploadFiles(Array.from(e.target.files || []), 'foto')} />
          {isTeam && (
            <>
              <button className="btn" disabled={uploading} onClick={() => graficaRef.current?.click()}
                title={selezionate.length ? `Collegata alle ${selezionate.length} foto selezionate` : undefined}>
                🎨 Carica grafica{selezionate.length ? ` (${selezionate.length} sel.)` : ''}
              </button>
              <input ref={graficaRef} type="file" accept="image/*,video/*,.pdf" multiple hidden
                onChange={e => uploadFiles(Array.from(e.target.files || []), 'grafica')} />
            </>
          )}
        </div>
      </div>
      {err && <div className="msg-err">{err}</div>}

      <div className="pill-tabs" style={{ alignSelf: 'start' }}>
        <button className={`pill-tab ${tab === 'foto' ? 'active' : ''}`} onClick={() => setTab('foto')}>📸 Foto ({foto.length})</button>
        <button className={`pill-tab ${tab === 'selezionate' ? 'active' : ''}`} onClick={() => setTab('selezionate')}>⭐ Selezionate ({selezionate.length})</button>
        <button className={`pill-tab ${tab === 'grafiche' ? 'active' : ''}`} onClick={() => setTab('grafiche')}>🎨 Grafiche ({grafiche.length})</button>
      </div>

      {shown.length === 0 ? (
        <div className="card">
          <Empty icon={tab === 'grafiche' ? '🎨' : '📸'}
            title={tab === 'foto' ? 'Nessuna foto ancora' : tab === 'selezionate' ? 'Nessuna foto selezionata' : 'Nessuna grafica ancora'}
            hint={tab === 'foto' ? 'Carica il primo set di foto.' : tab === 'selezionate' ? 'Le foto scelte dal giocatore compaiono qui.' : 'Le grafiche e i caroselli pronti compaiono qui.'} />
        </div>
      ) : (
        <div className="media-grid">
          {shown.map(m => (
            <div className={`media-card ${m.status === 'selezionata' ? 'media-selected' : ''}`} key={m.id}>
              {urls[m.storage_path]
                ? <img className="media-thumb" src={urls[m.storage_path]} alt={m.file_name || ''} loading="lazy" onClick={() => download(m)} />
                : <div className="media-thumb media-ph">🖼</div>}
              <div className="media-meta">
                <div className="media-name" title={m.file_name || ''}>{m.file_name}</div>
                <div className="flex between" style={{ alignItems: 'center' }}>
                  <Badge tone={MEDIA_STATUS[m.status]?.tone}>{m.kind === 'foto' ? MEDIA_STATUS[m.status]?.label : (m.kind === 'carosello' ? 'Carosello' : 'Grafica')}</Badge>
                  <span className="faint" style={{ fontSize: 11 }}>{fmtDate(m.created_at)}</span>
                </div>
                <div className="flex gap" style={{ marginTop: 8 }}>
                  {m.kind === 'foto' && role === 'player' && m.status !== 'lavorata' && (
                    <button className={`btn btn-sm ${m.status === 'selezionata' ? '' : 'btn-primary'}`} style={{ flex: 1 }} onClick={() => toggleSelect(m)}>
                      {m.status === 'selezionata' ? '★ Tolgo' : '☆ Seleziona'}
                    </button>
                  )}
                  <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => download(m)}>Scarica</button>
                  {(isAdmin || m.uploaded_by === session?.user.id) && <ConfirmButton onConfirm={() => remove(m)}>×</ConfirmButton>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
