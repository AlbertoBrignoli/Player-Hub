import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtDateTime } from '../lib/format'
import type { EventItem } from '../lib/types'

const TYPES: Record<string, { l: string; c: string }> = {
  partita: { l: 'Partita', c: 'accent' }, commerciale: { l: 'Commerciale', c: 'gold' },
  personale: { l: 'Personale', c: 'blue' }, scadenza: { l: 'Scadenza', c: 'red' },
}
const empty = (): Partial<EventItem> => ({ title: '', type: 'personale', start_at: '' })

export default function Agenda() {
  const { athleteId } = useAthlete()
  const { isAdmin } = useAuth()
  const { rows, loading, reload } = useCollection<EventItem>('crm_events', { orderBy: 'start_at', ascending: true, match: { player_id: athleteId } })
  const [edit, setEdit] = useState<Partial<EventItem> | null>(null)

  if (loading) return <Spinner />
  const now = Date.now()
  const upcoming = rows.filter(e => new Date(e.start_at).getTime() >= now - 3600000)
  const past = rows.filter(e => new Date(e.start_at).getTime() < now - 3600000).reverse()

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex between">
        <div className="muted">{upcoming.length} impegni in programma</div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(empty())}>+ Nuovo impegno</button>}
      </div>

      {rows.length === 0 ? <Empty icon={<Icon name="clock" size={30} strokeWidth={1.4} />} title="Agenda vuota" hint={isAdmin ? 'Aggiungi partite, impegni commerciali, appuntamenti.' : undefined} /> : (
        <>
          <div className="card">
            <div className="card-head"><div className="card-title">In arrivo</div></div>
            {upcoming.length === 0 ? <div className="faint" style={{ padding: '8px 0' }}>Nessun impegno futuro.</div> : (
              <div className="list">{upcoming.map(e => <Ev key={e.id} e={e} isAdmin={isAdmin} onEdit={() => setEdit(e)} onDel={async () => { await deleteRow('crm_events', e.id); reload() }} />)}</div>
            )}
          </div>
          {past.length > 0 && (
            <div className="card">
              <div className="card-head"><div className="card-title faint">Passati</div></div>
              <div className="list" style={{ opacity: .65 }}>{past.slice(0, 10).map(e => <Ev key={e.id} e={e} isAdmin={isAdmin} onEdit={() => setEdit(e)} onDel={async () => { await deleteRow('crm_events', e.id); reload() }} />)}</div>
            </div>
          )}
        </>
      )}

      {edit && <EventForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function Ev({ e, isAdmin, onEdit, onDel }: { e: EventItem; isAdmin: boolean; onEdit: () => void; onDel: () => void }) {
  const t = TYPES[e.type] || TYPES.personale
  return (
    <div className="row">
      <span className="dot" style={{ background: `var(--${t.c === 'accent' ? 'accent' : t.c === 'gold' ? 'gold' : t.c === 'red' ? 'red' : 'blue'})` }} />
      <div className="row-main">
        <div className="row-title">{e.title}</div>
        <div className="row-sub">{fmtDateTime(e.start_at)}{e.location ? ` · ${e.location}` : ''}</div>
      </div>
      <Badge tone={t.c as any}>{t.l}</Badge>
      {isAdmin && <><button className="btn btn-ghost btn-sm" onClick={onEdit}>✎</button><ConfirmButton onConfirm={onDel}>×</ConfirmButton></>}
    </div>
  )
}

function EventForm({ value, onClose, onSaved }: { value: Partial<EventItem>; onClose: () => void; onSaved: () => void }) {
  const { athleteId } = useAthlete()
  const [f, setF] = useState<Partial<EventItem>>({ ...value, start_at: value.start_at ? toLocal(value.start_at) : '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof EventItem, v: any) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    if (!f.start_at) return
    setBusy(true)
    const payload = {
      title: f.title, type: f.type, start_at: new Date(f.start_at as string).toISOString(),
      end_at: f.end_at ? new Date(f.end_at as string).toISOString() : null, location: f.location || null, notes: f.notes || null,
    }
    if (f.id) await updateRow('crm_events', f.id, payload)
    else await insertRow('crm_events', { ...payload, player_id: athleteId })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica impegno' : 'Nuovo impegno'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.title || !f.start_at} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <Field label="Titolo"><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="es. Olympiacos vs PAOK" /></Field>
      <div className="row2">
        <Field label="Tipo"><Select value={f.type} onChange={e => set('type', e.target.value)}>{Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}</Select></Field>
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
  const d = new Date(iso)
  const off = d.getTimezoneOffset()
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
}
