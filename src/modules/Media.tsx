import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { notify } from '../lib/notify'
import { Badge, Empty, Spinner, ConfirmButton, Select } from '../components/ui'
import { fmtDate } from '../lib/format'
import type { MediaItem, EditorialEntry } from '../lib/types'

const BUCKET = 'crm-media'

export default function Media() {
  const { session, profile, isTeam, role } = useAuth()
  const { rows, loading, reload } = useCollection<MediaItem>('crm_media', { orderBy: 'created_at' })
  const { rows: entries } = useCollection<EditorialEntry>('crm_editorial', { orderBy: 'entry_date', ascending: true })
  const [tab, setTab] = useState<'approvare' | 'pubblicare' | 'pubblicati'>('approvare')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [targetEntry, setTargetEntry] = useState('')
  const fotoRef = useRef<HTMLInputElement>(null)
  const graficaRef = useRef<HTMLInputElement>(null)

  const daApprovare = rows.filter(m => m.status === 'da_approvare')
  const daPubblicare = rows.filter(m => m.status === 'approvata' || m.status === 'da_pubblicare')
  const pubblicati = rows.filter(m => m.status === 'pubblicata')
  const entryById = new Map(entries.map(e => [e.id, e]))

  // Anteprime firmate (bucket privato).
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
        status: kind === 'foto' ? 'da_approvare' : 'da_pubblicare',
        uploaded_by: session?.user.id,
        uploaded_role: role,
      })
      if (!ins.error) ok++
    }
    if (ok > 0) {
      if (kind === 'foto') {
        if (isTeam) {
          notify('player', '📸 Materiale pronto per essere approvato',
            `Il team ha caricato ${ok} nuov${ok > 1 ? 'e foto' : 'a foto'}: scegli quali approvare e per quale contenuto.`, 'media')
        } else {
          notify('team', '📸 Nuove foto dal giocatore', `${profile?.full_name || 'Il giocatore'} ha caricato ${ok} foto.`, 'media')
        }
      } else {
        notify('player', '🎨 Nuove grafiche da pubblicare', `${ok} grafic${ok > 1 ? 'he' : 'a'} nella sezione Media.`, 'media')
      }
      reload()
    }
    setUploading(false)
    if (fotoRef.current) fotoRef.current.value = ''
    if (graficaRef.current) graficaRef.current.value = ''
  }

  function togglePick(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function approvePicked() {
    if (!picked.size || !targetEntry) return
    const entry = entryById.get(targetEntry)
    await Promise.all([...picked].map(id =>
      updateRow('crm_media', id, { status: 'approvata', editorial_id: targetEntry })))
    notify('team', `⭐ ${picked.size} foto approvat${picked.size > 1 ? 'e' : 'a'} da ${profile?.full_name || 'Lorenzo'}`,
      entry ? `Per "${entry.title}" del ${fmtDate(entry.entry_date)}: il materiale è dentro la box, pronto per la grafica.` : undefined,
      'editorial')
    setPicked(new Set()); setTargetEntry('')
    reload()
  }

  async function discard(m: MediaItem) {
    await updateRow('crm_media', m.id, { status: 'scartata' })
    reload()
  }

  async function markPublished(m: MediaItem) {
    await updateRow('crm_media', m.id, { status: 'pubblicata' })
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

  const shown = tab === 'approvare' ? daApprovare : tab === 'pubblicare' ? daPubblicare : pubblicati
  const upcomingEntries = entries.filter(e => e.entry_date >= new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10))

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flex between wrap gap">
        <div>
          <div style={{ fontWeight: 650 }}>Libreria media</div>
          <div className="faint" style={{ fontSize: 12.5 }}>
            {role === 'player'
              ? 'Approva le foto scegliendo per quale contenuto: il team le trova nella box e prepara la grafica.'
              : 'Carica le foto da far approvare: quelle approvate compaiono dentro la box del calendario con il resto del materiale.'}
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
              <button className="btn" disabled={uploading} onClick={() => graficaRef.current?.click()}>🎨 Carica grafica</button>
              <input ref={graficaRef} type="file" accept="image/*,video/*,.pdf" multiple hidden
                onChange={e => uploadFiles(Array.from(e.target.files || []), 'grafica')} />
            </>
          )}
        </div>
      </div>
      {err && <div className="msg-err">{err}</div>}

      <div className="pill-tabs" style={{ alignSelf: 'start' }}>
        <button className={`pill-tab ${tab === 'approvare' ? 'active' : ''}`} onClick={() => setTab('approvare')}>📥 Da approvare ({daApprovare.length})</button>
        <button className={`pill-tab ${tab === 'pubblicare' ? 'active' : ''}`} onClick={() => setTab('pubblicare')}>🛠 Da pubblicare ({daPubblicare.length})</button>
        <button className={`pill-tab ${tab === 'pubblicati' ? 'active' : ''}`} onClick={() => setTab('pubblicati')}>✅ Pubblicati ({pubblicati.length})</button>
      </div>

      {tab === 'approvare' && role === 'player' && daApprovare.length > 0 && (
        <div className="card flex between wrap gap" style={{ alignItems: 'center', borderColor: picked.size ? 'var(--accent)' : undefined }}>
          <div style={{ fontWeight: 650 }}>
            {picked.size ? `${picked.size} foto selezionat${picked.size > 1 ? 'e' : 'a'}` : 'Tocca le foto per selezionarle, poi scegli il contenuto'}
          </div>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            <Select value={targetEntry} onChange={e => setTargetEntry(e.target.value)} style={{ minWidth: 230 }}>
              <option value="">Approva per…</option>
              {upcomingEntries.map(e => (
                <option key={e.id} value={e.id}>{fmtDate(e.entry_date)} · {e.title}</option>
              ))}
            </Select>
            <button className="btn btn-primary" disabled={!picked.size || !targetEntry} onClick={approvePicked}>
              ✓ Approva {picked.size || ''}
            </button>
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card">
          <Empty icon={tab === 'pubblicati' ? '✅' : tab === 'pubblicare' ? '🛠' : '📥'}
            title={tab === 'approvare' ? 'Niente da approvare' : tab === 'pubblicare' ? 'Niente in lavorazione' : 'Nessun contenuto pubblicato'}
            hint={tab === 'approvare' ? 'Le foto caricate dal team compaiono qui in attesa di approvazione.'
              : tab === 'pubblicare' ? 'Qui trovi foto approvate e grafiche in preparazione.'
              : 'Le grafiche caricate nelle box del calendario finiscono qui.'} />
        </div>
      ) : (
        <div className="media-grid">
          {shown.map(m => {
            const entry = m.editorial_id ? entryById.get(m.editorial_id) : null
            const isPicked = picked.has(m.id)
            return (
              <div className={`media-card ${isPicked ? 'media-selected' : ''}`} key={m.id}>
                <div style={{ position: 'relative' }}>
                  {urls[m.storage_path]
                    ? <img className="media-thumb" src={urls[m.storage_path]} alt={m.file_name || ''} loading="lazy"
                        onClick={() => tab === 'approvare' && role === 'player' ? togglePick(m.id) : download(m)} />
                    : <div className="media-thumb media-ph">{m.kind === 'foto' ? '📸' : '🎨'}</div>}
                  {tab === 'approvare' && role === 'player' && (
                    <div className={`media-pick ${isPicked ? 'on' : ''}`} onClick={() => togglePick(m.id)}>{isPicked ? '✓' : ''}</div>
                  )}
                </div>
                <div className="media-meta">
                  <div className="media-name" title={m.file_name || ''}>{m.file_name}</div>
                  <div className="flex between" style={{ alignItems: 'center' }}>
                    <Badge tone={m.status === 'approvata' ? 'gold' : m.status === 'pubblicata' ? 'green' : m.status === 'da_pubblicare' ? 'blue' : undefined}>
                      {m.kind === 'foto'
                        ? (m.status === 'da_approvare' ? 'Da approvare' : m.status === 'approvata' ? 'Approvata ⭐' : m.status === 'pubblicata' ? 'Pubblicata' : 'Da pubblicare')
                        : (m.status === 'pubblicata' ? (m.kind === 'carosello' ? 'Carosello ✓' : 'Grafica ✓') : m.kind === 'carosello' ? 'Carosello' : 'Grafica')}
                    </Badge>
                    <span className="faint" style={{ fontSize: 11 }}>{fmtDate(m.created_at)}</span>
                  </div>
                  {entry && <div className="faint" style={{ fontSize: 11 }}>→ {entry.title} · {fmtDate(entry.entry_date)}</div>}
                  <div className="flex gap" style={{ marginTop: 8 }}>
                    <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => download(m)}>Scarica</button>
                    {isTeam && tab === 'pubblicare' && (
                      <button className="btn btn-sm" onClick={() => markPublished(m)} title="Segna come pubblicata">✓</button>
                    )}
                    {role === 'player' && tab === 'approvare' && (
                      <button className="btn btn-sm" onClick={() => discard(m)} title="Scarta">✕</button>
                    )}
                    {(isTeam || m.uploaded_by === session?.user.id) && <ConfirmButton onConfirm={() => remove(m)}>🗑</ConfirmButton>}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
