import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { toast, undoable } from '../lib/toast'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, Tabs } from '../components/ui'
import Icon from '../components/Icon'
import LuogoAutocomplete from '../components/LuogoAutocomplete'
import type { EventItem, EventAttachment, EventComment } from '../lib/types'
import { downloadIcs, mapsUrl } from '../lib/ics'

const DOC_BUCKET = 'crm-documents'
function attSize(n?: number | null) {
  if (!n) return ''
  if (n < 1024) return n + ' B'
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB'
  return (n / 1048576).toFixed(1) + ' MB'
}
async function openAttachment(a: EventAttachment) {
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(a.path, 120)
  if (error || !data?.signedUrl) { toast('Impossibile aprire il file', 'err'); return }
  window.open(data.signedUrl, '_blank')
}

type TypeDef = { l: string; icon: string; c: string }
// Palette contenuta e coerente: l'ICONA e' il segnale principale, il colore un accento.
const TYPES: Record<string, TypeDef> = {
  allenamento: { l: 'Allenamento', icon: 'dumbbell',  c: '#12A150' },
  partita:     { l: 'Partita',     icon: 'ball',      c: '#6E56CF' },
  medico:      { l: 'Medico',      icon: 'plus',      c: '#E53F00' },
  viaggio:     { l: 'Viaggio',     icon: 'send',      c: '#1F6FEB' },
  commerciale: { l: 'Commerciale', icon: 'briefcase', c: '#9A8600' },
  sponsor:     { l: 'Sponsor',     icon: 'award',     c: '#9A8600' },
  personale:   { l: 'Personale',   icon: 'user',      c: '#6B6F76' },
  scadenza:    { l: 'Scadenza',    icon: 'clock',     c: '#C2570C' },
  call:        { l: 'Call',        icon: 'message',   c: '#0E7490' },
  nutrizione:  { l: 'Piano alimentare / nutrizione', icon: 'layers', c: '#4D7C0F' },
  visita:      { l: 'Visita / controllo', icon: 'activity', c: '#B42318' },
}
const typeOf = (t: string): TypeDef => TYPES[t] || TYPES.personale
// Partite ufficiali (tabella matches): voci di sola lettura, colore ink.
const MATCH_TYPE: TypeDef = { l: 'Partita', icon: 'ball', c: '#0A0A0A' }

// Voce dell'agenda: un impegno crm_events oppure una partita (sola lettura).
type AgItem = EventItem & { _match?: boolean; _pids?: number[] }
const typeFor = (e: AgItem): TypeDef => e._match ? MATCH_TYPE : typeOf(e.type)
const pidsOf = (e: AgItem): number[] => e._pids || (e.player_id != null ? [e.player_id] : [])

// Colore stabile per atleta (indice nell'elenco), leggibile su bianco.
const ATHLETE_PALETTE = ['#1F6FEB', '#12A150', '#DD0088', '#FF6700', '#0A0A0A', '#8A6D00']
type Tag = { name: string; color: string }
type TagOf = ((pid: number) => Tag | null) | null

const PRO_ROLES = ['agente', 'assicuratore', 'commercialista', 'preparatore', 'fisioterapista']
// Ruoli che hanno accesso a Performance: solo per loro la partita e' toccabile.
const PERF_ROLES = ['admin', 'creator', 'player', 'agente', 'preparatore']
const ADMIN_TYPES = ['partita', 'commerciale', 'sponsor', 'personale', 'medico', 'viaggio', 'scadenza', 'call', 'visita', 'nutrizione']
const PLAYER_TYPES = ['personale', 'medico', 'viaggio']
// Il team dell'atleta propone impegni: ogni professionista solo i tipi del suo mestiere.
const TEAM_TYPES: Record<string, string[]> = {
  preparatore: ['allenamento', 'call', 'nutrizione', 'visita'],
  fisioterapista: ['visita', 'allenamento', 'call'],
  agente: ['call', 'commerciale', 'viaggio', 'personale'],
  assicuratore: ['call', 'scadenza', 'personale'],
  commercialista: ['call', 'scadenza', 'personale'],
}
const ROLE_LABEL: Record<string, string> = {
  preparatore: 'Preparatore', fisioterapista: 'Fisioterapista', agente: 'Procuratore',
  assicuratore: 'Assicuratore', commercialista: 'Commercialista',
  player: 'Atleta', admin: 'AUVI', creator: 'AUVI',
}
// stati in cui chi ha proposto puo' ancora correggere o ritirare la proposta
const OPEN_STATES = ['da_confermare', 'modifica_richiesta', 'rifiutata']
const isTeamProposal = (e: EventItem) => !!e.proposed_by_role && PRO_ROLES.includes(e.proposed_by_role)
const typesFor = (isAdmin: boolean, role?: string | null): string[] =>
  isAdmin ? ADMIN_TYPES : role === 'player' ? PLAYER_TYPES : (role && TEAM_TYPES[role]) || PLAYER_TYPES

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function localKey(iso: string) { return dayKey(new Date(iso)) }
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '18px 4px 10px' }
const emptyEv = (type: string): Partial<EventItem> => ({ title: '', type, start_at: '' })

