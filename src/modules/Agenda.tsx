import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime } from '../lib/format'
import type { EventItem } from '../lib/types'

type TypeDef = { l: string; icon: string; c: string }
// Palette contenuta e coerente: l'ICONA e' il segnale principale, il colore un accento.
const TYPES: Record<string, TypeDef> = {
  allenamento: { l: 'Allenamento', icon: 'dumbbell',  c: '#3fb984' },
  partita:     { l: 'Partita',     icon: 'ball',      c: '#8b7ff0' },
  medico:      { l: 'Medico',      icon: 'plus',      c: '#e0574a' },
  viaggio:     { l: 'Viaggio',     icon: 'send',      c: '#4a90d9' },
  commerciale: { l: 'Commerciale', icon: 'briefcase', c: '#c9922b' },
  sponsor:     { l: 'Sponsor',     icon: 'award',     c: '#c9922b' },
  personale:   { l: 'Personale',   icon: 'user',      c: '#8b909a' },
  scadenza:    { l: 'Scadenza',    icon: 'clock',     c: '#d98236' },
}
const typeOf = (t: string): TypeDef => TYPES[t] || TYPES.personale
const ADMIN_TYPES = ['partita', 'commerciale', 'sponsor', 'personale', 'medico', 'viaggio', 'scadenza']
const PLAYER_TYPES = ['personale', 'medico', 'viaggio']

const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']
const WD = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function localKey(iso: string) { return dayKey(new Date(iso)) }
const sectionLabel: React.CSSProperties = { fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-dim)', fontWeight: 700, margin: '16px 4px 8px' }
const emptyEv = (type: string): Partial<EventItem> => ({ title: '', type, start_at: '' })

export default function Agenda({ goto }: { goto?: (r: string) => void }) {
  const { athleteId } = useAthlete()
  const { isAdmin, role, session } = useAuth()
  const uid = session?.user.id
  const canAdd = isAdmin || role === 'player'
  const { rows, loading, reload } = useCollection<EventItem>('crm_events', { orderBy: 'start_at', ascending: true, match: { player_id: athleteId } })
  const [view, setView] = useState<'lista' | 'calendario'>('lista')
  const [edit, setEdit] = useState<Partial<EventItem> | null>(null)

  if (loading) return <Spinner />

  const canEdit = (e: EventItem) => isAdmin || e.created_by === uid
  const onDel = async (e: EventItem) => { await deleteRow('crm_events', e.id); reload() }
  const shared = { canEdit, onEdit: setEdit, onDel, goto }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex between" style={{ alignItems: 'center' }}>
        <div className="flex gap">
          <button className={view === 'lista' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setView('lista')}>Lista</button>
          <button className={view === 'calendario' ? 'btn btn-primary btn-sm' : 'btn btn-sm'} onClick={() => setView('calendario')}>Calendario</button>
        </div>
        {canAdd && <button className="btn btn-primary" onClick={() => setEdit(emptyEv('personale'))}>+ Nuovo impegno</button>}
      </div>

      {rows.length === 0 ? (
        <Empty icon={<Icon name="clock" size={30} strokeWidth={1.4} />} title="Agenda vuota" hint="Aggiungi i tuoi impegni personali; allenamenti e partite compaiono in automatico." />
      ) : view === 'lista'
        ? <ListView rows={rows} {...shared} />
        : <CalendarView rows={rows} {...shared} />}

      {edit && <EventForm value={edit} isAdmin={isAdmin} uid={uid} athleteId={athleteId} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

type SharedProps = {
  rows: EventItem[]; canEdit: (e: EventItem) => boolean;
  onEdit: (e: EventItem) => void; onDel: (e: EventItem) => void; goto?: (r: string) => void
}

function ListView({ rows, canEdit, onEdit, onDel, goto }: SharedProps) {
  const now = Date.now()
  const upcoming = rows.filter(e => new Date(e.start_at).getTime() >= now - 3600000)
  const past = rows.filter(e => new Date(e.start_at).getTime() < now - 3600000).reverse()

  const today = dayKey(new Date())
  const tomorrow = dayKey(new Date(now + 86400000))
  const in7 = dayKey(new Date(now + 7 * 86400000))
  const groups: { label: string; items: EventItem[] }[] = [
    { label: 'Oggi', items: [] }, { label: 'Domani', items: [] },
    { label: 'Questa settimana', items: [] }, { label: 'Più avanti', items: [] },
  ]
  upcoming.forEach(e => {
    const k = localKey(e.start_at)
    if (k === today) groups[0].items.push(e)
    else if (k === tomorrow) groups[1].items.push(e)
    else if (k <= in7) groups[2].items.push(e)
    else groups[3].items.push(e)
  })

  return (
    <>
      {groups.filter(g => g.items.length).map(g => (
        <div key={g.label}>
          <div style={sectionLabel}>{g.label}</div>
          <div className="card" style={{ padding: 6 }}><div className="list">
            {g.items.map(e => <Ev key={e.id} e={e} canEdit={canEdit(e)} onEdit={() => onEdit(e)} onDel={() => onDel(e)} goto={goto} />)}
          </div></div>
        </div>
      ))}
      {past.length > 0 && (
        <div>
          <div style={sectionLabel}>Passati</div>
          <div className="card" style={{ padding: 6, opacity: .6 }}><div className="list">
            {past.slice(0, 10).map(e => <Ev key={e.id} e={e} canEdit={canEdit(e)} onEdit={() => onEdit(e)} onDel={() => onDel(e)} goto={goto} />)}
          </div></div>
        </div>
      )}
    </>
  )
}

function CalendarView({ rows, canEdit, onEdit, onDel, goto }: SharedProps) {
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [sel, setSel] = useState<string>(dayKey(new Date()))

  const byDay: Record<string, EventItem[]> = {}
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
  const selEvents = (byDay[sel] || []).slice().sort((a, b) => a.start_at.localeCompare(b.start_at))

  return (
    <div className="card" style={{ padding: 16 }}>
      <div className="flex between" style={{ alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-sm" onClick={prev}>‹</button>
        <div style={{ fontWeight: 700 }}>{MONTHS[cur.m]} {cur.y}</div>
        <button className="btn btn-sm" onClick={next}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {WD.map(w => <div key={w} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-dim)', padding: '4px 0' }}>{w}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const k = dayKey(d)
          const evs = byDay[k] || []
          const isSel = k === sel, isToday = k === todayK
          return (
            <button key={i} onClick={() => setSel(k)}
              style={{ minHeight: 46, borderRadius: 10, border: isSel ? '1px solid var(--accent, #F4C430)' : '1px solid var(--border)', background: isToday ? 'rgba(255,255,255,.05)' : 'transparent', color: 'inherit', cursor: 'pointer', padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 500 }}>{d.getDate()}</span>
              <span className="flex" style={{ gap: 2 }}>
                {evs.slice(0, 4).map((e, j) => <span key={j} style={{ width: 5, height: 5, borderRadius: '50%', background: typeOf(e.type).c }} />)}
              </span>
            </button>
          )
        })}
      </div>

      <div style={sectionLabel}>{fmtDayLabel(sel)}</div>
      {selEvents.length === 0
        ? <div className="faint" style={{ padding: '4px 6px' }}>Nessun impegno in questo giorno.</div>
        : <div className="list">{selEvents.map(e => <Ev key={e.id} e={e} canEdit={canEdit(e)} onEdit={() => onEdit(e)} onDel={() => onDel(e)} goto={goto} />)}</div>}
    </div>
  )
}

function fmtDayLabel(k: string) {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
}

function Ev({ e, canEdit, onEdit, onDel, goto }: { e: EventItem; canEdit: boolean; onEdit: () => void; onDel: () => void; goto?: (r: string) => void }) {
  const t = typeOf(e.type)
  const isTraining = e.type === 'allenamento' && !!e.fitness_program_id
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t.c + '22', color: t.c, flex: '0 0 auto' }}>
        <Icon name={t.icon} size={15} />
      </span>
      <div className="row-main">
        <div className="row-title">{e.title}</div>
        <div className="row-sub">{fmtDateTime(e.start_at)}{e.location ? ` · ${e.location}` : ''}</div>
      </div>
      <span style={{ fontSize: 11.5, color: t.c, fontWeight: 600, whiteSpace: 'nowrap' }}>{t.l}</span>
      {isTraining && goto && <button className="btn btn-sm" onClick={() => goto('fitness')}>Apri scheda</button>}
      {canEdit && <><button className="btn btn-ghost btn-sm" onClick={onEdit}>✎</button><ConfirmButton onConfirm={onDel}>×</ConfirmButton></>}
    </div>
  )
}

