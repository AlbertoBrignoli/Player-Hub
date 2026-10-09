import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { notify } from '../lib/notify'
import { toast } from '../lib/toast'
import { useRouteParam, goto } from '../lib/route'
import { Modal, Field, Input, Select, Textarea, Badge, Empty, Spinner, ConfirmButton, Tabs } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDate, fmtDateTime, fmtMatchTime, fmtMatchDateTime, isImageFile, isVideoFile, fileExt } from '../lib/format'
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
  pronto: { label: 'Pronto', tone: 'green' },
  pubblicato: { label: 'Pubblicato', tone: 'accent' },
}

const moveBtn = (disabled: boolean): React.CSSProperties => ({
  width: 24, height: 24, borderRadius: 7, border: 'none', cursor: disabled ? 'default' : 'pointer',
  background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  opacity: disabled ? 0.35 : 1,
})

type View = 'cal' | 'dafare' | 'pubblicati'
const VIEW_PARAM: Record<string, View> = { calendario: 'cal', dafare: 'dafare', pubblicati: 'pubblicati' }
const VIEW_NAME: Record<View, string> = { cal: 'calendario', dafare: 'dafare', pubblicati: 'pubblicati' }
const IG_PINK = '#E1306C' // colore del marchio Instagram: resta fisso di proposito