export default function Agenda({ goto }: { goto?: (r: string) => void }) {
  const { athleteId, athletes, setAthleteId, loading: athletesLoading } = useAthlete()
  const { t: tr } = useLang()
  const { isAdmin, role, session } = useAuth()
  const uid = session?.user.id
  const isPro = !!role && PRO_ROLES.includes(role)
  const canAdd = isAdmin || role === 'player' || isPro
  const defType = typesFor(isAdmin, role)[0]
  const addLabel = isPro && !isAdmin ? tr('Proponi impegno') : tr('Nuovo impegno')
  const showScope = (isPro || role === 'admin' || role === 'creator') && athletes.length > 1
  const [scopeState, setScope] = useState<'all' | 'one'>(isPro ? 'all' : 'one')
  const scope = showScope ? scopeState : 'one'
  const [view, setView] = useState<'lista' | 'calendario'>('calendario')
  const [edit, setEdit] = useState<Partial<EventItem> | null>(null)
  const [askFor, setAskFor] = useState<EventItem | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})

  const ids = scope === 'all' ? athletes.map(a => a.api_player_id) : (athleteId != null ? [athleteId] : [])
  const idsKey = ids.join(',')
  const [rows, setRows] = useState<AgItem[]>([])
  const [loading, setLoading] = useState(true)

  // Impegni (crm_events, RLS filtra per ruolo) + partite dei giocatori in vista.
  const reload = useCallback(async () => {
    const list = idsKey ? idsKey.split(',').map(Number) : []
    if (!list.length) { setRows([]); setLoading(true); return }
    const from = new Date(Date.now() - 30 * 86400000).toISOString()
    const to = new Date(Date.now() + 120 * 86400000).toISOString()
    const [ev, m] = await Promise.all([
      supabase.from('crm_events').select('*').in('player_id', list).order('start_at', { ascending: true }),
      supabase.from('matches').select('*').in('player_id', list).gte('match_date', from).lte('match_date', to).order('match_date', { ascending: true }),
    ])
    const matches = new Map<string, AgItem>()
    ;((m.data as any[]) || []).forEach(x => {
      if (!x.match_date) return
      const key = String(x.fixture_id ?? x.id)
      const prev = matches.get(key)
      if (prev) { if (x.player_id != null && !prev._pids!.includes(x.player_id)) prev._pids!.push(x.player_id); return }
      const title = x.home_team && x.away_team ? `${x.home_team} – ${x.away_team}` : (x.opponent ? `vs ${x.opponent}` : 'Partita')
      matches.set(key, {
        id: 'match-' + key, title, type: 'partita', start_at: x.match_date, end_at: null,
        location: x.stadium || x.venue || null, notes: x.league || null, created_at: x.match_date,
        player_id: x.player_id, _match: true, _pids: x.player_id != null ? [x.player_id] : [],
      })
    })
    const all = [...((ev.data as AgItem[]) || []), ...matches.values()]
    all.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
    setRows(all)
    setLoading(false)
    // numero di commenti per gli impegni caricati: una sola lettura (a blocchi), conteggio qui
    const evIds = ((ev.data as AgItem[]) || []).map(x => x.id)
    const c: Record<string, number> = {}
    for (let i = 0; i < evIds.length; i += 150) {
      const { data } = await supabase.from('crm_event_comments').select('event_id').in('event_id', evIds.slice(i, i + 150))
      ;((data as { event_id: string }[]) || []).forEach(r => { c[r.event_id] = (c[r.event_id] || 0) + 1 })
    }
    setCounts(c)
  }, [idsKey])
  useEffect(() => { reload() }, [reload])

  // nessun atleta collegato: niente caricamento infinito, ma il passo successivo
  if (!athletesLoading && athletes.length === 0) {
    return <Empty icon={<Icon name="calendar" size={24} strokeWidth={1.6} />} title={tr('Nessun atleta collegato')}
      hint={tr('Quando un atleta accetta il tuo invito, qui trovi partite e impegni di tutti.')}
      action={goto ? { label: tr('Invita un atleta'), onClick: () => goto('my-athletes') } : undefined} />
  }
  if (loading) return <Spinner />

  const tagOf: TagOf = scope === 'all' ? (pid: number) => {
    const i = athletes.findIndex(a => a.api_player_id === pid)
    if (i < 0) return null
    return { name: athletes[i].name || '—', color: ATHLETE_PALETTE[i % ATHLETE_PALETTE.length] }
  } : null
  const canOpenMatch = !!goto && !!role && PERF_ROLES.includes(role)
  const onOpenMatch = canOpenMatch ? (e: AgItem) => { const pid = pidsOf(e)[0]; if (pid != null) setAthleteId(pid); goto!('performance') } : undefined

  // Il team non tocca il calendario dell'atleta: corregge solo la PROPRIA proposta finche' non e' confermata.
  const canEdit = (e: AgItem) => !e._match && (isAdmin || role === 'player'
    || (isPro && !!uid && e.created_by === uid && OPEN_STATES.includes(e.request_status || '')))
  // Richieste dell'atleta: l'agenzia conferma o rifiuta.
  const canConfirm = (e: AgItem) => !e._match && isAdmin && e.request_status === 'da_confermare' && !isTeamProposal(e)
  const onConfirm = async (e: EventItem, ok: boolean) => {
    const { error } = await updateRow('crm_events', e.id, { request_status: ok ? 'confermata' : 'rifiutata' })
    if (error) { toast(error.message, 'err'); return }
    toast(ok ? tr('Richiesta confermata') : tr('Richiesta rifiutata'))
    reload()
  }
  // Proposte del team: risponde l'atleta (o AUVI).
  const canRespond = (e: AgItem) => !e._match && (isAdmin || role === 'player') && e.request_status === 'da_confermare' && isTeamProposal(e)
  const onRespond = async (e: EventItem, status: 'confermata' | 'rifiutata' | 'modifica_richiesta', note?: string) => {
    const { error } = await updateRow('crm_events', e.id, { request_status: status, change_note: status === 'modifica_richiesta' ? (note || null) : null })
    if (error) { toast(error.message, 'err'); return }
    toast(status === 'confermata' ? tr('Impegno confermato') : status === 'rifiutata' ? tr('Proposta rifiutata') : tr('Modifica richiesta inviata'))
    reload()
  }
  const onAsk = (e: EventItem) => setAskFor(e)
  const bump = (id: string, d: number) => setCounts(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) + d) }))
  const onDel = (e: EventItem) => {
    setRows(rs => rs.filter(x => x.id !== e.id))
    undoable(tr('Impegno eliminato'), () => deleteRow('crm_events', e.id), reload)
  }
  const onAdd = canAdd ? (dayIso: string) => setEdit({ ...emptyEv(defType), start_at: dayIso }) : undefined
  const shared = { canEdit, onEdit: setEdit, onDel, canConfirm, onConfirm, goto, onAdd, tagOf, onOpenMatch, canRespond, onRespond, onAsk, counts, bump, uid, isPro: isPro && !isAdmin }
  const selName = athletes.find(a => a.api_player_id === athleteId)?.name || tr('Atleta')

  return (
    <div className="grid" style={{ gap: 8 }}>
      <style>{AG_CSS}</style>
      {showScope && (
        <Tabs tabs={[{ key: 'all', label: tr('Tutti i miei atleti') }, { key: 'one', label: selName }]} value={scope} onChange={setScope} />
      )}
      <div className="flex between" style={{ alignItems: 'center' }}>
        <div className="flex gap">
          <Tabs tabs={[{ key: 'calendario', label: tr('Calendario') }, { key: 'lista', label: tr('Lista') }]} value={view} onChange={setView} />
        </div>
        {canAdd && <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => setEdit(emptyEv(defType))}>+ {addLabel}</button>}
      </div>

      {rows.length === 0 ? (
        <Empty icon={<Icon name="clock" size={24} strokeWidth={1.6} />} title="Agenda vuota" hint="Aggiungi i tuoi impegni personali; allenamenti e partite compaiono in automatico."
          action={canAdd ? { label: '+ ' + addLabel, onClick: () => setEdit(emptyEv(defType)) } : undefined} />
      ) : view === 'lista'
        ? <ListView rows={rows} {...shared} />
        : <CalendarView rows={rows} {...shared} />}

      {/* la scheda completa sta in Impostazioni: qui solo un rimando di una riga */}
      <button className="ed-more" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => goto?.('settings')}>
        <Icon name="smartphone" size={14} /> {tr("Vedi l'agenda nel calendario del telefono")} →
      </button>

      {askFor && <AskChangeModal ev={askFor} onClose={() => setAskFor(null)}
        onSend={async note => { await onRespond(askFor, 'modifica_richiesta', note); setAskFor(null) }} />}

      {edit && <EventForm value={edit} isAdmin={isAdmin} role={role} uid={uid} athleteId={athleteId}
        nameOf={(pid: number | null) => athletes.find(a => a.api_player_id === pid)?.name || tr('Atleta')}
        athleteChoices={scope === 'all' && !edit.id ? athletes.map(a => ({ id: a.api_player_id, name: a.name || String(a.api_player_id) })) : undefined}
        onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

const AG_CSS = `
.ag-chip { display: inline-flex; align-items: center; max-width: 140px; padding: 1px 8px; border-radius: 999px; border: 1px solid; font-size: 11px; font-weight: 700; line-height: 1.5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
.ag-chips { display: inline-flex; gap: 4px; flex-shrink: 0; }
.ag-row-static { cursor: default; }
.ag-st { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 999px; line-height: 1.3; }
.ag-st span { overflow-wrap: anywhere; }
.ag-note { margin-top: 6px; padding: 6px 10px; border-left: 3px solid var(--magenta); background: rgba(221,0,136,.06); border-radius: 0 8px 8px 0; font-size: 12.5px; color: var(--text); overflow-wrap: anywhere; }
.ag-thread { margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; }
.ag-cm { font-size: 13px; line-height: 1.4; padding: 7px 10px; border-radius: 10px; background: var(--surface-2); overflow-wrap: anywhere; }
.ag-cm.mod { background: rgba(221,0,136,.07); border: 1px solid rgba(221,0,136,.25); }
.ag-cm-h { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-dim); margin-bottom: 2px; flex-wrap: wrap; }
.ag-cm-h b { color: var(--text); font-weight: 700; }
.ag-cm-x { margin-left: auto; color: var(--text-faint); display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 6px; }
.ag-cm-x:hover { color: var(--red); background: rgba(229,63,0,.08); }
.ag-cm-form { display: flex; flex-direction: column; gap: 6px; }
.ag-cm-btns { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap; }
.ev-row-dot.mod { background: var(--magenta); }
.ev-row-dot.no { background: var(--red); }
`

function Chips({ e, tagOf }: { e: AgItem; tagOf: TagOf }) {
  if (!tagOf) return null
  const tags = pidsOf(e).map(tagOf).filter((x): x is Tag => !!x)
  if (!tags.length) return null
  return (
    <span className="ag-chips">
      {tags.map(t => <span key={t.name} className="ag-chip" style={{ color: t.color, background: t.color + '12', borderColor: t.color + '40' }}>{t.name}</span>)}
    </span>
  )
}

type SharedProps = {
  rows: AgItem[]; canEdit: (e: AgItem) => boolean;
  canConfirm: (e: AgItem) => boolean; onConfirm: (e: EventItem, ok: boolean) => void;
  onEdit: (e: EventItem) => void; onDel: (e: EventItem) => void; goto?: (r: string) => void
  onAdd?: (dayIso: string) => void
  tagOf: TagOf; onOpenMatch?: (e: AgItem) => void
  canRespond: (e: AgItem) => boolean
  onRespond: (e: EventItem, status: 'confermata' | 'rifiutata' | 'modifica_richiesta') => void
  onAsk: (e: EventItem) => void
  counts: Record<string, number>; bump: (id: string, d: number) => void
  uid?: string; isPro: boolean
}

function cardFor(p: SharedProps, e: AgItem) {
  return <EvCard key={e.id} e={e} canEdit={p.canEdit(e)} onEdit={() => p.onEdit(e)} onDel={() => p.onDel(e)}
    canConfirm={p.canConfirm(e)} onConfirm={ok => p.onConfirm(e, ok)}
    canRespond={p.canRespond(e)} onRespond={st => p.onRespond(e, st)} onAsk={() => p.onAsk(e)}
    count={p.counts[e.id] || 0} onCount={d => p.bump(e.id, d)} uid={p.uid} isPro={p.isPro}
    goto={p.goto} tagOf={p.tagOf} onOpenMatch={p.onOpenMatch} />
}

function ListView(props: SharedProps) {
  const { rows } = props
  const { t: tr } = useLang()
  const now = Date.now()
  const upcoming = rows.filter(e => new Date(e.start_at).getTime() >= now - 3600000)
  const past = rows.filter(e => new Date(e.start_at).getTime() < now - 3600000).reverse()

  const today = dayKey(new Date())
  const tomorrow = dayKey(new Date(now + 86400000))
  const in7 = dayKey(new Date(now + 7 * 86400000))
  const groups: { label: string; items: AgItem[] }[] = [
    { label: tr('Oggi'), items: [] }, { label: tr('Domani'), items: [] },
    { label: tr('Questa settimana'), items: [] }, { label: tr('Più avanti'), items: [] },
  ]
  upcoming.forEach(e => {
    const k = localKey(e.start_at)
    if (k === today) groups[0].items.push(e)
    else if (k === tomorrow) groups[1].items.push(e)
    else if (k <= in7) groups[2].items.push(e)
    else groups[3].items.push(e)
  })

  const card = (e: AgItem) => cardFor(props, e)

  return (
    <>
      {groups.filter(g => g.items.length).map(g => (
        <div key={g.label}>
          <div style={sectionLabel}>{g.label}</div>
          <div className="ev-list">{g.items.map(card)}</div>
        </div>
      ))}
      {past.length > 0 && (
        <div style={{ opacity: .55 }}>
          <div style={sectionLabel}>{tr('Passati')}</div>
          <div className="ev-list">{past.slice(0, 5).map(card)}</div>
        </div>
      )}
    </>
  )
}

function CalendarView(props: SharedProps) {
  const { rows, onAdd, tagOf, onOpenMatch } = props
  const { t: tr } = useLang()
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [sel, setSel] = useState<Date | null>(null)

  const byDay: Record<string, AgItem[]> = {}
  rows.forEach(e => { const k = localKey(e.start_at); (byDay[k] = byDay[k] || []).push(e) })

  const first = new Date(cur.y, cur.m, 1)
  const startWd = (first.getDay() + 6) % 7
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < startWd; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cur.y, cur.m, d))
  while (cells.length % 7 !== 0) cells.push(null)

  const prev = () => setCur(c => c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 })
  const next = () => setCur(c => c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 })
  const todayK = dayKey(new Date())

  const now = Date.now()
  const next3 = rows.filter(e => new Date(e.start_at).getTime() >= now - 3600000).slice(0, 3)

  const card = (e: AgItem) => cardFor(props, e)

  // In alto ciò che arriva, sotto il calendario per spostarsi nei giorni;
  // toccando un giorno i suoi impegni compaiono subito sotto il calendario.
  return (
    <>
      <div style={{ ...sectionLabel, marginTop: 4 }}>{tr('Prossimi impegni')}</div>
      {next3.length === 0
        ? <div className="faint" style={{ padding: '4px 6px 8px' }}>{tr('Nessun impegno in programma.')}</div>
        : <div className="ev-list ev-list-compact">{next3.map(e => <EvRow key={e.id} e={e} tagOf={tagOf} onOpen={e._match ? (onOpenMatch ? () => onOpenMatch(e) : undefined) : () => setSel(new Date(e.start_at))} />)}</div>}

      <div className="card" style={{ padding: 12 }}>
        <div className="flex between" style={{ alignItems: 'center', marginBottom: 8 }}>
          <button className="btn btn-sm" onClick={prev}>‹</button>
          <div style={{ fontWeight: 700 }}>{tr(MONTHS[cur.m])} {cur.y}</div>
          <button className="btn btn-sm" onClick={next}>›</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
          {WD.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', padding: '4px 0' }}>{tr(w)}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const k = dayKey(d)
            const evs = byDay[k] || []
            const isToday = k === todayK
            const isSel = sel && dayKey(sel) === k
            return (
              <div key={i} onClick={() => setSel(d)}
                style={{ minHeight: 36, borderRadius: 10, cursor: 'pointer', border: isSel ? '1.5px solid var(--ink)' : isToday ? '1px solid var(--accent)' : '1px solid var(--border)', background: isSel ? 'var(--yellow-soft)' : isToday ? 'rgba(255,236,0,.10)' : 'transparent', padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 500 }}>{d.getDate()}</span>
                <span className="flex" style={{ gap: 2 }}>
                  {evs.slice(0, 4).map((e, j) => <span key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: typeFor(e).c }} />)}
                </span>
              </div>
            )
          })}
        </div>
      </div>


      {sel && (
        <>
          <div style={sectionLabel} className="flex between">
            <span>{sel.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span className="flex gap">
              {onAdd && <button className="btn btn-sm" onClick={() => { const dd = new Date(sel); dd.setHours(12, 0, 0, 0); onAdd(dd.toISOString()) }}>+ {tr('Aggiungi')}</button>}
              <button className="btn btn-ghost btn-sm" onClick={() => setSel(null)}>{tr('Chiudi')}</button>
            </span>
          </div>
          {(byDay[dayKey(sel)] || []).length === 0
            ? <div className="faint" style={{ padding: '4px 6px' }}>{tr('Nessun impegno in questo giorno.')}</div>
            : <div className="ev-list">{(byDay[dayKey(sel)] || []).map(card)}</div>}
        </>
      )}
    </>
  )
}