function EventForm({ value, isAdmin, uid, athleteId, onClose, onSaved }: {
  value: Partial<EventItem>; isAdmin: boolean; uid?: string; athleteId: number | null; onClose: () => void; onSaved: () => void
}) {
  const [f, setF] = useState<Partial<EventItem>>({ ...value, start_at: value.start_at ? toLocal(value.start_at) : '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof EventItem, v: any) => setF(p => ({ ...p, [k]: v }))
  const types = isAdmin ? ADMIN_TYPES : PLAYER_TYPES

  async function save() {
    if (!f.title || !f.start_at) return
    setBusy(true)
    const payload = {
      title: f.title, type: f.type || 'personale', start_at: new Date(f.start_at as string).toISOString(),
      end_at: f.end_at ? new Date(f.end_at as string).toISOString() : null, location: f.location || null, notes: f.notes || null,
    }
    if (f.id) await updateRow('crm_events', f.id, payload)
    else await insertRow('crm_events', { ...payload, player_id: athleteId, created_by: uid })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica impegno' : 'Nuovo impegno'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.title || !f.start_at} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <Field label="Titolo"><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="es. Visita medica" /></Field>
      <div className="row2">
        <Field label="Tipo"><Select value={f.type} onChange={e => set('type', e.target.value)}>{types.map(k => <option key={k} value={k}>{typeOf(k).l}</option>)}</Select></Field>
        <Field label="Luogo"><Input value={f.location || ''} onChange={e => set('location', e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="Inizio"><Input type="datetime-local" value={f.start_at as string || ''} onChange={e => set('start_at', e.target.value)} /></Field>
        <Field label="Fine (facolt.)"><Input type="datetime-local" value={f.end_at as string || ''} onChange={e => set('end_at', e.target.value)} /></Field>
      </div>
      <Field label="Note"><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

function toLocal(iso: string) {
  const d = new Date(iso); const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
