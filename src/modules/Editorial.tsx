import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, PLAYER_NAME } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { notify } from '../lib/notify'
import { toast } from '../lib/toast'
import { Modal, Field, Input, Select, Textarea, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtDateTime, isImageFile, fileExt } from '../lib/format'
import type { EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'
const PLAYER_FIRST = (PLAYER_NAME || 'giocatore').split(' ')[0]

const TYPES: Record<string, { label: string; icon: string }> = {
  partita: { label: 'Partita', icon: 'ball' },
  post: { label: 'Post feed', icon: 'file' },
  carosello: { label: 'Carosello', icon: 'layers' },
  story: { label: 'Story', icon: 'smartphone' },
  reel: { label: 'Reel', icon: 'activity' },
  altro: { label: 'Altro', icon: 'pin' },
}

// Ambiente / mood del contenuto (per i contenuti non-partita).
const THEMES: Record<string, string> = {
  '': 'Nessun tema',
  family: 'Famiglia',
  lifestyle: 'Lifestyle',
  sponsor: 'Sponsor / Brand',
  allenamento: 'Allenamento',
  citta: 'Città / Viaggio',
  altro: 'Altro',
}

const STATUSES: Record<string, { label: string; tone?: 'green' | 'red' | 'gold' | 'blue' | 'accent' }> = {
  da_preparare: { label: 'Da preparare' },
  copy_pronto: { label: 'Copy pronto', tone: 'blue' },
  grafica_caricata: { label: 'Grafica caricata', tone: 'gold' },
  pronto: { label: 'Pronto ✓', tone: 'green' },
  pubblicato: { label: 'Pubblicato', tone: 'accent' },
}

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function Editorial() {
  const { isTeam } = useAuth()
  const { athleteId } = useAthlete()
  const { rows, loading, reload } = useCollection<EditorialEntry>('crm_editorial', { orderBy: 'entry_date', ascending: true, match: { player_id: athleteId } })
  const today = new Date()
  const [ym, setYm] = useState<[number, number]>([today.getFullYear(), today.getMonth()])
  const [view, setView] = useState<'cal' | 'lista'>('cal')
  const [openEntry, setOpenEntry] = useState<EditorialEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 880px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 880px)')
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  const byDate = useMemo(() => {
    const m = new Map<string, EditorialEntry[]>()
    rows.forEach(e => {
      const k = e.entry_date
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    })
    return m
  }, [rows])

  if (loading) return <Spinner />

  const [year, month] = ym
  const first = new Date(year, month, 1)
  const startPad = (first.getDay() + 6) % 7 // lunedì = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (cells.length % 7 !== 0) cells.push(null)
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const listEntries = [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date))
  const upcoming = listEntries.filter(e => e.entry_date >= todayKey)
  const past = listEntries.filter(e => e.entry_date < todayKey).reverse()

  function prevMonth() { setYm(month === 0 ? [year - 1, 11] : [year, month - 1]) }
  function nextMonth() { setYm(month === 11 ? [year + 1, 0] : [year, month + 1]) }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="card flex between wrap gap">
        <div className="flex gap" style={{ alignItems: 'center' }}>
          <button className="btn btn-sm" onClick={prevMonth}>‹</button>
          <div style={{ fontWeight: 750, fontSize: 16, minWidth: 150, textAlign: 'center' }}>{MONTHS[month]} {year}</div>
          <button className="btn btn-sm" onClick={nextMonth}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setYm([today.getFullYear(), today.getMonth()])}>Oggi</button>
        </div>
        <div className="flex gap">
          <div className="pill-tabs">
            <button className={`pill-tab ${view === 'cal' ? 'active' : ''}`} onClick={() => setView('cal')}>Calendario</button>
            <button className={`pill-tab ${view === 'lista' ? 'active' : ''}`} onClick={() => setView('lista')}>Lista</button>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> {isTeam ? 'Contenuto' : 'Proponi contenuto'}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="faint" style={{ fontSize: 12.5 }}>
          Le partite entrano da sole dal database: ogni fixture ha già la sua casella con tutte le info per le grafiche.
          Copy e grafiche si preparano dentro ogni contenuto.
        </div>
      </div>

      {view === 'cal' && isMobile ? (
        /* Vista agenda verticale ottimizzata per telefono */
        <div className="grid" style={{ gap: 10 }}>
          {(() => {
            const days = cells.filter((d): d is string => !!d && (byDate.get(d) || []).length > 0)
            if (days.length === 0) return <div className="card"><div className="faint" style={{ padding: '8px 0' }}>Nessun contenuto in {MONTHS[month]}.</div></div>
            return days.map(day => (
              <div className="card agenda-day" key={day}>
                <div className={`agenda-date ${day === todayKey ? 'agenda-today' : ''}`}>
                  <div className="agenda-dow">{DOW[(new Date(day + 'T12:00').getDay() + 6) % 7]}</div>
                  <div className="agenda-num">{Number(day.slice(8))}</div>
                </div>
                <div className="agenda-items">
                  {(byDate.get(day) || []).map(e => (
                    <EntryChip key={e.id} e={e} onOpen={setOpenEntry} full />
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      ) : view === 'cal' ? (
        <div className="card" style={{ padding: 12 }}>
          <div className="cal-grid cal-head">
            {DOW.map(d => <div key={d} className="cal-dow">{d}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((day, i) => {
              const entries = day ? byDate.get(day) || [] : []
              return (
                <div key={i} className={`cal-cell ${!day ? 'cal-empty' : ''} ${day === todayKey ? 'cal-today' : ''}`}>
                  {day && <div className="cal-daynum">{Number(day.slice(8))}</div>}
                  {entries.map(e => <EntryChip key={e.id} e={e} onOpen={setOpenEntry} />)}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid g2">
          <EntryList title="In arrivo" entries={upcoming} onOpen={setOpenEntry} empty="Niente in programma." />
          <EntryList title="Archivio" entries={past} onOpen={setOpenEntry} empty="Ancora nessun contenuto passato." />
        </div>
      )}

      {openEntry && (
        <EntryModal
          entry={rows.find(e => e.id === openEntry.id) || openEntry}
          onClose={() => setOpenEntry(null)}
          onChanged={reload}
        />
      )}
      {creating && <NewEntryModal onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload() }} />}
    </div>
  )
}

// Chip nel calendario: per le partite una mini-card che si legge senza aprire,
// per gli altri contenuti il chip compatto.
function EntryChip({ e, onOpen, full }: { e: EditorialEntry; onOpen: (e: EditorialEntry) => void; full?: boolean }) {
  if (e.type === 'partita' && e.match_info) {
    const mi = e.match_info
    const home = mi.venue === 'Home'
    const time = mi.kickoff ? new Date(mi.kickoff).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : ''
    const played = mi.status === 'FT' && mi.team_score != null
    const score = played ? (home ? `${mi.team_score}–${mi.opponent_score}` : `${mi.opponent_score}–${mi.team_score}`) : null
    return (
      <button className={`cal-match cal-${e.status} ${full ? 'cal-w-full' : ''}`} onClick={() => onOpen(e)} title={e.title}>
        <div className="cal-match-top">
          <span className="cal-league">{shortLeague(mi.league)}</span>
          <span>{home ? 'CASA' : 'TRASF'} · {score || time}</span>
        </div>
        <div className="cal-match-teams">{mi.home_team}<br />{mi.away_team}</div>
        <div className="cal-match-state">{STATUSES[e.status]?.label}</div>
      </button>
    )
  }
  return (
    <button className={`cal-chip cal-${e.status} ${full ? 'cal-w-full' : ''}`} onClick={() => onOpen(e)} title={e.title}>
      <Icon name={TYPES[e.type]?.icon || 'file'} size={11} style={{ verticalAlign: '-1.5px', marginRight: 4 }} />{e.title}
    </button>
  )
}

function shortLeague(l?: string | null) {
  if (!l) return ''
  if (/champions/i.test(l)) return 'UCL'
  if (/europa league/i.test(l)) return 'UEL'
  if (/conference/i.test(l)) return 'UECL'
  if (/super league/i.test(l)) return 'SL'
  if (/cup|coppa/i.test(l)) return 'CUP'
  return l.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4)
}

function EntryList({ title, entries, onOpen, empty }: {
  title: string; entries: EditorialEntry[]; onOpen: (e: EditorialEntry) => void; empty: string
}) {
  return (
    <div className="card">
      <div className="card-head"><div className="card-title">{title}</div><div className="card-hint">{entries.length}</div></div>
      {entries.length === 0 ? <div className="faint" style={{ padding: '10px 0' }}>{empty}</div> : (
        <div className="list">
          {entries.slice(0, 30).map(e => (
            <button className="row" key={e.id} onClick={() => onOpen(e)} style={{ textAlign: 'left', width: '100%' }}>
              <span style={{ color: 'var(--text-dim)' }}><Icon name={TYPES[e.type]?.icon || 'file'} size={16} /></span>
              <div className="row-main">
                <div className="row-title">{e.title}</div>
                <div className="row-sub">{fmtDate(e.entry_date)}{e.match_info?.league ? ` · ${e.match_info.league}` : ''}</div>
              </div>
              <Badge tone={STATUSES[e.status]?.tone}>{STATUSES[e.status]?.label}</Badge>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function EntryModal({ entry, onClose, onChanged }: {
  entry: EditorialEntry; onClose: () => void; onChanged: () => void
}) {
  const { profile, isAdmin, isTeam, session } = useAuth()
  const { athleteId } = useAthlete()
  const [copy, setCopy] = useState(entry.copy_text || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const materialRef = useRef<HTMLInputElement>(null)
  const mi = entry.match_info

  const grafiche = media.filter(m => m.kind !== 'foto')
  const approvate = media.filter(m => m.kind === 'foto' && m.status === 'approvata')

  async function loadMedia() {
    const { data } = await supabase.from('crm_media').select('*')
      .eq('editorial_id', entry.id).order('created_at')
    const items = (data as MediaItem[]) || []
    setMedia(items)
    const paths = items.map(m => m.storage_path)
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      if (signed) {
        const next: Record<string, string> = {}
        signed.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
        setUrls(u => ({ ...u, ...next }))
      }
    }
  }
  useEffect(() => { loadMedia() }, [entry.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCopy() {
    setSaving(true)
    const status = entry.status === 'da_preparare' && copy.trim() ? 'copy_pronto' : entry.status
    const { error } = await updateRow('crm_editorial', entry.id, { copy_text: copy || null, status })
    if (error) toast(error.message, 'err')
    else {
      if (copy.trim()) notify('player', `Copy pronto: ${entry.title}`, 'Il testo è pronto nel calendario editoriale.', 'editorial', athleteId)
      toast('Copy salvato')
      onChanged()
    }
    setSaving(false)
  }

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(copy)
      setCopied(true); setTimeout(() => setCopied(false), 1800)
      toast('Copy copiato negli appunti')
    } catch { /* ignore */ }
  }

  function downloadCopy() {
    const blob = new Blob([copy], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${entry.title.replace(/[^\w\- ]/g, '')} copy.txt`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true); setErr('')
    let ok = 0
    for (const file of files) {
      const path = `editorial/${entry.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
      if (up.error) { setErr(up.error.message); continue }
      // La grafica caricata nella box entra anche nei Media, sezione Pubblicati.
      const ins = await insertRow('crm_media', {
        storage_path: path, file_name: file.name, kind: 'grafica', status: 'pubblicata',
        editorial_id: entry.id, folder: 'Pubblicati', uploaded_by: session?.user.id,
        uploaded_role: profile?.role, note: entry.title, player_id: athleteId,
      })
      if (!ins.error) ok++
    }
    if (ok) {
      const status = ['da_preparare', 'copy_pronto'].includes(entry.status) ? 'grafica_caricata' : entry.status
      if (status !== entry.status) await updateRow('crm_editorial', entry.id, { status })
      notify(isTeam ? 'player' : 'team', `Grafica caricata: ${entry.title}`,
        `${ok} file pront${ok > 1 ? 'i' : 'o'} nel calendario editoriale.`, 'editorial', athleteId)
      toast(`${ok} grafic${ok > 1 ? 'he' : 'a'} caricat${ok > 1 ? 'e' : 'a'} — anche in Media, Pubblicati`)
      loadMedia(); onChanged()
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Materiale sorgente (foto) caricato dal giocatore o dal team dentro il contenuto:
  // entra già "approvato" e collegato al contenuto, pronto per la grafica.
  async function onUploadMaterial(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true); setErr('')
    let ok = 0
    try {
      for (const file of files) {
        const path = `editorial/${entry.id}/mat-${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
        const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
        if (up.error) { toast(up.error.message, 'err'); continue }
        const ins = await insertRow('crm_media', {
          storage_path: path, file_name: file.name, kind: 'foto', status: 'approvata',
          editorial_id: entry.id, uploaded_by: session?.user.id, uploaded_role: profile?.role, note: entry.title, player_id: athleteId,
        })
        if (!ins.error) ok++
      }
      if (ok) {
        notify(isTeam ? 'player' : 'team', `Materiale per "${entry.title}"`,
          `${ok} file caricat${ok > 1 ? 'i' : 'o'} nel contenuto, pronto per la grafica.`, 'editorial', athleteId)
        toast(`${ok} file aggiunt${ok > 1 ? 'i' : 'o'} al materiale`)
        loadMedia(); onChanged()
      }
    } finally {
      setUploading(false)
      if (materialRef.current) materialRef.current.value = ''
    }
  }

  async function openAsset(m: MediaItem) {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300, { download: m.file_name || undefined })
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  async function removeAsset(m: MediaItem) {
    await supabase.storage.from(BUCKET).remove([m.storage_path])
    await deleteRow('crm_media', m.id)
    loadMedia()
  }

  async function setStatus(s: string) {
    await updateRow('crm_editorial', entry.id, { status: s })
    // Alla pubblicazione: le grafiche del contenuto confluiscono nell'archivio "Pubblicati".
    if (s === 'pubblicato') {
      await supabase.from('crm_media')
        .update({ folder: 'Pubblicati', status: 'pubblicata' })
        .eq('editorial_id', entry.id).eq('kind', 'grafica')
      toast('Contenuto pubblicato — grafiche archiviate in Media → Pubblicati')
    }
    onChanged()
  }

  async function removeEntry() {
    await deleteRow('crm_editorial', entry.id)
    onClose(); onChanged()
  }

  return (
    <Modal title={entry.title} onClose={onClose} wide
      footer={
        <div className="flex between wrap gap" style={{ width: '100%' }}>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            <Select value={entry.status} onChange={e => setStatus(e.target.value)} style={{ width: 180 }}>
              {Object.entries(STATUSES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
            {isAdmin && entry.type !== 'partita' && <ConfirmButton onConfirm={removeEntry}>Elimina</ConfirmButton>}
          </div>
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      }>
      <div className="grid" style={{ gap: 14 }}>
        <div className="flex gap wrap" style={{ alignItems: 'center' }}>
          <Badge tone={STATUSES[entry.status]?.tone}>{STATUSES[entry.status]?.label}</Badge>
          <Badge>{TYPES[entry.type]?.label || entry.type}</Badge>
          {entry.theme && <Badge>{THEMES[entry.theme] || entry.theme}</Badge>}
          {entry.requested_by && <Badge tone="accent">Proposto da {PLAYER_FIRST}</Badge>}
          <span className="faint" style={{ fontSize: 12.5 }}>{fmtDate(entry.entry_date)}</span>
        </div>

        {entry.brief && (
          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.8px', fontWeight: 700, marginBottom: 4 }}>Brief</div>
            <div style={{ fontSize: 13.5 }}>{entry.brief}</div>
          </div>
        )}

        {mi && (
          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <div className="card-head"><div className="card-title">Info partita per le grafiche</div></div>
            <div className="grid g3" style={{ gap: 10 }}>
              <Info k="Match" v={`${mi.home_team ?? '—'} vs ${mi.away_team ?? '—'}`} />
              <Info k="Competizione" v={mi.league} />
              <Info k="Giornata" v={mi.round} />
              <Info k="Calcio d'inizio" v={mi.kickoff ? fmtDateTime(mi.kickoff) : null} />
              <Info k="Stadio" v={mi.stadium} />
              <Info k="Casa/Trasferta" v={mi.venue === 'Home' ? 'In casa' : mi.venue === 'Away' ? 'Trasferta' : mi.venue} />
              {mi.status === 'FT' && <Info k="Risultato" v={`${mi.team_score ?? '—'}–${mi.opponent_score ?? '—'}`} />}
            </div>
          </div>
        )}

        <div>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 650 }}>Copy</div>
            <div className="flex gap">
              <button className="btn btn-sm" onClick={copyToClipboard} disabled={!copy}>{copied ? 'Copiato ✓' : 'Copia'}</button>
              <button className="btn btn-sm" onClick={downloadCopy} disabled={!copy}>Scarica .txt</button>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveCopy}>{saving ? 'Salvo…' : 'Salva copy'}</button>
            </div>
          </div>
          <Textarea rows={5} value={copy} onChange={e => setCopy(e.target.value)}
            placeholder="Scrivi qui il copy del post: didascalia, hashtag, tag…" />
          <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Copy modificabile da entrambi: il team lo prepara, tu lo approvi o lo ritocchi.</div>
        </div>

        <div>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 650 }}>
              Materiale{approvate.length ? '' : ' per la grafica'}
              {approvate.length > 0 && <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}> · {approvate.length} file pronti</span>}
            </div>
            <button className="btn btn-sm" disabled={uploading} onClick={() => materialRef.current?.click()}>
              <Icon name="upload" size={13} /> {uploading ? 'Carico…' : 'Carica materiale'}
            </button>
            <input ref={materialRef} type="file" multiple accept="image/*,video/*" hidden onChange={onUploadMaterial} />
          </div>
          {approvate.length === 0
            ? <div className="faint" style={{ fontSize: 12.5, padding: '6px 0' }}>Carica qui le foto/video da cui il team preparerà la grafica.</div>
            : (
              <div className="asset-grid">
                {approvate.map(m => (
                  <div className="asset-card" key={m.id} title={m.file_name || ''} style={{ position: 'relative' }}>
                    <div onClick={() => openAsset(m)}>
                      {isImageFile(m.file_name) && urls[m.storage_path]
                        ? <img src={urls[m.storage_path]} alt="" loading="lazy" />
                        : <div className="asset-ph"><Icon name="camera" size={20} strokeWidth={1.4} /></div>}
                    </div>
                    {(isAdmin || m.uploaded_by === session?.user.id) && (
                      <button className="asset-del" title="Rimuovi" onClick={() => removeAsset(m)}><Icon name="x" size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>

        <div>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 650 }}>Grafiche pronte</div>
            {isTeam && (
              <>
                <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Carico…' : 'Carica grafica'}
                </button>
                <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.psd,.ai" hidden onChange={onUpload} />
              </>
            )}
          </div>
          {grafiche.length === 0
            ? <div className="faint" style={{ fontSize: 12.5, padding: '6px 0' }}>{isTeam ? 'Carica qui i file pronti da pubblicare: finiscono anche in Media → Pubblicati.' : 'Il team caricherà qui la grafica finale, pronta da pubblicare.'}</div>
            : (
              <div className="list">
                {grafiche.map(m => (
                  <div className="row" key={m.id}>
                    {isImageFile(m.file_name) && urls[m.storage_path]
                      ? <img className="row-thumb" src={urls[m.storage_path]} alt="" loading="lazy" onClick={() => openAsset(m)} />
                      : <span className="row-thumb file-badge" onClick={() => openAsset(m)}>{fileExt(m.file_name)}</span>}
                    <div className="row-main">
                      <div className="row-title">{m.file_name}</div>
                      <div className="row-sub">{fmtDateTime(m.created_at)}</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => openAsset(m)}>Scarica</button>
                    {isAdmin && <ConfirmButton onConfirm={() => removeAsset(m)}>×</ConfirmButton>}
                  </div>
                ))}
              </div>
            )}
        </div>

        {err && <div className="msg-err">{err}</div>}
      </div>
    </Modal>
  )
}

function Info({ k, v }: { k: string; v: any }) {
  return <div><div className="faint" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 650, fontSize: 13.5 }}>{v ?? '—'}</div></div>
}

function NewEntryModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { session, isTeam, profile } = useAuth()
  const { athleteId } = useAthlete()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [type, setType] = useState('post')
  const [theme, setTheme] = useState('')
  const [brief, setBrief] = useState('')
  const [copy, setCopy] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function create() {
    if (!title.trim()) { setErr('Serve un titolo.'); return }
    setBusy(true); setErr('')
    const isRequest = !isTeam
    const { error } = await insertRow('crm_editorial', {
      title: title.trim(), entry_date: date, type,
      theme: theme || null,
      brief: brief.trim() || null,
      copy_text: copy.trim() || null,
      status: copy.trim() ? 'copy_pronto' : 'da_preparare',
      requested_by: isRequest ? session?.user.id : null, player_id: athleteId,
    })
    setBusy(false)
    if (error) { setErr(error.message); return }
    if (isRequest) {
      notify('team', `Nuova proposta da ${profile?.full_name || 'Lorenzo'}`,
        `${TYPES[type]?.label || 'Contenuto'}${theme ? ` · ${THEMES[theme]}` : ''} per il ${fmtDate(date)}: "${title.trim()}". Apri per vedere brief e materiale.`,
        'editorial')
    }
    toast(isRequest ? 'Proposta inviata al team' : 'Contenuto creato')
    onCreated()
  }

  return (
    <Modal title={isTeam ? 'Nuovo contenuto' : 'Proponi un contenuto'} onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={create}>{busy ? 'Invio…' : isTeam ? 'Crea' : 'Invia al team'}</button></>}>
      <div className="grid" style={{ gap: 14 }}>
        {!isTeam && (
          <div className="faint" style={{ fontSize: 12.5 }}>
            Segna qui l'idea: scegli tipo e ambiente, descrivi cosa hai in mente, aggiungi il copy se vuoi.
            Il team riceve la notifica e prepara tutto. Il materiale lo carichi dentro il contenuto una volta creato.
          </div>
        )}
        <Field label="Titolo"><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Es. Post con la famiglia, Reel allenamento…" autoFocus /></Field>
        <div className="grid g3" style={{ gap: 12 }}>
          <Field label="Data"><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field>
          <Field label="Formato">
            <Select value={type} onChange={e => setType(e.target.value)}>
              {Object.entries(TYPES).filter(([k]) => k !== 'partita').map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Ambiente">
            <Select value={theme} onChange={e => setTheme(e.target.value)}>
              {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Cosa hai in mente (brief)">
          <Textarea rows={3} value={brief} onChange={e => setBrief(e.target.value)}
            placeholder="Es. Post con mia moglie in formato carosello, foto al tramonto dopo la partita…" />
        </Field>
        <Field label="Copy (facoltativo — il team lo rifinisce, poi tu approvi)">
          <Textarea rows={3} value={copy} onChange={e => setCopy(e.target.value)}
            placeholder="Se hai già in testa la didascalia, scrivila qui." />
        </Field>
        {err && <div className="msg-err">{err}</div>}
      </div>
    </Modal>
  )
}