// Stessa scheda dell'impegno in formato riga: tipo, titolo, giorno e ora.
// Un tocco seleziona quel giorno nel calendario, dove compare la scheda completa.
function EvRow({ e, onOpen, tagOf }: { e: AgItem; onOpen?: () => void; tagOf: TagOf }) {
  const { t: tr } = useLang()
  const t = typeFor(e)
  const d = new Date(e.start_at)
  const day = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  return (
    <button className={'card ev-row' + (onOpen ? '' : ' ag-row-static')} onClick={onOpen} disabled={!onOpen} style={{ borderLeft: `3px solid ${t.c}`, color: 'inherit' }}>
      <span className="ev-row-ic" style={{ background: t.c + '22', color: t.c }}><Icon name={t.icon} size={14} /></span>
      <span className="ev-row-t">{e.title}</span>
      <Chips e={e} tagOf={tagOf} />
      <span className="ev-row-when">{day} · <b>{time}</b></span>
      {!e._match && e.request_status === 'da_confermare' && <span className="ev-row-dot" title={tr('Da confermare')} />}
      {!e._match && e.request_status === 'modifica_richiesta' && <span className="ev-row-dot mod" title={tr('Modifica richiesta')} />}
      {!e._match && e.request_status === 'rifiutata' && <span className="ev-row-dot no" title={tr('Non accettata')} />}
    </button>
  )
}

