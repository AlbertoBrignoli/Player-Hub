import React, { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { notify } from '../lib/notify'
import { toast } from '../lib/toast'
import Lightbox from '../components/Lightbox'
import { Badge, Empty, Spinner, ConfirmButton, Select } from '../components/ui'
import { fmtDate, isImageFile, fileExt } from '../lib/format'
import type { MediaItem, EditorialEntry } from '../lib/types'

const BUCKET = 'crm-media'

export default function Media() {
  const { session, profile, isTeam, role } = useAuth()
  const { rows, loading, reload } = useCollection<MediaItem>('crm_media', { orderBy: 'created_at' })
  const { rows: entries } = useCollection<EditorialEntry>('crm_editorial', { orderBy: 'entry_date', ascending: true })
  const [tab, setTab] = useState<'approvare' | 'approvate' | 'pubblicare' | 'pubblicati'>('approvare')
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [targetEntry, setTargetEntry] = useState('')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const fotoRef = useRef<HTMLInputElement>(null)
  const graficaRef = useRef<HTMLInputElement>(null)

  const daApprovare = rows.filter(m => m.status === 'da_approvare')
  const approvate = rows.filter(m => m.status === 'approvata')
  const daPubblicare = rows.filter(m => m.status === 'da_pubblicare')
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
      if (up.error) { toast(up.error.message, 'err'); continue }
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
      toast(kind === 'foto' ? `📸 ${ok} foto caricat${ok > 1 ? 'e' : 'a'}` : `🎨 ${ok} grafic${ok > 1 ? 'he' : 'a'} caricat${ok > 1 ? 'e' : 'a'}`)
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

  // Approva una o più foto. La box è opzionale: se scelta, il materiale si
  // aggancia al contenuto; altrimenti finisce comunque tra le Approvate.
  async function approve(ids: string[]) {
    if (!ids.length) return
    const entry = targetEntry ? entryById.get(targetEntry) : null
    await Promise.all(ids.map(id =>
      updateRow('crm_media', id, { status: 'approvata', editorial_id: targetEntry || null })))
    notify('team', `⭐ ${ids.length} foto approvat${ids.length > 1 ? 'e' : 'a'} da ${profile?.full_name || 'Lorenzo'}`,
      entry
        ? `Per "${entry.title}" del ${fmtDate(entry.entry_date)}: il materiale è dentro la box, pronto per la grafica.`
        : 'Le trovi in Media → Approvate, pronte da lavorare.',
      entry ? 'editorial' : 'media')
    setPicked(new Set()); setTargetEntry('')
    toast(`✓ ${ids.length} foto approvat${ids.length > 1 ? 'e' : 'a'}${entry ? ` per "${entry.title}"` : ''}`)
    setTab('approvate')
    setLightbox(null)
    reload()
  }

  async function discard(m: MediaItem) {
    await updateRow('crm_media', m.id, { status: 'scartata' })
    toast('Foto scartata')
    setLightbox(null)
    reload()
  }

  async function markPublished(m: MediaItem) {
    await updateRow('crm_media', m.id, { status: 'pubblicata' })
    toast('✓ Segnata come pubblicata')
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

  const shown = tab === 'approvare' ? daApprovare : tab === 'approvate' ? approvate : tab === 'pubblicare' ? daPubblicare : pubblicati
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

      <div className="pill-tabs wrap" style={{ alignSelf: 'start' }}>
        <button className={`pill-tab ${tab === 'approvare' ? 'active' : ''}`} onClick={() => setTab('approvare')}>📥 Da approvare ({daApprovare.length})</button>
        <button className={`pill-tab ${tab === 'approvate' ? 'active' : ''}`} onClick={() => setTab('approvate')}>⭐ Approvate ({approvate.length})</button>
        <button className={`pill-tab ${tab === 'pubblicare' ? 'active' : ''}`} onClick={() => setTab('pubblicare')}>🛠 Da pubblicare ({daPubblicare.length})</button>
        <button className={`pill-tab ${tab === 'pubblicati' ? 'active' : ''}`} onClick={() => setTab('pubblicati')}>✅ Pubblicati ({pubblicati.length})</button>
      </div>

      {tab === 'approvare' && role === 'player' && daApprovare.length > 0 && (
        <div className="card flex between wrap gap" style={{ alignItems: 'center', borderColor: picked.size ? 'var(--accent)' : undefined }}>
          <div style={{ fontWeight: 650 }}>
            {picked.size ? `${picked.size} foto selezionat${picked.size > 1 ? 'e' : 'a'}` : 'Swipe → per approvare, ← per scartare · oppure usa ✓ e la selezione multipla'}
          </div>
          <div className="flex gap wrap" style={{ alignItems: 'center' }}>
            <Select value={targetEntry} onChange={e => setTargetEntry(e.target.value)} style={{ minWidth: 220 }}>
              <option value="">Collega a un post (opzionale)</option>
              {upcomingEntries.map(e => (
                <option key={e.id} value={e.id}>{fmtDate(e.entry_date)} · {e.title}</option>
              ))}
            </Select>
            {picked.size > 0 && (
              <button className="btn btn-primary" onClick={() => approve([...picked])}>
                ✓ Approva {picked.size}
              </button>
            )}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="card">
          <Empty icon={tab === 'pubblicati' ? '✅' : tab === 'pubblicare' ? '🛠' : tab === 'approvate' ? '⭐' : '📥'}
            title={tab === 'approvare' ? 'Niente da approvare' : tab === 'approvate' ? 'Nessuna foto approvata' : tab === 'pubblicare' ? 'Niente in lavorazione' : 'Nessun contenuto pubblicato'}
            hint={tab === 'approvare' ? 'Le foto caricate dal team compaiono qui in attesa di approvazione.'
              : tab === 'approvate' ? 'Le foto approvate dal giocatore arrivano qui in automatico, pronte da lavorare.'
              : tab === 'pubblicare' ? 'Qui trovi le grafiche in preparazione.'
              : 'Le grafiche caricate nelle box del calendario finiscono qui.'} />
        </div>
      ) : (
        <div className="media-grid">
          {shown.map((m, idx) => {
            const entry = m.editorial_id ? entryById.get(m.editorial_id) : null
            const isPicked = picked.has(m.id)
            const canSwipe = tab === 'approvare' && role === 'player' && isImageFile(m.file_name)
            const thumb = (
              <div style={{ position: 'relative' }}>
                {isImageFile(m.file_name) && urls[m.storage_path]
                  ? <img className="media-thumb" src={urls[m.storage_path]} alt={m.file_name || ''} loading="lazy"
                      onClick={() => setLightbox(idx)} />
                  : <div className="media-thumb media-ph" onClick={() => download(m)} style={{ cursor: 'pointer' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 26 }}>{m.kind === 'foto' ? '📸' : '🎨'}</div>
                        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '1px', marginTop: 4 }}>{fileExt(m.file_name)}</div>
                      </div>
                    </div>}
                {tab === 'approvare' && role === 'player' && (
                  <div className={`media-pick ${isPicked ? 'on' : ''}`} onClick={e => { e.stopPropagation(); togglePick(m.id) }}>{isPicked ? '✓' : ''}</div>
                )}
              </div>
            )
            return (
              <div className={`media-card ${isPicked ? 'media-selected' : ''}`} key={m.id}>
                {canSwipe
                  ? <SwipePhoto onApprove={() => approve([m.id])} onDiscard={() => discard(m)}>{thumb}</SwipePhoto>
                  : thumb}
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
                  {role === 'player' && tab === 'approvare' ? (
                    <div className="flex gap" style={{ marginTop: 8 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => approve([m.id])}>✓ Approva</button>
                      <button className="btn btn-sm" onClick={() => discard(m)} title="Scarta">✕</button>
                    </div>
                  ) : (
                    <div className="flex gap" style={{ marginTop: 8 }}>
                      <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => download(m)}>Scarica</button>
                      {isTeam && tab === 'pubblicare' && (
                        <button className="btn btn-sm" onClick={() => markPublished(m)} title="Segna come pubblicata">✓</button>
                      )}
                      {(isTeam || m.uploaded_by === session?.user.id) && <ConfirmButton onConfirm={() => remove(m)}>🗑</ConfirmButton>}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {lightbox != null && shown[lightbox] && (
        <Lightbox
          items={shown.map(m => ({ id: m.id, url: isImageFile(m.file_name) ? urls[m.storage_path] || null : null, name: m.file_name }))}
          index={lightbox}
          onIndex={setLightbox}
          onClose={() => setLightbox(null)}
          actions={item => {
            const m = shown.find(x => x.id === item.id)
            if (!m) return null
            if (role === 'player' && tab === 'approvare') {
              return (
                <>
                  <button className="btn btn-primary" onClick={() => approve([m.id])}>✓ Approva</button>
                  <button className="btn" onClick={() => discard(m)}>✕ Scarta</button>
                </>
              )
            }
            return <button className="btn" onClick={() => download(m)}>⬇ Scarica</button>
          }}
        />
      )}
    </div>
  )
}

// Swipe stile "storie": destra = approva, sinistra = scarta.
// Si attiva solo con gesto orizzontale, per non litigare con lo scroll.
function SwipePhoto({ children, onApprove, onDiscard }: {
  children: React.ReactNode; onApprove: () => void; onDiscard: () => void
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const active = useRef(false)

  function ts(e: React.TouchEvent) {
    start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    active.current = false
  }
  function tm(e: React.TouchEvent) {
    if (!start.current) return
    const ddx = e.touches[0].clientX - start.current.x
    const ddy = e.touches[0].clientY - start.current.y
    if (!active.current && Math.abs(ddx) > 14 && Math.abs(ddx) > Math.abs(ddy) * 1.4) active.current = true
    if (active.current) setDx(ddx)
  }
  function te() {
    if (active.current) {
      if (dx > 80) onApprove()
      else if (dx < -80) onDiscard()
    }
    setDx(0); start.current = null; active.current = false
  }

  return (
    <div className="swipe-wrap" onTouchStart={ts} onTouchMove={tm} onTouchEnd={te}
      style={{ transform: dx ? `translateX(${dx}px) rotate(${dx / 60}deg)` : undefined, transition: dx ? 'none' : 'transform .18s ease' }}>
      <div className="swipe-hint swipe-ok" style={{ opacity: dx > 40 ? Math.min(1, (dx - 40) / 60) : 0 }}>✓</div>
      <div className="swipe-hint swipe-no" style={{ opacity: dx < -40 ? Math.min(1, (-dx - 40) / 60) : 0 }}>✕</div>
      {children}
    </div>
  )
}
