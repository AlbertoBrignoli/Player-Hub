import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { notify } from '../lib/notify'
import { toast } from '../lib/toast'
import { Modal, Field, Input, Select, Textarea, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtDateTime, fmtMatchTime, fmtMatchDateTime, isImageFile, fileExt } from '../lib/format'
import type { EditorialEntry, MediaItem } from '../lib/types'

const BUCKET = 'crm-media'

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

const moveBtn = (disabled: boolean): React.CSSProperties => ({
  width: 24, height: 24, borderRadius: 7, border: 'none', cursor: disabled ? 'default' : 'pointer',
  background: 'rgba(0,0,0,.72)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.35 : 1,
})

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function Editorial() {
  const { isTeam } = useAuth()
  const { athleteId, athleteTz } = useAthlete()
  const { t } = useLang()
  const { rows, loading, reload } = useCollection<EditorialEntry>('crm_editorial', { orderBy: 'entry_date', ascending: true, match: { player_id: athleteId } })
  const today = new Date()
  const [ym, setYm] = useState<[number, number]>([today.getFullYear(), today.getMonth()])
  const [view, setView] = useState<'cal' | 'lista' | 'pubblicati'>('cal')
  const [openEntry, setOpenEntry] = useState<EditorialEntry | null>(null)
  const [creating, setCreating] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 880px)').matches)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 880px)')
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [])

  // Anteprima per ogni contenuto: la grafica finale se c'è, altrimenti una foto approvata.
  // Serve a far capire a colpo d'occhio che c'è materiale da vedere, senza aprire.
  const [previews, setPreviews] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    ;(async () => {
      const ids = rows.map(r => r.id)
      if (!ids.length) { setPreviews({}); return }
      const { data } = await supabase.from('crm_media')
        .select('editorial_id, kind, status, storage_path, file_name')
        .in('editorial_id', ids).in('kind', ['grafica', 'foto'])
      if (!data) return
      const best: Record<string, { path: string; score: number }> = {}
      for (const m of data as any[]) {
        if (!m.storage_path || !isImageFile(m.file_name)) continue
        const score = m.kind === 'grafica' ? 3 : (m.status === 'approvata' ? 2 : 1)
        const cur = best[m.editorial_id]
        if (!cur || score > cur.score) best[m.editorial_id] = { path: m.storage_path, score }
      }
      const paths = [...new Set(Object.values(best).map(b => b.path))]
      if (!paths.length) { if (alive) setPreviews({}); return }
      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
      const byPath: Record<string, string> = {}
      ;(signed || []).forEach((s: any) => { if (s.signedUrl && s.path) byPath[s.path] = s.signedUrl })
      const map: Record<string, string> = {}
      for (const [eid, b] of Object.entries(best)) if (byPath[b.path]) map[eid] = byPath[b.path]
      if (alive) setPreviews(map)
    })()
    return () => { alive = false }
  }, [rows])

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
          <div style={{ fontWeight: 750, fontSize: 16, minWidth: 150, textAlign: 'center' }}>{t(MONTHS[month])} {year}</div>
          <button className="btn btn-sm" onClick={nextMonth}>›</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setYm([today.getFullYear(), today.getMonth()])}>{t('Oggi')}</button>
        </div>
        <div className="flex gap">
          <div className="pill-tabs">
            <button className={`pill-tab ${view === 'cal' ? 'active' : ''}`} onClick={() => setView('cal')}>{t('Calendario')}</button>
            <button className={`pill-tab ${view === 'lista' ? 'active' : ''}`} onClick={() => setView('lista')}>{t('Lista')}</button>
            <button className={`pill-tab ${view === 'pubblicati' ? 'active' : ''}`} onClick={() => setView('pubblicati')}>{t('Pubblicati')}</button>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> {isTeam ? t('Contenuto') : 'Proponi contenuto'}
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
            if (days.length === 0) return <div className="card"><div className="faint" style={{ padding: '8px 0' }}>{t('Nessun contenuto in')} {t(MONTHS[month])}.</div></div>
            return days.map(day => (
              <div className="card agenda-day" key={day}>
                <div className={`agenda-date ${day === todayKey ? 'agenda-today' : ''}`}>
                  <div className="agenda-dow">{t(DOW[(new Date(day + 'T12:00').getDay() + 6) % 7])}</div>
                  <div className="agenda-num">{Number(day.slice(8))}</div>
                </div>
                <div className="agenda-items">
                  {(byDate.get(day) || []).map(e => (
                    <EntryChip key={e.id} e={e} onOpen={setOpenEntry} preview={previews[e.id]} tz={athleteTz} full />
                  ))}
                </div>
              </div>
            ))
          })()}
        </div>
      ) : view === 'cal' ? (
        <div className="card" style={{ padding: 12 }}>
          <div className="cal-grid cal-head">
            {DOW.map(d => <div key={d} className="cal-dow">{t(d)}</div>)}
          </div>
          <div className="cal-grid">
            {cells.map((day, i) => {
              const entries = day ? byDate.get(day) || [] : []
              return (
                <div key={i} className={`cal-cell ${!day ? 'cal-empty' : ''} ${day === todayKey ? 'cal-today' : ''}`}>
                  {day && <div className="cal-daynum">{Number(day.slice(8))}</div>}
                  {entries.map(e => <EntryChip key={e.id} e={e} onOpen={setOpenEntry} preview={previews[e.id]} tz={athleteTz} />)}
                </div>
              )
            })}
          </div>
        </div>
      ) : view === 'pubblicati' ? (
        <EntryList title={t('Pubblicati ✓')} entries={listEntries.filter(e => e.status === 'pubblicato').reverse()}
          onOpen={setOpenEntry} empty="Ancora nessun contenuto pubblicato. Confermando un post come pubblicato, finisce qui." />
      ) : (
        <div className="grid g2">
          <EntryList title={t('In arrivo')} entries={upcoming} onOpen={setOpenEntry} empty={t('Niente in programma.')} />
          <EntryList title={t('Archivio')} entries={past} onOpen={setOpenEntry} empty={t('Ancora nessun contenuto passato.')} />
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
function EntryChip({ e, onOpen, preview, tz, full }: { e: EditorialEntry; onOpen: (e: EditorialEntry) => void; preview?: string; tz?: string; full?: boolean }) {
  const { t } = useLang()
  if (e.type === 'partita' && e.match_info) {
    const mi = e.match_info
    const home = mi.venue === 'Home'
    const time = mi.kickoff ? fmtMatchTime(mi.kickoff, tz) : ''
    const played = mi.status === 'FT' && mi.team_score != null
    const score = played ? (home ? `${mi.team_score}–${mi.opponent_score}` : `${mi.opponent_score}–${mi.team_score}`) : null
    return (
      <button className={`cal-match cal-${e.status} ${full ? 'cal-w-full' : ''}`} onClick={() => onOpen(e)} title={e.title}>
        <div className="cal-match-top">
          <span className="cal-league"><Icon name="instagram" size={10} style={{ verticalAlign: '-1px', marginRight: 3, color: e.status === 'pubblicato' ? '#E1306C' : 'currentColor', opacity: e.status === 'pubblicato' ? 1 : 0.55 }} />{shortLeague(mi.league)}</span>
          <span>{home ? t('CASA') : t('TRASF')} · {score || time}</span>
        </div>
        <div className="cal-match-teams">{mi.home_team}<br />{mi.away_team}</div>
        <div className="cal-match-state">{t(STATUSES[e.status]?.label || '')}</div>
      </button>
    )
  }
  const st = STATUSES[e.status]
  const toneColor = (t?: string) => t === 'green' ? '#3ECF8E' : t === 'gold' ? '#E5A400' : t === 'blue' ? '#4A9EE8' : t === 'accent' ? '#E1306C' : 'var(--text-dim)'
  const accent = toneColor(st?.tone)
  return (
    <button className={`cal-chip-rich ${full ? 'cal-w-full' : ''}`} onClick={() => onOpen(e)} title={`${e.title} · Instagram`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px',
        borderRadius: 10, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`, color: 'var(--text)' }}>
      <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        background: 'var(--surface-2, #17171d)', display: 'grid', placeItems: 'center', color: 'var(--text-dim)' }}>
        {preview
          ? <img src={preview} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Icon name={TYPES[e.type]?.icon || 'image'} size={16} strokeWidth={1.5} />}
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: 5,
          background: 'rgba(0,0,0,.7)', display: 'grid', placeItems: 'center' }}>
          <Icon name="instagram" size={9} style={{ color: e.status === 'pubblicato' ? '#E1306C' : '#fff' }} />
        </span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{e.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent, flexShrink: 0 }} />
          <span style={{ fontSize: 9.5, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.3, fontWeight: 700 }}>{t(st?.label || '')}</span>
          {preview && <><span style={{ color: 'var(--text-dim)', fontSize: 9.5 }}>·</span><Icon name="image" size={10} style={{ color: 'var(--text-dim)' }} /></>}
        </div>
      </div>
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
              <span className="flex gap" style={{ alignItems: 'center', gap: 6 }}>
                <Icon name="instagram" size={15} style={{ color: e.status === 'pubblicato' ? '#E1306C' : 'var(--text-dim)' }} />
                <span style={{ color: 'var(--text-dim)' }}><Icon name={TYPES[e.type]?.icon || 'file'} size={16} /></span>
              </span>
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
  const { athleteId, athleteTz } = useAthlete()
  const [copy, setCopy] = useState(entry.copy_text || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [err, setErr] = useState('')
  const [media, setMedia] = useState<MediaItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [brandName, setBrandName] = useState<string | null>(null)
  const [hCopied, setHCopied] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [igOpen, setIgOpen] = useState(false)
  const [genBusy, setGenBusy] = useState<'pre' | 'post' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const materialRef = useRef<HTMLInputElement>(null)
  const mi = entry.match_info

  useEffect(() => {
    if (!entry.brand_id) { setBrandName(null); return }
    supabase.from('crm_brands').select('name').eq('id', entry.brand_id).maybeSingle()
      .then(({ data }) => setBrandName((data as any)?.name || 'Brand'))
  }, [entry.brand_id])

  async function copyHashtags() {
    try {
      await navigator.clipboard.writeText(entry.hashtags || '')
      setHCopied(true); setTimeout(() => setHCopied(false), 1800)
      toast('Hashtag copiati negli appunti')
    } catch { /* ignore */ }
  }

  const grafiche = media.filter(m => m.kind !== 'foto')
  const approvate = media.filter(m => m.kind === 'foto' && m.status === 'approvata')
    .sort((a, b) => (a.sort ?? 9999) - (b.sort ?? 9999) || (a.created_at < b.created_at ? -1 : 1))

  // Riordino carosello: sposta una foto e ripersiste l'ordine (sort = posizione) su tutte.
  async function moveMaterial(index: number, dir: -1 | 1) {
    const arr = [...approvate]
    const j = index + dir
    if (j < 0 || j >= arr.length) return
    ;[arr[index], arr[j]] = [arr[j], arr[index]]
    await Promise.all(arr.map((m, i) => updateRow('crm_media', m.id, { sort: i })))
    loadMedia()
  }

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
      if (copy.trim()) notify(isTeam ? 'player' : 'team', `Copy aggiornato: ${entry.title}`, 'Il testo del post è stato aggiornato nel calendario editoriale.', 'editorial', athleteId)
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
    try {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300)
      if (!data?.signedUrl) return
      const res = await fetch(data.signedUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = m.file_name || 'grafica'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300, { download: m.file_name || undefined })
      if (data?.signedUrl) window.open(data.signedUrl, '_blank')
    }
  }

  async function removeAsset(m: MediaItem) {
    // Se è una foto COLLEGATA dalla libreria non tocchiamo il file (è condiviso): rimuoviamo solo il riferimento.
    if (!m.source_media_id) await supabase.storage.from(BUCKET).remove([m.storage_path])
    await deleteRow('crm_media', m.id)
    loadMedia()
  }

  // Collega al contenuto foto già presenti in Media (nessun nuovo upload: si crea un riferimento).
  async function linkFromMedia(items: MediaItem[]) {
    const already = new Set(media.filter(m => m.source_media_id).map(m => m.source_media_id))
    let ok = 0
    for (const it of items) {
      if (already.has(it.id)) continue
      const ins = await insertRow('crm_media', {
        storage_path: it.storage_path, file_name: it.file_name, kind: 'foto', status: 'approvata',
        editorial_id: entry.id, source_media_id: it.id, uploaded_by: session?.user.id,
        uploaded_role: profile?.role, note: entry.title, player_id: athleteId,
      })
      if (!ins.error) ok++
    }
    setPickerOpen(false)
    if (ok) {
      notify(isTeam ? 'player' : 'team', `Materiale per "${entry.title}"`,
        `${ok} foto selezionat${ok > 1 ? 'e' : 'a'} dalla libreria, pronte per la grafica.`, 'editorial', athleteId)
      toast(`${ok} foto collegat${ok > 1 ? 'e' : 'a'} dalla libreria`)
      loadMedia(); onChanged()
    }
  }

  async function setStatus(s: string) {
    // Non si può approvare/pubblicare finché l'atleta non ha caricato il materiale:
    // altrimenti il team vedrebbe "approvato" senza avere le foto per la grafica.
    if ((s === 'pronto' || s === 'pubblicato') && approvate.length === 0) {
      toast('Per approvare carica prima il materiale: le foto da cui il team preparerà la grafica.', 'err')
      return
    }
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

  // Storia Instagram generata dal server (foto dalla Media + statistiche):
  // la stessa routine gira da sola via cron, qui si può (ri)generare al volo.
  async function generateStory(kind: 'pre' | 'post') {
    setGenBusy(kind)
    try {
      const { data, error } = await supabase.functions.invoke('generate-story', {
        body: { editorial_id: entry.id, type: kind },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))
      if (data?.skipped) { toast(String(data.skipped)); return }
      toast(`Storia ${kind === 'pre' ? 'pre' : 'post'}-match generata ✓`)
      loadMedia(); onChanged()
    } catch (e: any) {
      toast(e?.message || 'Generazione non riuscita', 'err')
    } finally {
      setGenBusy(null)
    }
  }

  async function removeEntry() {
    await deleteRow('crm_editorial', entry.id)
    onClose(); onChanged()
  }

  // Conferma pubblicazione: segna il contenuto come pubblicato, sposta le grafiche
  // finali nella cartella "Pubblicati" della Media e avvisa la controparte (per il
  // team è il segnale che il lavoro è andato a buon fine).
  async function publish() {
    if (approvate.length === 0) { toast('Per confermare la pubblicazione serve prima il materiale.', 'err'); return }
    const { error } = await updateRow('crm_editorial', entry.id, { status: 'pubblicato' })
    if (error) { setErr(error.message); return }
    await supabase.from('crm_media').update({ status: 'pubblicata', folder: 'Pubblicati' })
      .eq('editorial_id', entry.id).eq('kind', 'grafica')
    notify(isTeam ? 'player' : 'team', `Pubblicato: ${entry.title}`,
      'Contenuto confermato come pubblicato — lavoro completato ✓', 'editorial', athleteId)
    toast('Segnato come pubblicato ✓'); onChanged()
  }

  return (
    <Modal title={entry.title} onClose={onClose} wide
      footer={
        <div className="flex between wrap gap" style={{ width: '100%' }}>
          <div className="flex gap" style={{ alignItems: 'center' }}>
            <Select value={entry.status} onChange={e => setStatus(e.target.value)} style={{ width: 200 }}>
              {Object.entries(STATUSES).map(([k, v]) => {
                const locked = (k === 'pronto' || k === 'pubblicato') && approvate.length === 0
                return <option key={k} value={k} disabled={locked}>{v.label}{locked ? ' · manca materiale' : ''}</option>
              })}
            </Select>
            {isAdmin && entry.type !== 'partita' && <ConfirmButton onConfirm={removeEntry}>Elimina</ConfirmButton>}
          </div>
          <div className="flex gap">
            {approvate.length > 0 && (
              <button className="btn" onClick={() => setIgOpen(true)} title="Copia la caption e scarica le foto in ordine">
                <Icon name="image" size={14} /> Prepara per Instagram
              </button>
            )}
            {entry.status !== 'pubblicato' && (
              <button className="btn btn-primary" onClick={publish} disabled={approvate.length === 0}
                title={approvate.length === 0 ? 'Serve prima il materiale' : 'Conferma che il post è stato pubblicato'}>
                <Icon name="check" size={14} /> Conferma pubblicato
              </button>
            )}
            <button className="btn" onClick={onClose}>Chiudi</button>
          </div>
        </div>
      }>
      <div className="grid" style={{ gap: 14 }}>
        <div className="flex gap wrap" style={{ alignItems: 'center' }}>
          <Badge tone={STATUSES[entry.status]?.tone}>{STATUSES[entry.status]?.label}</Badge>
          <Badge>{TYPES[entry.type]?.label || entry.type}</Badge>
          {entry.theme && <Badge>{THEMES[entry.theme] || entry.theme}</Badge>}
          {brandName && <Badge tone="red">Contenuto {brandName}</Badge>}
          {entry.requested_by && <Badge tone="accent">Proposto dal giocatore</Badge>}
          <span className="faint" style={{ fontSize: 12.5 }}>{fmtDate(entry.entry_date)}</span>
        </div>
        {approvate.length === 0 && entry.status !== 'pubblicato' && (
          <div style={{ fontSize: 12.5, color: '#e5a400', background: 'rgba(229,164,0,.10)',
            border: '1px solid rgba(229,164,0,.35)', borderRadius: 10, padding: '9px 12px',
            display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} /> Per approvare (Pronto ✓) serve prima il materiale: carica o seleziona le foto qui sotto, così il team ha di che lavorare.
          </div>
        )}

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
              <Info k="Calcio d'inizio" v={mi.kickoff ? fmtMatchDateTime(mi.kickoff, athleteTz) : null} />
              <Info k="Stadio" v={mi.stadium} />
              <Info k="Casa/Trasferta" v={mi.venue === 'Home' ? 'In casa' : mi.venue === 'Away' ? 'Trasferta' : mi.venue} />
              {mi.status === 'FT' && <Info k="Risultato" v={`${mi.team_score ?? '—'}–${mi.opponent_score ?? '—'}`} />}
            </div>
            <div className="flex gap wrap" style={{ marginTop: 12 }}>
              <button className="btn btn-sm" disabled={genBusy !== null} onClick={() => generateStory('pre')}
                title="Storia 1080×1920 con foto dalla Media e info partita — si genera anche da sola 24h prima del kickoff">
                <Icon name="image" size={13} /> {genBusy === 'pre' ? 'Genero…' : 'Genera storia pre-match'}
              </button>
              {mi.status === 'FT' && (
                <button className="btn btn-sm" disabled={genBusy !== null} onClick={() => generateStory('post')}
                  title="Storia 1080×1920 con risultato e statistiche personali — si genera da sola quando arrivano le statistiche">
                  <Icon name="activity" size={13} /> {genBusy === 'post' ? 'Genero…' : 'Genera storia post-match'}
                </button>
              )}
              <span className="faint" style={{ fontSize: 11.5, alignSelf: 'center' }}>
                Le storie si creano da sole: pre-match 24h prima, post-match con le statistiche. Qui puoi rigenerarle.
              </span>
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

        {entry.hashtags && (
          <div>
            <div className="flex between" style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 650 }}>Hashtag {brandName ? `· da ${brandName}` : ''}</div>
              <button className="btn btn-sm" onClick={copyHashtags}>{hCopied ? 'Copiati ✓' : 'Copia hashtag'}</button>
            </div>
            <div className="card" style={{ background: 'var(--bg-2)', fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{entry.hashtags}</div>
          </div>
        )}

        <div>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 650 }}>
              Materiale{approvate.length ? '' : ' per la grafica'}
              {approvate.length > 0 && <span className="faint" style={{ fontWeight: 400, fontSize: 12 }}> · {approvate.length} file pronti</span>}
            </div>
            <div className="flex gap" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setPickerOpen(true)}>
                <Icon name="image" size={13} /> Seleziona da Media
              </button>
              <button className="btn btn-sm" disabled={uploading} onClick={() => materialRef.current?.click()}>
                <Icon name="upload" size={13} /> {uploading ? 'Carico…' : 'Carica materiale'}
              </button>
            </div>
            <input ref={materialRef} type="file" multiple accept="image/*,video/*" hidden onChange={onUploadMaterial} />
          </div>
          {approvate.length === 0
            ? <div className="faint" style={{ fontSize: 12.5, padding: '6px 0' }}>Carica qui le foto/video da cui il team preparerà la grafica.</div>
            : (
              <div className="asset-grid">
                {approvate.map((m, i) => (
                  <div className="asset-card" key={m.id} title={m.file_name || ''} style={{ position: 'relative' }}>
                    <div onClick={() => openAsset(m)}>
                      {isImageFile(m.file_name) && urls[m.storage_path]
                        ? <img src={urls[m.storage_path]} alt="" loading="lazy" />
                        : <div className="asset-ph"><Icon name="camera" size={20} strokeWidth={1.4} /></div>}
                    </div>
                    {/* numero d'ordine nel carosello */}
                    <div style={{ position: 'absolute', top: 6, left: 6, minWidth: 20, height: 20, padding: '0 5px',
                      borderRadius: 10, background: 'rgba(0,0,0,.72)', color: '#fff', fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                    {/* frecce per ordinare il carosello */}
                    {approvate.length > 1 && (
                      <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 4 }}>
                        <button title="Sposta prima" disabled={i === 0} onClick={() => moveMaterial(i, -1)}
                          style={moveBtn(i === 0)}><span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron-right" size={13} /></span></button>
                        <button title="Sposta dopo" disabled={i === approvate.length - 1} onClick={() => moveMaterial(i, 1)}
                          style={moveBtn(i === approvate.length - 1)}><Icon name="chevron-right" size={13} /></button>
                      </div>
                    )}
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
      {pickerOpen && (
        <MediaPicker athleteId={athleteId}
          excludeSourceIds={media.filter(m => m.source_media_id).map(m => m.source_media_id as string)}
          onClose={() => setPickerOpen(false)} onConfirm={linkFromMedia} />
      )}
      {igOpen && <InstagramExport caption={copy} title={entry.title} photos={approvate} urls={urls} onClose={() => setIgOpen(false)} />}
    </Modal>
  )
}

// Stopgap "Pronto per Instagram": copia la caption e salva le foto già nell'ordine
// del carosello. Su telefono usa lo Share Sheet ("Salva N immagini" → tutte nel
// rullino, in ordine); su desktop scarica i file numerati.
function InstagramExport({ caption, title, photos, urls, onClose }: {
  caption: string; title: string; photos: MediaItem[]; urls: Record<string, string>; onClose: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [preparing, setPreparing] = useState(true)
  const base = (title || 'post').replace(/[^\w\- ]/g, '').trim().replace(/\s+/g, '-') || 'post'

  // Preparo i file in anticipo (nell'ordine): così al tap lo Share parte subito
  // senza perdere il "gesto utente" richiesto da iOS.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const out: File[] = []
      for (let i = 0; i < photos.length; i++) {
        const url = urls[photos[i].storage_path]; if (!url) continue
        try {
          const blob = await (await fetch(url)).blob()
          const ext = (photos[i].file_name?.split('.').pop() || 'jpg').toLowerCase()
          out.push(new File([blob], `${String(i + 1).padStart(2, '0')}-${base}.${ext}`, { type: blob.type || 'image/jpeg' }))
        } catch { /* salto foto non recuperabile */ }
      }
      if (alive) { setFiles(out); setPreparing(false) }
    })()
    return () => { alive = false }
  }, [photos, urls]) // eslint-disable-line react-hooks/exhaustive-deps

  const canShareFiles = !preparing && files.length > 0 &&
    typeof navigator !== 'undefined' && !!navigator.canShare && (() => { try { return navigator.canShare({ files }) } catch { return false } })()

  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); toast('Caption copiata') }
    catch { toast('Copia non riuscita', 'err') }
  }

  async function savePhotos() {
    if (!files.length) return
    if (canShareFiles) {
      try { await navigator.share({ files }) } catch { /* utente annulla: nessun errore */ }
      return
    }
    // fallback desktop / browser senza share: download numerati in ordine
    setBusy(true)
    for (const f of files) {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(f); a.download = f.name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
      await new Promise(r => setTimeout(r, 400))
    }
    setBusy(false); toast('Foto scaricate in ordine')
  }

  return (
    <Modal title="Pronto per Instagram" onClose={onClose} wide>
      <div className="grid" style={{ gap: 16 }}>
        <div className="faint" style={{ fontSize: 12.5 }}>
          1) Copia la caption · 2) Salva le foto (escono <b style={{ color: 'var(--text)' }}>in ordine 1→{photos.length}</b>) · 3) Apri Instagram, carica le foto, incolla la caption. 30 secondi.
        </div>

        {/* azioni principali */}
        <div className="flex gap wrap" style={{ gap: 10 }}>
          <button className="btn btn-primary" onClick={copyCaption} disabled={!caption}>
            <Icon name="copy" size={14} /> {copied ? 'Caption copiata ✓' : 'Copia caption'}
          </button>
          <button className="btn btn-primary" onClick={savePhotos} disabled={preparing || busy || files.length === 0}>
            <Icon name="image" size={14} /> {preparing ? 'Preparo le foto…' : busy ? 'Scarico…' : canShareFiles ? `Salva ${files.length} foto sul telefono` : `Scarica ${files.length} foto`}
          </button>
        </div>
        {canShareFiles && <div className="faint" style={{ fontSize: 12, marginTop: -4 }}>Si apre la condivisione: scegli <b style={{ color: 'var(--text)' }}>“Salva {files.length} immagini”</b> → finiscono in Foto nell'ordine giusto.</div>}

        {/* anteprima ordine */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Ordine del carosello</div>
          <div className="grid" style={{ gap: 8 }}>
            {photos.map((m, i) => (
              <div key={m.id} className="flex gap" style={{ alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 8 }}>
                <div style={{ minWidth: 26, height: 26, borderRadius: 8, background: 'var(--accent, #C6FF3A)', color: '#0b0b0e', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                {urls[m.storage_path]
                  ? <img src={urls[m.storage_path]} alt="" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'cover' }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 8, background: 'var(--surface-2)' }} />}
                <div className="row-main" style={{ minWidth: 0 }}>
                  <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.file_name || `Foto ${i + 1}`}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
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

// Selettore foto dalla libreria Media: mostra le foto dell'atleta raggruppate per
// cartella e permette di sceglierne più d'una da collegare al contenuto.
function MediaPicker({ athleteId, excludeSourceIds, onClose, onConfirm }: {
  athleteId: number | null
  excludeSourceIds: string[]
  onClose: () => void
  onConfirm: (items: MediaItem[]) => void | Promise<void>
}) {
  const [items, setItems] = useState<MediaItem[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let ok = true
    ;(async () => {
      const { data } = await supabase.from('crm_media').select('*')
        .eq('player_id', athleteId).eq('kind', 'foto').neq('status', 'scartata')
        .is('source_media_id', null).order('created_at', { ascending: false })
      let list = (data as MediaItem[]) || []
      const excl = new Set(excludeSourceIds)
      list = list.filter(m => !excl.has(m.id))
      if (!ok) return
      setItems(list); setLoading(false)
      const paths = list.map(m => m.storage_path)
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
        if (signed && ok) {
          const next: Record<string, string> = {}
          signed.forEach(d => { if (d.signedUrl && d.path) next[d.path] = d.signedUrl })
          setUrls(next)
        }
      }
    })()
    return () => { ok = false }
  }, [athleteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) => setSel(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const folders = [...new Set(items.map(m => m.folder || 'Senza cartella'))]

  async function confirm() {
    setBusy(true)
    await onConfirm(items.filter(m => sel.has(m.id)))
    setBusy(false)
  }

  return (
    <Modal title="Seleziona dalle foto in Media" onClose={onClose} wide
      footer={
        <div className="flex between" style={{ width: '100%', alignItems: 'center' }}>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {sel.size ? `${sel.size} selezionat${sel.size > 1 ? 'e' : 'a'}` : 'Tocca le foto da collegare'}
          </span>
          <div className="flex gap">
            <button className="btn" onClick={onClose}>Annulla</button>
            <button className="btn btn-primary" disabled={busy || sel.size === 0} onClick={confirm}>
              {busy ? 'Collego…' : `Aggiungi${sel.size ? ' ' + sel.size : ''}`}
            </button>
          </div>
        </div>
      }>
      {loading ? <Spinner /> : items.length === 0 ? (
        <Empty icon={<Icon name="image" size={28} strokeWidth={1.4} />} title="Nessuna foto in libreria"
          hint="Carica prima le foto in Media, poi potrai selezionarle qui." />
      ) : (
        <div className="grid" style={{ gap: 18 }}>
          {folders.map(f => (
            <div key={f}>
              <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.8px',
                fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="folder" size={13} /> {f}
              </div>
              <div className="asset-grid">
                {items.filter(m => (m.folder || 'Senza cartella') === f).map(m => {
                  const on = sel.has(m.id)
                  return (
                    <div key={m.id} className="asset-card" onClick={() => toggle(m.id)}
                      title={m.file_name || ''}
                      style={{ position: 'relative', cursor: 'pointer',
                        outline: on ? '2px solid var(--accent, #C6FF3A)' : 'none', outlineOffset: -2 }}>
                      {isImageFile(m.file_name) && urls[m.storage_path]
                        ? <img src={urls[m.storage_path]} alt="" loading="lazy" />
                        : <div className="asset-ph"><Icon name="camera" size={20} strokeWidth={1.4} /></div>}
                      <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: on ? 'var(--accent, #C6FF3A)' : 'rgba(0,0,0,.5)',
                        color: on ? '#0b0b0e' : '#fff', border: '1.5px solid ' + (on ? 'var(--accent, #C6FF3A)' : 'rgba(255,255,255,.6)') }}>
                        {on && <Icon name="check" size={13} />}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