function StatusChip({ e }: { e: AgItem }) {
  const { t: tr } = useLang()
  const req = e._match ? null : e.request_status
  if (!req) return null
  const team = isTeamProposal(e)
  const who = tr(ROLE_LABEL[e.proposed_by_role || ''] || '')
  const conf: Record<string, { bg: string; c: string; ic: string; l: string }> = {
    da_confermare: { bg: 'var(--yellow-soft)', c: 'var(--gold)', ic: 'clock',
      l: team ? `${tr('Proposta da')} ${who} · ${tr('da confermare')}` : tr("Richiesta dell'atleta · da confermare") },
    modifica_richiesta: { bg: 'rgba(221,0,136,.10)', c: 'var(--magenta)', ic: 'edit', l: tr('Modifica richiesta') },
    rifiutata: { bg: 'rgba(229,63,0,.10)', c: 'var(--red)', ic: 'x', l: team ? tr('Non accettata') : tr('Richiesta non accolta') },
    confermata: { bg: 'rgba(18,161,80,.12)', c: 'var(--green)', ic: 'check', l: tr('Confermato') },
  }
  const k = conf[req]
  if (!k) return null
  return (
    <div style={{ marginTop: 6 }}>
      <span className="ag-st" style={{ background: k.bg, color: k.c }}>
        <Icon name={k.ic} size={12} style={{ flexShrink: 0 }} /><span>{k.l}</span>
      </span>
      {req === 'modifica_richiesta' && e.change_note && <div className="ag-note">«{e.change_note}»</div>}
    </div>
  )
}