// Caricamento della grafica finale di un contenuto: usato sia dentro il contenuto
// sia dal bottone rapido della lista "Da fare". Il file entra anche nei Media
// (cartella Pubblicati) e il contenuto passa a "Grafica caricata".
async function uploadEntryGraphics(entry: EditorialEntry, files: File[], ctx: {
  userId?: string; role?: string | null; athleteId: number | null; isTeam: boolean
}): Promise<{ ok: number; error?: string }> {
  let ok = 0
  let error: string | undefined
  for (const file of files) {
    if (file.size > MAX_UPLOAD) { error = tooBig(file); continue }
    const path = `editorial/${entry.id}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (up.error) { error = up.error.message; continue }
    // La grafica caricata nella box entra anche nei Media, sezione Pubblicati.
    const ins = await insertRow('crm_media', {
      storage_path: path, file_name: file.name, kind: 'grafica', status: 'pubblicata',
      editorial_id: entry.id, folder: 'Pubblicati', uploaded_by: ctx.userId,
      uploaded_role: ctx.role, note: entry.title, player_id: ctx.athleteId,
    })
    if (!ins.error) ok++
  }
  if (ok) {
    const status = ['da_preparare', 'copy_pronto'].includes(entry.status) ? 'grafica_caricata' : entry.status
    if (status !== entry.status) await updateRow('crm_editorial', entry.id, { status })
    notify(ctx.isTeam ? 'player' : 'team', `Grafica caricata: ${entry.title}`,
      `${ok} file pront${ok > 1 ? 'i' : 'o'} nel calendario editoriale.`, 'editorial', ctx.athleteId)
    toast(`${ok} grafic${ok > 1 ? 'he' : 'a'} caricat${ok > 1 ? 'e' : 'a'} — anche in Media, Pubblicati`)
  }
  return { ok, error }
}

// limite del progetto per singolo file: i mini video stanno sotto, i girati lunghi vanno esportati più leggeri
const MAX_UPLOAD = 50 * 1048576
const tooBig = (f: File) => `"${f.name}" supera 50 MB: esporta il video più leggero (1080p, pochi secondi) e ricaricalo`

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const DOW = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

export default function Editorial() {
  const { isTeam, session, profile } = useAuth()
  const { athleteId, athleteTz } = useAthlete()
  const { t } = useLang()
  const { rows, loading, reload } = useCollection<EditorialEntry>('crm_editorial', { orderBy: 'entry_date', ascending: true, match: { player_id: athleteId } })
  const today = new Date()
  const [ym, setYm] = useState<[number, number]>([today.getFullYear(), today.getMonth()])
  // #/editorial?view=dafare|calendario|pubblicati
  const viewParam = useRouteParam('view')
  const [viewState, setView] = useState<View | null>(() => VIEW_PARAM[viewParam || ''] || null)
  useEffect(() => { const v = VIEW_PARAM[viewParam || '']; if (v) setView(v) }, [viewParam])
  function changeView(v: View) { setView(v); goto(`editorial?view=${VIEW_NAME[v]}`) }
  const [quickBusy, setQuickBusy] = useState<string | null>(null)
  const quickRef = useRef<HTMLInputElement>(null)
  const quickTarget = useRef<EditorialEntry | null>(null)
  const [openEntry, setOpenEntry] = useState<EditorialEntry | null>(null)
  const [creating, setCreating] = useState(false)
  // link diretti (Home, notifiche): #/editorial?entry=<id> apre il contenuto
  const entryParam = useRouteParam('entry')
  useEffect(() => {
    if (!entryParam) return
    const e = rows.find(r => r.id === entryParam)
    if (e) {
      setOpenEntry(e)
      const d = new Date(e.entry_date)
      if (!isNaN(d.getTime())) setYm([d.getFullYear(), d.getMonth()])
    }
  }, [entryParam, rows])
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

  // "Da fare": solo ciò che chiede un'azione, dalla data più vicina.
  // Si guarda da una settimana fa in avanti: più indietro sono arretrati ormai persi.
  const todo = useMemo(() => {
    const from = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const live = rows.filter(e => e.status !== 'pubblicato' && e.entry_date >= from)
      .sort((a, b) => a.entry_date.localeCompare(b.entry_date))
    const groups: { key: string; title: string; hint: string; entries: EditorialEntry[]; action: 'grafica' | 'apri' }[] = isTeam ? [
      { key: 'rev', title: 'Modifiche richieste', hint: "L'atleta ha chiesto di ritoccare la grafica", action: 'grafica',
        entries: live.filter(e => !!e.revision) },
      { key: 'prep', title: 'Da preparare', hint: 'Manca il copy o la grafica', action: 'grafica',
        entries: live.filter(e => !e.revision && (e.status === 'da_preparare' || e.status === 'copy_pronto')) },
      { key: 'pub', title: 'Da pubblicare', hint: 'Grafica pronta: manca la pubblicazione', action: 'apri',
        entries: live.filter(e => !e.revision && (e.status === 'grafica_caricata' || e.status === 'pronto')) },
    ] : [
      { key: 'pub', title: 'Da pubblicare', hint: 'Pronti: copia il testo, pubblica e conferma', action: 'apri',
        entries: live.filter(e => e.status === 'pronto') },
      { key: 'check', title: 'Grafiche da vedere', hint: 'Il team ha caricato la grafica: accetta o chiedi modifiche', action: 'apri',
        entries: live.filter(e => e.status === 'grafica_caricata') },
      { key: 'prop', title: 'Le tue proposte', hint: 'Idee che hai inviato al team', action: 'apri',
        entries: live.filter(e => !!e.requested_by && !['pronto', 'grafica_caricata'].includes(e.status)) },
    ]
    return groups.filter(g => g.entries.length > 0)
  }, [rows, isTeam])
  const todoCount = todo.reduce((n, g) => n + g.entries.length, 0)
  const view: View = viewState ?? (isTeam && todoCount > 0 ? 'dafare' : 'cal')
  useEffect(() => {
    if (!loading && viewState == null) setView(isTeam && todoCount > 0 ? 'dafare' : 'cal')
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Spinner />

  function quickUpload(e: EditorialEntry) {
    quickTarget.current = e
    quickRef.current?.click()
  }
  async function onQuickFiles(ev: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(ev.target.files || [])
    const entry = quickTarget.current
    if (!files.length || !entry) return
    setQuickBusy(entry.id)
    try {
      const { ok, error } = await uploadEntryGraphics(entry, files, { userId: session?.user.id, role: profile?.role, athleteId, isTeam })
      if (error) toast(error, 'err')
      if (ok) reload()
    } finally {
      setQuickBusy(null)
      if (quickRef.current) quickRef.current.value = ''
    }
  }

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

  function prevMonth() { setYm(month === 0 ? [year - 1, 11] : [year, month - 1]) }
  function nextMonth() { setYm(month === 11 ? [year + 1, 0] : [year, month + 1]) }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex between wrap gap" style={{ alignItems: 'center' }}>
        <Tabs<View> value={view} onChange={changeView} tabs={[
          { key: 'cal', label: t('Calendario') },
          { key: 'dafare', label: t('Da fare'), badge: todoCount },
          { key: 'pubblicati', label: t('Pubblicati') },
        ]} />
        <div className="flex gap" style={{ alignItems: 'center' }}>
          {view === 'cal' && (
            <div className="flex" style={{ alignItems: 'center', gap: 4 }}>
              <button className="btn btn-sm btn-ghost" onClick={prevMonth} aria-label={t('Mese precedente')}>
                <span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron-right" size={14} /></span>
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => setYm([today.getFullYear(), today.getMonth()])} title={t('Oggi')}
                style={{ fontWeight: 700, minWidth: 116 }}>{t(MONTHS[month])} {year}</button>
              <button className="btn btn-sm btn-ghost" onClick={nextMonth} aria-label={t('Mese successivo')}><Icon name="chevron-right" size={14} /></button>
            </div>
          )}
          <button className="btn btn-primary btn-sm" onClick={() => setCreating(true)}>
            <Icon name="plus" size={14} /> {isTeam ? t('Contenuto') : t('Proponi')}
          </button>
        </div>
      </div>
      {view === 'cal' && (
        <div className="faint" style={{ fontSize: 12, marginTop: -8 }}>
          {t('Le partite entrano da sole; copy e grafiche si preparano dentro ogni contenuto. Tocca il mese per tornare a oggi.')}
        </div>
      )}
      <input ref={quickRef} type="file" multiple accept="image/*,video/*,.pdf,.psd,.ai" hidden onChange={onQuickFiles} />

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
        <EntryList title={t('Pubblicati')} entries={listEntries.filter(e => e.status === 'pubblicato').reverse()}
          onOpen={setOpenEntry} empty="Ancora nessun contenuto pubblicato. Confermando un post come pubblicato, finisce qui." />
      ) : todo.length === 0 ? (
        <div className="card">
          <Empty icon={<Icon name="check" size={32} strokeWidth={1.4} />} title={t('Niente da fare')}
            hint={isTeam ? 'Tutti i contenuti in programma hanno copy e grafica.' : 'Quando un contenuto è pronto da pubblicare lo trovi qui.'} />
        </div>
      ) : (
        <div className="grid" style={{ gap: 14 }}>
          {todo.map(g => (
            <div className="card" key={g.key}>
              <div className="card-head">
                <div className="card-title">{t(g.title)}</div>
                <div className="card-hint">{g.entries.length}</div>
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: -4, marginBottom: 4 }}>{t(g.hint)}</div>
              <div className="list">
                {g.entries.slice(0, 40).map(e => (
                  <TodoRow key={e.id} e={e} preview={previews[e.id]} todayKey={todayKey} onOpen={setOpenEntry}
                    action={g.action === 'grafica' && isTeam
                      ? { label: quickBusy === e.id ? t('Carico…') : t('Carica grafica'), icon: 'upload', busy: quickBusy === e.id, run: () => quickUpload(e) }
                      : { label: t('Apri'), icon: 'chevron-right', run: () => setOpenEntry(e) }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {openEntry && (
        <EntryModal
          entry={rows.find(e => e.id === openEntry.id) || openEntry}
          onClose={() => { setOpenEntry(null); if (entryParam) goto(`editorial?view=${VIEW_NAME[view]}`) }}
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
    const home = (mi.venue || '').toLowerCase() === 'home'
    const time = mi.kickoff ? fmtMatchTime(mi.kickoff, tz) : ''
    const played = mi.status === 'FT' && mi.team_score != null
    const score = played ? (home ? `${mi.team_score}–${mi.opponent_score}` : `${mi.opponent_score}–${mi.team_score}`) : null
    return (
      <button className={`cal-match cal-${e.status} ${full ? 'cal-w-full' : ''}`} onClick={() => onOpen(e)} title={e.title}>
        <div className="cal-match-top">
          <span className="cal-league"><Icon name="instagram" size={10} style={{ verticalAlign: '-1px', marginRight: 3, color: e.status === 'pubblicato' ? IG_PINK : 'currentColor', opacity: e.status === 'pubblicato' ? 1 : 0.55 }} />{shortLeague(mi.league)}</span>
          <span>{home ? t('CASA') : t('TRASF')} · {score || time}</span>
        </div>
        <div className="cal-match-teams">{mi.home_team}<br />{mi.away_team}</div>
        <div className="cal-match-state">{t(STATUSES[e.status]?.label || '')}</div>
      </button>
    )
  }
  const st = STATUSES[e.status]
  const toneColor = (t?: string) => t === 'green' ? 'var(--green)' : t === 'gold' ? 'var(--gold)' : t === 'blue' ? 'var(--blue)' : t === 'accent' ? IG_PINK : 'var(--text-dim)'
  const accent = toneColor(st?.tone)
  return (
    <button className={`cal-chip-rich ${full ? 'cal-w-full' : ''}`} onClick={() => onOpen(e)} title={`${e.title} · Instagram`}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '6px 8px',
        borderRadius: 10, cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', borderLeft: `3px solid ${accent}`, color: 'var(--text)' }}>
      <div style={{ position: 'relative', width: 40, height: 40, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
        background: 'var(--surface-2)', display: 'grid', placeItems: 'center', color: 'var(--text-dim)' }}>
        {preview
          ? <img src={preview} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <Icon name={TYPES[e.type]?.icon || 'image'} size={16} strokeWidth={1.5} />}
        <span style={{ position: 'absolute', bottom: -1, right: -1, width: 15, height: 15, borderRadius: 5,
          background: 'var(--ink)', display: 'grid', placeItems: 'center' }}>
          <Icon name="instagram" size={9} style={{ color: e.status === 'pubblicato' ? IG_PINK : 'var(--surface)' }} />
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

// Riga della lista "Da fare": data, titolo, stato, anteprima e UNA azione.
function TodoRow({ e, preview, todayKey, onOpen, action }: {
  e: EditorialEntry; preview?: string; todayKey: string; onOpen: (e: EditorialEntry) => void
  action: { label: string; icon: string; busy?: boolean; run: () => void }
}) {
  const { t } = useLang()
  const d = new Date(e.entry_date + 'T12:00')
  const late = e.entry_date < todayKey
  const isToday = e.entry_date === todayKey
  return (
    <div className="row" style={{ cursor: 'pointer', gap: 12 }} onClick={() => onOpen(e)}>
      <div style={{ width: 44, flexShrink: 0, textAlign: 'center', borderRadius: 10, padding: '5px 0',
        background: isToday ? 'var(--yellow)' : 'var(--bg-2)', color: late ? 'var(--red)' : 'var(--ink)' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>{t(DOW[(d.getDay() + 6) % 7])}</div>
        <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1.1 }}>{d.getDate()}</div>
        <div style={{ fontSize: 9.5, fontWeight: 600, color: late ? 'var(--red)' : 'var(--text-faint)' }}>{t(MONTHS[d.getMonth()]).slice(0, 3)}</div>
      </div>
      {preview
        ? <img className="row-thumb" src={preview} alt="" loading="lazy" />
        : <span className="row-thumb" style={{ display: 'grid', placeItems: 'center', background: 'var(--bg-2)', color: 'var(--text-dim)' }}>
            <Icon name={TYPES[e.type]?.icon || 'file'} size={18} strokeWidth={1.5} />
          </span>}
      <div className="row-main" style={{ minWidth: 0 }}>
        <div className="row-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</div>
        <div className="row-sub flex gap wrap" style={{ gap: 6, alignItems: 'center' }}>
          <Badge tone={STATUSES[e.status]?.tone}>{t(STATUSES[e.status]?.label || e.status)}</Badge>
          <span>{t(TYPES[e.type]?.label || e.type)}</span>
          {late && <span style={{ color: 'var(--red)' }}>{t('in ritardo')}</span>}
        </div>
      </div>
      <button className="btn btn-primary btn-sm" style={{ flexShrink: 0 }} disabled={action.busy}
        onClick={ev => { ev.stopPropagation(); action.run() }}>
        <Icon name={action.icon} size={13} /> {action.label}
      </button>
    </div>
  )
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
                <Icon name="instagram" size={15} style={{ color: e.status === 'pubblicato' ? IG_PINK : 'var(--text-dim)' }} />
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
  const { t } = useLang()
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
  const [showAnnotator, setShowAnnotator] = useState(false)
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

  // video del contenuto: un tocco apre il lettore (guarda + scarica), le immagini si scaricano come prima
  const [viewer, setViewer] = useState<MediaItem | null>(null)
  const openOrPlay = (m: MediaItem) => (isVideoFile(m.file_name) ? setViewer(m) : openAsset(m))
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
    try {
      const { ok, error } = await uploadEntryGraphics(entry, files, { userId: session?.user.id, role: profile?.role, athleteId, isTeam })
      if (error) setErr(error)
      if (ok) { loadMedia(); onChanged() }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
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
        if (file.size > MAX_UPLOAD) { toast(tooBig(file), 'err'); continue }
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
        // Stessa cartella "POST <titolo>" della selezione fatta da Media:
        // senza questa la libreria le mostra in "Senza cartella".
        folder: `POST ${entry.title}`,
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
      'Contenuto confermato come pubblicato — lavoro completato', 'editorial', athleteId)
    toast('Segnato come pubblicato'); onChanged()
  }

  const isMatchDayAthlete = !isTeam && entry.type === 'partita'
  const firstGraphicImg = grafiche.find(m => isImageFile(m.file_name))
  const firstGraphicVideo = !firstGraphicImg ? grafiche.find(m => isVideoFile(m.file_name)) : undefined

  async function acceptGraphic() {
    const { error } = await updateRow('crm_editorial', entry.id, { status: 'pronto', revision: null })
    if (error) { setErr(error.message); return }
    notify('team', `Grafica accettata: ${entry.title}`, "L'atleta ha accettato la grafica pre-partita.", 'editorial', athleteId)
    toast('Grafica accettata'); onChanged(); onClose()
  }
  async function sendRevision(note: string, pins: { x: number; y: number; note: string }[]) {
    const rev = { note: note || null, pins, at: new Date().toISOString(), by: 'player' }
    const { error } = await updateRow('crm_editorial', entry.id, { revision: rev })
    if (error) { setErr(error.message); return }
    notify('team', `Modifiche richieste: ${entry.title}`, note || "L'atleta ha segnato dei punti da modificare sulla grafica.", 'editorial', athleteId)
    toast('Richiesta inviata al team'); onChanged(); onClose()
  }

  return (
    <Modal title={entry.title} onClose={onClose} wide
      footer={ isMatchDayAthlete ? (
        <div className="flex" style={{ width: '100%', justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>{t('Chiudi')}</button>
        </div>
      ) : (
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
            {isTeam && approvate.length > 0 && (
              <button className="btn" onClick={() => setIgOpen(true)} title="Copia la caption e scarica le foto in ordine">
                <Icon name="image" size={14} /> Prepara per Instagram
              </button>
            )}
            {isTeam && entry.status !== 'pubblicato' && (
              <button className="btn btn-primary" onClick={publish} disabled={approvate.length === 0}
                title={approvate.length === 0 ? 'Serve prima il materiale' : 'Conferma che il post è stato pubblicato'}>
                <Icon name="check" size={14} /> Conferma pubblicato
              </button>
            )}
            <button className="btn" onClick={onClose}>{t('Chiudi')}</button>
          </div>
        </div>
      )}>
      <div className="grid" style={{ gap: 18 }}>
        <div className="flex gap wrap" style={{ alignItems: 'center' }}>
          <Badge tone={STATUSES[entry.status]?.tone}>{t(STATUSES[entry.status]?.label || entry.status)}</Badge>
          <Badge>{TYPES[entry.type]?.label || entry.type}</Badge>
          {entry.theme && <Badge>{THEMES[entry.theme] || entry.theme}</Badge>}
          {brandName && <Badge tone="red">Contenuto {brandName}</Badge>}
          {entry.requested_by && <Badge tone="accent">{t('Proposto dal giocatore')}</Badge>}
          <span className="faint" style={{ fontSize: 12.5 }}>{fmtDate(entry.entry_date)}</span>
        </div>
        {entry.brief && (
          <div style={{ fontSize: 13.5, color: 'var(--text-dim)', borderLeft: '3px solid var(--border-2)', paddingLeft: 10 }}>
            <b style={{ color: 'var(--text)' }}>{t('Brief')}:</b> {entry.brief}
          </div>
        )}

        {isMatchDayAthlete && (
          <div className="card" style={{ background: 'var(--bg-2)' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>Grafica pre-partita</div>
            {firstGraphicImg && urls[firstGraphicImg.storage_path] ? (
              showAnnotator ? (
                <RevisionAnnotator url={urls[firstGraphicImg.storage_path]} onCancel={() => setShowAnnotator(false)} onSend={sendRevision} />
              ) : (
                <>
                  <img src={urls[firstGraphicImg.storage_path]} alt="" style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                  {entry.revision && <div className="faint" style={{ fontSize: 12.5, marginTop: 8 }}>Hai già inviato una richiesta di modifiche — il team ci sta lavorando.</div>}
                  <div className="flex gap" style={{ marginTop: 12 }}>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={acceptGraphic}><Icon name="check" size={15} /> Accetta</button>
                    <button className="btn" style={{ flex: 1 }} onClick={() => setShowAnnotator(true)}><Icon name="edit" size={15} /> Chiedi modifiche</button>
                  </div>
                </>
              )
            ) : (
              <div className="faint" style={{ fontSize: 13 }}>Il team non ha ancora caricato la grafica. Ti avviseremo appena è pronta da approvare.</div>
            )}
          </div>
        )}

        {!isMatchDayAthlete && (<>
        {/* 1. Grafica finale: la cosa che si usa di più (team la carica, atleta la pubblica) */}
        <div>
          <div className="flex between" style={{ marginBottom: 8, alignItems: 'center' }}>
            <div style={{ fontWeight: 650 }}>{t('Grafica finale')}</div>
            {isTeam && (
              <>
                <button className="btn btn-primary btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={13} /> {uploading ? 'Carico…' : 'Carica grafica'}
                </button>
                <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf,.psd,.ai" hidden onChange={onUpload} />
              </>
            )}
          </div>
          {!isTeam && firstGraphicVideo && urls[firstGraphicVideo.storage_path] && (
            <div style={{ marginBottom: 10 }}>
              <video src={urls[firstGraphicVideo.storage_path]} controls playsInline preload="metadata"
                style={{ width: '100%', maxHeight: 460, borderRadius: 12, display: 'block', background: '#000' }} />
              <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => openAsset(firstGraphicVideo)}>
                <Icon name="download" size={13} /> {t('Scarica video')}
              </button>
            </div>
          )}
          {!isTeam && firstGraphicImg && urls[firstGraphicImg.storage_path] && (
            <img src={urls[firstGraphicImg.storage_path]} alt="" onClick={() => openAsset(firstGraphicImg)}
              style={{ width: '100%', maxHeight: 460, objectFit: 'contain', borderRadius: 12, display: 'block',
                background: 'var(--bg-2)', cursor: 'pointer', marginBottom: 10 }} />
          )}
          {!isTeam && (
            <div className="flex gap wrap" style={{ marginBottom: 10 }}>
              {entry.status !== 'pubblicato' && (
                <button className="btn btn-primary" onClick={publish} disabled={approvate.length === 0}
                  title={approvate.length === 0 ? 'Serve prima il materiale' : 'Conferma che il post è stato pubblicato'}>
                  <Icon name="check" size={14} /> {t('Segna come pubblicato')}
                </button>
              )}
              {entry.type !== 'partita' && entry.type !== 'story' && (
                <button className="btn" onClick={copyToClipboard} disabled={!copy}>
                  <Icon name="copy" size={14} /> {copied ? t('Copiato') : t('Copia testo')}
                </button>
              )}
              {approvate.length > 0 && (
                <button className="btn" onClick={() => setIgOpen(true)} title="Copia la caption e scarica le foto in ordine">
                  <Icon name="instagram" size={14} /> {t('Prepara per Instagram')}
                </button>
              )}
            </div>
          )}
          {grafiche.length === 0
            ? <div className="faint" style={{ fontSize: 12.5, padding: '6px 0' }}>{isTeam ? 'Carica qui i file pronti da pubblicare: finiscono anche in Media → Pubblicati.' : 'Il team caricherà qui la grafica finale, pronta da pubblicare.'}</div>
            : (isTeam || grafiche.length > 1 || (!firstGraphicImg && !firstGraphicVideo)) && (
              <div className="list">
                {grafiche.map(m => (
                  <div className="row" key={m.id}>
                    {isImageFile(m.file_name) && urls[m.storage_path]
                      ? <img className="row-thumb" src={urls[m.storage_path]} alt="" loading="lazy" onClick={() => openAsset(m)} />
                      : isVideoFile(m.file_name) && urls[m.storage_path]
                        ? <span className="row-thumb vid-thumb" onClick={() => setViewer(m)}>
                            <video src={urls[m.storage_path] + '#t=0.1'} muted playsInline preload="metadata" />
                          </span>
                        : <span className="row-thumb file-badge" onClick={() => openAsset(m)}>{fileExt(m.file_name)}</span>}
                    <div className="row-main">
                      <div className="row-title">{m.file_name}</div>
                      <div className="row-sub">{fmtDateTime(m.created_at)}</div>
                    </div>
                    {isVideoFile(m.file_name) && <button className="btn btn-sm" onClick={() => setViewer(m)}>{t('Guarda')}</button>}
                    <button className="btn btn-sm" onClick={() => openAsset(m)}><Icon name="download" size={13} /> {t('Scarica')}</button>
                    {isAdmin && <ConfirmButton onConfirm={() => removeAsset(m)}><Icon name="x" size={13} /></ConfirmButton>}
                  </div>
                ))}
              </div>
            )}
        </div>

        {isTeam && entry.revision && (
          <More title={`Modifiche richieste dall'atleta${entry.revision.pins?.length ? ` · ${entry.revision.pins.length} punti` : ''}`} tone="var(--magenta)">
            {entry.revision.note && <div style={{ fontSize: 13, marginBottom: 8 }}>{entry.revision.note}</div>}
            {firstGraphicImg && urls[firstGraphicImg.storage_path] && (entry.revision.pins?.length > 0) && (
              <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                <img src={urls[firstGraphicImg.storage_path]} alt="" style={{ width: '100%', display: 'block' }} />
                {entry.revision.pins.map((p: any, i: number) => (<div key={i} style={pinStyle(p.x, p.y)}>{i + 1}</div>))}
              </div>
            )}
            {(entry.revision.pins || []).filter((p: any) => p.note).map((p: any, i: number) => (
              <div key={i} style={{ fontSize: 12.5, color: 'var(--text-dim)' }}><b>{i + 1}.</b> {p.note}</div>
            ))}
          </More>
        )}

        {/* 2. Copy */}
        {entry.type !== 'partita' && entry.type !== 'story' && (
        <div>
          <div className="flex between" style={{ marginBottom: 6 }}>
            <div style={{ fontWeight: 650 }}>{t('Copy')}</div>
            <div className="flex gap">
              <button className="btn btn-sm" onClick={copyToClipboard} disabled={!copy}>{copied ? t('Copiato') : t('Copia')}</button>
              <button className="btn btn-sm" onClick={downloadCopy} disabled={!copy}>{t('Scarica .txt')}</button>
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={saveCopy}>{saving ? 'Salvo…' : 'Salva copy'}</button>
            </div>
          </div>
          <Textarea rows={5} value={copy} onChange={e => setCopy(e.target.value)}
            placeholder={t("Scrivi qui il copy del post: didascalia, hashtag, tag…")} />
          <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Copy modificabile da entrambi: il team lo prepara, tu lo approvi o lo ritocchi.</div>
        </div>
        )}

        {entry.hashtags && (
          <div>
            <div className="flex between" style={{ marginBottom: 6 }}>
              <div style={{ fontWeight: 650 }}>Hashtag {brandName ? `· da ${brandName}` : ''}</div>
              <button className="btn btn-sm" onClick={copyHashtags}>{hCopied ? 'Copiati' : 'Copia hashtag'}</button>
            </div>
            <div className="card" style={{ background: 'var(--bg-2)', fontSize: 13, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>{entry.hashtags}</div>
          </div>
        )}

        {/* 3. Materiale da cui nasce la grafica */}
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
            ? <div style={{ fontSize: 12.5, color: 'var(--gold)', background: 'var(--yellow-soft)', borderRadius: 10, padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="clock" size={14} /> {entry.status !== 'pubblicato'
                  ? 'Serve il materiale (foto/video da cui nasce la grafica): senza non si può segnare Pronto o Pubblicato.'
                  : 'Nessun materiale collegato.'}
              </div>
            : (
              <div className="asset-grid">
                {approvate.map((m, i) => (
                  <div className="asset-card" key={m.id} title={m.file_name || ''} style={{ position: 'relative' }}>
                    <div onClick={() => openOrPlay(m)}>
                      {isImageFile(m.file_name) && urls[m.storage_path]
                        ? <img src={urls[m.storage_path].replace('/object/sign/', '/render/image/sign/') + '&width=220&quality=60'} alt="" loading="lazy" decoding="async" />
                        : isVideoFile(m.file_name) && urls[m.storage_path]
                          ? <div className="vid-thumb"><video src={urls[m.storage_path] + '#t=0.1'} muted playsInline preload="metadata" /></div>
                          : <div className="asset-ph"><Icon name="camera" size={20} strokeWidth={1.4} /></div>}
                    </div>
                    {/* numero d'ordine nel carosello */}
                    <div style={{ position: 'absolute', top: 6, left: 6, minWidth: 20, height: 20, padding: '0 5px',
                      borderRadius: 10, background: 'var(--ink)', color: 'var(--surface)', fontSize: 11, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                    {/* frecce per ordinare il carosello */}
                    {approvate.length > 1 && (
                      <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', gap: 4 }}>
                        <button title={t("Sposta prima")} disabled={i === 0} onClick={() => moveMaterial(i, -1)}
                          style={moveBtn(i === 0)}><span style={{ display: 'inline-flex', transform: 'rotate(180deg)' }}><Icon name="chevron-right" size={13} /></span></button>
                        <button title={t("Sposta dopo")} disabled={i === approvate.length - 1} onClick={() => moveMaterial(i, 1)}
                          style={moveBtn(i === approvate.length - 1)}><Icon name="chevron-right" size={13} /></button>
                      </div>
                    )}
                    {(isAdmin || m.uploaded_by === session?.user.id) && (
                      <button className="asset-del" title={t("Rimuovi")} onClick={() => removeAsset(m)}><Icon name="x" size={12} /></button>
                    )}
                  </div>
                ))}
              </div>
            )}
        </div>

        </>)}

        {mi && (
          <More title={t('Info partita per le grafiche')}>
            <div className="grid g3" style={{ gap: 10 }}>
              <Info k={t("Match")} v={`${mi.home_team ?? '—'} vs ${mi.away_team ?? '—'}`} />
              <Info k={t("Competizione")} v={mi.league} />
              <Info k={t("Giornata")} v={mi.round} />
              <Info k={t("Calcio d'inizio")} v={mi.kickoff ? fmtMatchDateTime(mi.kickoff, athleteTz) : null} />
              <Info k={t("Stadio")} v={mi.stadium} />
              <Info k={t("Casa/Trasferta")} v={(mi.venue || '').toLowerCase() === 'home' ? t('In casa') : (mi.venue || '').toLowerCase() === 'away' ? t('Trasferta') : mi.venue} />
              {mi.status === 'FT' && <Info k={t("Risultato")} v={`${mi.team_score ?? '—'}–${mi.opponent_score ?? '—'}`} />}
            </div>
          </More>
        )}
        {err && <div className="msg-err">{err}</div>}
        {viewer && urls[viewer.storage_path] && (
          <Modal title={viewer.file_name || t('Video')} onClose={() => setViewer(null)}
            footer={<>
              <button className="btn btn-ghost" onClick={() => setViewer(null)}>{t('Chiudi')}</button>
              <button className="btn btn-primary" onClick={() => openAsset(viewer)}><Icon name="download" size={14} /> {t('Scarica video')}</button>
            </>}>
            <video src={urls[viewer.storage_path]} controls autoPlay playsInline
              style={{ width: '100%', maxHeight: '70vh', borderRadius: 12, background: '#000', display: 'block' }} />
          </Modal>
        )}
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
  const { t } = useLang()
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
    try { await navigator.clipboard.writeText(caption || ''); setCopied(true); setTimeout(() => setCopied(false), 2000); toast(t('Caption copiata')) }
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
    setBusy(false); toast(t('Foto scaricate in ordine'))
  }

  return (
    <Modal title={t("Pronto per Instagram")} onClose={onClose} wide>
      <div className="grid" style={{ gap: 16 }}>
        <div className="faint" style={{ fontSize: 12.5 }}>
          1) Copia la caption · 2) Salva le foto (escono <b style={{ color: 'var(--text)' }}>in ordine 1→{photos.length}</b>) · 3) Apri Instagram, carica le foto, incolla la caption. 30 secondi.
        </div>

        {/* azioni principali */}
        <div className="flex gap wrap" style={{ gap: 10 }}>
          <button className="btn btn-primary" onClick={copyCaption} disabled={!caption}>
            <Icon name="copy" size={14} /> {copied ? t('Caption copiata') : t('Copia caption')}
          </button>
          <button className="btn btn-primary" onClick={savePhotos} disabled={preparing || busy || files.length === 0}>
            <Icon name="image" size={14} /> {preparing ? 'Preparo le foto…' : busy ? 'Scarico…' : canShareFiles ? `Salva ${files.length} foto sul telefono` : `Scarica ${files.length} foto`}
          </button>
        </div>
        {canShareFiles && <div className="faint" style={{ fontSize: 12, marginTop: -4 }}>Si apre la condivisione: scegli <b style={{ color: 'var(--text)' }}>“Salva {files.length} immagini”</b> → finiscono in Foto nell'ordine giusto.</div>}

        {/* anteprima ordine */}
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{t('Ordine del carosello')}</div>
          <div className="grid" style={{ gap: 8 }}>
            {photos.map((m, i) => (
              <div key={m.id} className="flex gap" style={{ alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 12, padding: 8 }}>
                <div style={{ minWidth: 26, height: 26, borderRadius: 8, background: 'var(--accent)', color: 'var(--ink)', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</div>
                {urls[m.storage_path] && isVideoFile(m.file_name)
                  ? <span className="vid-thumb" style={{ width: 56, height: 56, borderRadius: 8, flexShrink: 0 }}><video src={urls[m.storage_path] + '#t=0.1'} muted playsInline preload="metadata" /></span>
                  : urls[m.storage_path]
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

// Sezione richiudibile per le parti che servono di rado.
function More({ title, tone, children }: { title: string; tone?: string; children: React.ReactNode }) {
  return (
    <details style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--bg-2)', padding: '10px 12px' }}>
      <summary style={{ cursor: 'pointer', fontWeight: 650, fontSize: 13.5, color: tone || 'var(--text)' }}>{title}</summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
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
  const { t } = useLang()
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
                {items.filter(m => (m.folder || 'Senza cartella') === f)
                  .sort((a, b) => (b.status === 'approvata' ? 1 : 0) - (a.status === 'approvata' ? 1 : 0))
                  .map(m => {
                  const on = sel.has(m.id)
                  const chosen = m.status === 'approvata'
                  return (
                    <div key={m.id} className="asset-card" onClick={() => toggle(m.id)}
                      title={m.file_name || ''}
                      style={{ position: 'relative', cursor: 'pointer',
                        outline: on ? '2px solid var(--accent)' : 'none', outlineOffset: -2 }}>
                      {isImageFile(m.file_name) && urls[m.storage_path]
                        ? <img src={urls[m.storage_path].replace('/object/sign/', '/render/image/sign/') + '&width=220&quality=60'} alt="" loading="lazy" decoding="async" />
                        : isVideoFile(m.file_name) && urls[m.storage_path]
                          ? <div className="vid-thumb"><video src={urls[m.storage_path] + '#t=0.1'} muted playsInline preload="metadata" /></div>
                          : <div className="asset-ph"><Icon name="camera" size={20} strokeWidth={1.4} /></div>}
                      {chosen && (
                        <div style={{ position: 'absolute', top: 6, left: 6, padding: '2px 7px', borderRadius: 8,
                          background: 'var(--accent)', color: 'var(--ink)', fontSize: 10, fontWeight: 800,
                          display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Icon name="star" size={11} /> Scelta
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: on ? 'var(--accent)' : 'rgba(0,0,0,.5)',
                        color: on ? 'var(--ink)' : 'var(--surface)', border: '1.5px solid ' + (on ? 'var(--accent)' : 'rgba(255,255,255,.6)') }}>
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

const pinStyle = (x: number, y: number): any => ({
  position: 'absolute', left: `${x * 100}%`, top: `${y * 100}%`, transform: 'translate(-50%, -50%)',
  width: 22, height: 22, borderRadius: '50%', background: 'var(--magenta)', color: 'var(--surface)', fontWeight: 800, fontSize: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--surface)',
  boxShadow: '0 1px 4px rgba(0,0,0,.5)', pointerEvents: 'none',
})

function RevisionAnnotator({ url, onCancel, onSend }: {
  url: string; onCancel: () => void; onSend: (note: string, pins: { x: number; y: number; note: string }[]) => Promise<void>
}) {
  const [pins, setPins] = useState<{ x: number; y: number; note: string }[]>([])
  const [note, setNote] = useState('')
  const [zoom, setZoom] = useState(1)
  const [sending, setSending] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  function addPin(e: any) {
    const el = wrapRef.current; if (!el) return
    const r = el.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    setPins(p => [...p, { x, y, note: '' }])
  }
  const inputStyle: any = { flex: 1, background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13 }
  return (
    <div>
      <div className="faint" style={{ fontSize: 12.5, marginBottom: 8 }}>
        Tocca sulla grafica il punto da cambiare (puoi metterne più di uno). Usa lo zoom per il dettaglio e scrivi cosa modificare.
      </div>
      <div className="flex gap" style={{ alignItems: 'center', marginBottom: 8 }}>
        <button className="btn btn-sm" onClick={() => setZoom(z => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1}>−</button>
        <span className="faint" style={{ fontSize: 12, minWidth: 44, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm" onClick={() => setZoom(z => Math.min(4, +(z + 0.5).toFixed(1)))} disabled={zoom >= 4}>+</button>
        {pins.length > 0 && <button className="btn btn-sm" onClick={() => setPins(p => p.slice(0, -1))}>Annulla ultimo punto</button>}
      </div>
      <div style={{ maxHeight: 440, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--ink)' }}>
        <div ref={wrapRef} onClick={addPin} style={{ position: 'relative', width: `${zoom * 100}%`, cursor: 'crosshair' }}>
          <img src={url} alt="" style={{ display: 'block', width: '100%' }} draggable={false} />
          {pins.map((p, i) => (<div key={i} style={pinStyle(p.x, p.y)}>{i + 1}</div>))}
        </div>
      </div>
      {pins.map((p, i) => (
        <div key={i} className="flex gap" style={{ alignItems: 'center', marginTop: 8 }}>
          <div style={{ minWidth: 22, height: 22, borderRadius: '50%', background: 'var(--magenta)', color: 'var(--surface)', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>{i + 1}</div>
          <input style={inputStyle} placeholder={`Cosa cambiare nel punto ${i + 1}…`} value={p.note}
            onChange={e => setPins(arr => arr.map((q, j) => j === i ? { ...q, note: e.target.value } : q))} />
        </div>
      ))}
      <Textarea rows={3} style={{ marginTop: 10 }} placeholder="Nota generale sulle modifiche (facoltativa)…" value={note} onChange={e => setNote(e.target.value)} />
      <div className="flex gap" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
        <button className="btn" onClick={onCancel}>Annulla</button>
        <button className="btn btn-primary" disabled={sending || (pins.length === 0 && !note.trim())}
          onClick={async () => { setSending(true); await onSend(note.trim(), pins) }}>
          {sending ? 'Invio…' : 'Invia richiesta modifiche'}
        </button>
      </div>
    </div>
  )
}