function EvCard({ e, canEdit, onEdit, onDel, canConfirm, onConfirm, canRespond, onRespond, onAsk, count, onCount, uid, isPro, goto, tagOf, onOpenMatch }: {
  e: AgItem; canEdit: boolean; onEdit: () => void; onDel: () => void; canConfirm: boolean; onConfirm: (ok: boolean) => void
  canRespond: boolean; onRespond: (st: 'confermata' | 'rifiutata') => void; onAsk: () => void
  count: number; onCount: (d: number) => void; uid?: string; isPro: boolean
  goto?: (r: string) => void; tagOf: TagOf; onOpenMatch?: (e: AgItem) => void
}) {
  const { t: tr } = useLang()
  const [open, setOpen] = useState(false)
  const t = typeFor(e)
  const isTraining = e.type === 'allenamento' && !!e.fitness_program_id
  const d = new Date(e.start_at)
  const day = d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
  const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
  // chi ha proposto e si e' visto rimandare indietro la proposta la corregge e la ripropone
  const canRepropose = isPro && !!uid && e.created_by === uid && (e.request_status === 'modifica_richiesta' || e.request_status === 'rifiutata')
  return (
    <div className="card" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start', borderLeft: `3px solid ${t.c}`, minWidth: 0 }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: t.c + '22', color: t.c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
        <Icon name={t.icon} size={17} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex between" style={{ alignItems: 'flex-start', gap: 10 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, lineHeight: 1.3, minWidth: 0, overflowWrap: 'anywhere' }}>{e.title}</div>
          <span style={{ fontSize: 10.5, color: t.c, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .6, textAlign: 'right', maxWidth: '45%' }}>{tr(t.l)}</span>
        </div>
        <div className="flex gap" style={{ alignItems: 'center', marginTop: 4, flexWrap: 'wrap', gap: 10 }}>
          <Chips e={e} tagOf={tagOf} />
          {e._match && e.notes && <span className="faint" style={{ fontSize: 12 }}>{e.notes}</span>}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 500, color: 'var(--text-dim)' }}>
            <Icon name="calendar" size={13} /> {day}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: 'var(--text)' }}>
            <Icon name="clock" size={13} /> {time}
          </span>
          {!e._match && e.visibility === 'privato' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 700, color: 'var(--text-dim)' }}>
              <Icon name="lock" size={12} /> {tr('Privato')}
            </span>
          )}
        </div>
        {e.location && <a className="faint" href={mapsUrl(e.location)} target="_blank" rel="noreferrer" title={tr("Apri in Maps")} style={{ fontSize: 12, marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', maxWidth: '100%', overflowWrap: 'anywhere' }}><Icon name="pin" size={13} style={{ flexShrink: 0 }} /> {e.location} <span style={{ opacity: .7 }}>↗</span></a>}
        <StatusChip e={e} />
        {e.attachments && e.attachments.length > 0 && (
          <div className="flex gap" style={{ marginTop: 11, flexWrap: 'wrap' }}>
            {e.attachments.map(a => (
              <button key={a.path} className="btn btn-sm" title={a.name}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%' }}
                onClick={() => openAttachment(a)}>
                <Icon name="download" size={13} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
              </button>
            ))}
          </div>
        )}
        {/* un'unica riga di azioni: conferme e scheda a sinistra, icone a destra */}
        <div className="ev-actions">
          {e._match && onOpenMatch && <button className="btn btn-sm" onClick={() => onOpenMatch(e)}>{tr('Apri partita →')}</button>}
          {isTraining && goto && <button className="btn btn-sm btn-primary" onClick={() => goto('fitness')}>{tr('Apri scheda →')}</button>}
          {canConfirm && <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', borderColor: 'var(--green)' }} onClick={() => onConfirm(true)}>{tr('Conferma')}</button>}
          {canConfirm && <button className="btn btn-ghost btn-sm" onClick={() => onConfirm(false)}>{tr('Rifiuta')}</button>}
          {canRespond && <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', borderColor: 'var(--green)' }} onClick={() => onRespond('confermata')}>{tr('Conferma')}</button>}
          {canRespond && <button className="btn btn-sm" onClick={onAsk}>{tr('Chiedi modifica')}</button>}
          {canRespond && <button className="btn btn-ghost btn-sm" onClick={() => onRespond('rifiutata')}>{tr('Rifiuta')}</button>}
          {canRepropose && <button className="btn btn-sm btn-primary" onClick={onEdit}>{tr('Correggi e riproponi')}</button>}
          {!e._match && (
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Icon name="message" size={14} /> {tr('Commenti')} ({count})
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="ev-ic" title={tr('Nel mio calendario')} aria-label={tr('Nel mio calendario')}
            onClick={() => downloadIcs({ title: e.title, start: e.start_at, end: e.end_at || undefined, location: e.location || undefined, description: e.notes || undefined })}>
            <Icon name="calendar" size={16} />
          </button>
          {e.location && (
            <a className="ev-ic" href={mapsUrl(e.location)} target="_blank" rel="noreferrer" title={tr('Indicazioni')} aria-label={tr('Indicazioni')}>
              <Icon name="pin" size={16} />
            </a>
          )}
          {canEdit && <button className="ev-ic" onClick={onEdit} title={tr('Modifica')} aria-label={tr('Modifica')}><Icon name="edit" size={16} /></button>}
          {canEdit && <button className="ev-ic ev-ic-danger" onClick={onDel} title={tr('Elimina')} aria-label={tr('Elimina')}><Icon name="trash" size={16} /></button>}
        </div>
        {open && !e._match && <Thread eventId={e.id} uid={uid} mainIsChange={!canEdit} onCount={onCount} />}
      </div>
    </div>
  )
}

// Commenti e richieste di modifica sull'impegno: chi non puo' modificarlo interagisce da qui.
function Thread({ eventId, uid, mainIsChange, onCount }: { eventId: string; uid?: string; mainIsChange: boolean; onCount: (d: number) => void }) {
  const { t: tr } = useLang()
  const [list, setList] = useState<EventComment[] | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await supabase.from('crm_event_comments').select('*').eq('event_id', eventId).order('created_at', { ascending: true })
    setList((data as EventComment[]) || [])
  }, [eventId])
  useEffect(() => { load() }, [load])

  async function send(kind: 'commento' | 'modifica') {
    const body = text.trim()
    if (!body) return
    setBusy(true)
    const { error } = await insertRow('crm_event_comments', { event_id: eventId, body, kind })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    setText(''); onCount(1)
    toast(kind === 'modifica' ? tr('Richiesta di modifica inviata') : tr('Commento inviato'))
    load()
  }
  async function del(c: EventComment) {
    const { error } = await deleteRow('crm_event_comments', c.id)
    if (error) { toast(error.message, 'err'); return }
    onCount(-1); setList(l => (l || []).filter(x => x.id !== c.id))
  }
  const who = (c: EventComment) => c.author_id === uid ? tr('Tu') : tr(ROLE_LABEL[c.author_role || ''] || 'Utente')
  const when = (iso: string) => new Date(iso).toLocaleString('it-IT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="ag-thread">
      {list === null ? <div className="faint" style={{ fontSize: 12.5 }}>{tr('Carico…')}</div>
        : list.length === 0 ? <div className="faint" style={{ fontSize: 12.5 }}>{tr('Nessun commento.')}</div>
        : list.map(c => (
          <div key={c.id} className={'ag-cm' + (c.kind === 'modifica' ? ' mod' : '')}>
            <div className="ag-cm-h">
              <b>{who(c)}</b><span>· {when(c.created_at)}</span>
              {c.kind === 'modifica' && <span style={{ color: 'var(--magenta)', fontWeight: 700 }}>· {tr('Richiesta di modifica')}</span>}
              {c.author_id === uid && <button className="ag-cm-x" onClick={() => del(c)} title={tr('Elimina')} aria-label={tr('Elimina')}><Icon name="x" size={13} /></button>}
            </div>
            <div>{c.body}</div>
          </div>
        ))}
      <div className="ag-cm-form">
        <Textarea rows={2} value={text} onChange={ev => setText(ev.target.value)}
          placeholder={mainIsChange ? tr('Scrivi un commento o cosa andrebbe cambiato…') : tr('Scrivi un commento…')} />
        <div className="ag-cm-btns">
          <button className={'btn btn-sm' + (mainIsChange ? '' : ' btn-primary')} disabled={busy || !text.trim()} onClick={() => send('commento')}>{tr('Commenta')}</button>
          <button className={'btn btn-sm' + (mainIsChange ? ' btn-primary' : '')} disabled={busy || !text.trim()} onClick={() => send('modifica')}>{tr('Chiedi modifica')}</button>
        </div>
      </div>
    </div>
  )
}

function AskChangeModal({ ev, onClose, onSend }: { ev: EventItem; onClose: () => void; onSend: (note: string) => Promise<void> }) {
  const { t: tr } = useLang()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <Modal title={tr('Chiedi una modifica')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !note.trim()} onClick={async () => { setBusy(true); await onSend(note.trim()); setBusy(false) }}>{tr('Invia')}</button>
      </>}>
      <div className="faint" style={{ fontSize: 13, marginBottom: 10, overflowWrap: 'anywhere' }}>{ev.title}</div>
      <Field label={tr('Cosa va cambiato?')}>
        <Textarea rows={3} value={note} onChange={e => setNote(e.target.value)} placeholder={tr('es. Meglio alle 18, la mattina ho allenamento')} />
      </Field>
    </Modal>
  )
}

function EventForm({ value, isAdmin, role, uid, athleteId, nameOf, athleteChoices, onClose, onSaved }: {
  value: Partial<EventItem>; isAdmin: boolean; role?: string | null; uid?: string; athleteId: number | null
  nameOf: (pid: number | null) => string
  athleteChoices?: { id: number; name: string }[]; onClose: () => void; onSaved: () => void
}) {
  const { t: tr } = useLang()
  const [pid, setPid] = useState<number | null>(athleteChoices ? (athleteChoices.find(a => a.id === athleteId)?.id ?? athleteChoices[0]?.id ?? null) : athleteId)
  const [f, setF] = useState<Partial<EventItem>>({ ...value, start_at: value.start_at ? toLocal(value.start_at) : '', end_at: value.end_at ? toLocal(value.end_at) : '' })
  const isPlayer = role === 'player' && !isAdmin
  const proposing = !isAdmin && !!role && PRO_ROLES.includes(role)
  // privato: di default acceso per le visite mediche, finche' l'atleta non sceglie a mano
  const [priv, setPriv] = useState<boolean>(value.id ? value.visibility === 'privato' : value.type === 'medico')
  const [privTouched, setPrivTouched] = useState(!!value.id)
  const [busy, setBusy] = useState(false)
  const [atts, setAtts] = useState<EventAttachment[]>(value.attachments || [])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof EventItem, v: any) => setF(p => ({ ...p, [k]: v }))
  const baseTypes = typesFor(isAdmin, role)
  const types = f.type && !baseTypes.includes(f.type) ? [...baseTypes, f.type] : baseTypes
  const onType = (v: string) => { set('type', v); if (isPlayer && !privTouched) setPriv(v === 'medico') }
  const who = nameOf(athleteChoices ? pid : (value.player_id ?? athleteId))

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    for (const file of files) {
      const path = `event/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
      const up = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: false })
      if (up.error) { toast(up.error.message, 'err'); continue }
      setAtts(prev => [...prev, { name: file.name, path, size: file.size, mime: file.type }])
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  async function removeAtt(a: EventAttachment) {
    setAtts(prev => prev.filter(x => x.path !== a.path))
    // rimozione fisica: consentita solo agli admin dalle policy storage, quindi best-effort
    await supabase.storage.from(DOC_BUCKET).remove([a.path])
  }

  async function save() {
    if (!f.title || !f.start_at) return
    setBusy(true)
    const payload = {
      title: f.title, type: f.type || 'personale', start_at: new Date(f.start_at as string).toISOString(),
      end_at: f.end_at ? new Date(f.end_at as string).toISOString() : null, location: f.location || null, notes: f.notes || null,
      attachments: atts,
      ...(isPlayer ? { visibility: priv ? 'privato' : 'team' } : {}),
    }
    const { error } = f.id
      ? await updateRow('crm_events', f.id, payload)
      : await insertRow('crm_events', { ...payload, player_id: athleteChoices ? pid : athleteId, created_by: uid })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    if (proposing) toast(f.id ? tr('Proposta aggiornata') : tr('Proposta inviata'))
    onSaved()
  }

  return (
    <Modal title={proposing
        ? (f.id ? tr('Correggi la proposta') : `${tr('Proponi un impegno a')} ${who}`)
        : (f.id ? tr('Modifica impegno') : tr('Nuovo impegno'))} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{tr('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !f.title || !f.start_at || (!!athleteChoices && pid == null)} onClick={save}>
          {busy ? tr('Salvo…') : proposing ? (f.id ? tr('Riproponi') : tr('Invia proposta')) : tr('Salva')}
        </button>
      </>}>
      {proposing && <div className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>{tr("L'atleta riceve la proposta e la conferma")}</div>}
      {athleteChoices && (
        <Field label={tr("Atleta")}>
          <Select value={pid ?? ''} onChange={e => setPid(Number(e.target.value))}>
            {athleteChoices.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
      )}
      <Field label={tr("Titolo")}><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder={tr("es. Transfer aeroporto")} /></Field>
      <div className="row2">
        <Field label={tr("Tipo")}><Select value={f.type} onChange={e => onType(e.target.value)}>{types.map(k => <option key={k} value={k}>{tr(typeOf(k).l)}</option>)}</Select></Field>
        <Field label={tr("Luogo")}><LuogoAutocomplete value={f.location || ''} onChange={v => set('location', v)} /></Field>
      </div>
      <div className="row2">
        <Field label={tr("Inizio")}><Input type="datetime-local" value={f.start_at as string || ''} onChange={e => set('start_at', e.target.value)} /></Field>
        <Field label={tr("Fine (facolt.)")}><Input type="datetime-local" value={f.end_at as string || ''} onChange={e => set('end_at', e.target.value)} /></Field>
      </div>
      <Field label={tr("Note")}><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      {isPlayer && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, fontWeight: 600, margin: '2px 0 10px', cursor: 'pointer' }}>
          <input type="checkbox" checked={priv} onChange={e => { setPriv(e.target.checked); setPrivTouched(true) }} style={{ width: 18, height: 18, accentColor: 'var(--ink)', flexShrink: 0 }} />
          <Icon name="lock" size={14} style={{ flexShrink: 0 }} />
          <span>{tr('Privato (solo io e AUVI)')}</span>
        </label>
      )}

      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '2px 0 8px' }}>{tr('Documenti allegati')}</div>
        {atts.length > 0 && (
          <div className="grid" style={{ gap: 6, marginBottom: 8 }}>
            {atts.map(a => (
              <div key={a.path} className="flex between" style={{ alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: '8px 10px' }}>
                <span className="flex gap" style={{ alignItems: 'center', minWidth: 0 }}>
                  <Icon name="file" size={15} />
                  <span style={{ fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  {a.size ? <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>· {attSize(a.size)}</span> : null}
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => removeAtt(a)}>{tr('Rimuovi')}</button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={14} /> {uploading ? tr('Carico…') : tr('Aggiungi file')}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={onFiles} />
        <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>Hotel, voli, biglietti, prenotazioni: l'atleta li apre e li scarica sul telefono.</div>
      </div>
    </Modal>
  )
}

function toLocal(iso: string) {
  const d = new Date(iso); const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
