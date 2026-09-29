import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { insertRow } from '../lib/useData'
import { toast } from '../lib/toast'
import { goto } from '../lib/route'
import { Modal, Field, Input, Select, Tabs } from './ui'
import Icon from './Icon'

// "+" sempre a portata di pollice: nuovo impegno o nuova task con solo titolo e data.
// I dettagli (note, allegati, priorità) si aggiungono dopo, dalla scheda completa.
function defaultStart() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(10, 0, 0, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default function QuickAdd() {
  const { isAdmin, role, session } = useAuth()
  const { athleteId } = useAthlete()
  const canEvent = isAdmin || role === 'player'
  const canTask = isAdmin
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'event' | 'task'>(canEvent ? 'event' : 'task')
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(defaultStart)
  const [location, setLocation] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState<'auvi' | 'player'>('auvi')
  const [busy, setBusy] = useState(false)

  if (!canEvent && !canTask) return null

  function reset() { setTitle(''); setStart(defaultStart()); setLocation(''); setDue(''); setAssignee('auvi') }

  async function save() {
    if (!title.trim() || !athleteId) return
    setBusy(true)
    const { error } = kind === 'event'
      ? await insertRow('crm_events', {
          title: title.trim(), type: 'personale', start_at: new Date(start).toISOString(),
          location: location.trim() || null, player_id: athleteId, created_by: session?.user.id,
        })
      : await insertRow('crm_tasks', {
          title: title.trim(), status: 'todo', priority: 'medium', assignee, due_date: due || null,
          player_id: athleteId, created_by: session?.user.id, updated_at: new Date().toISOString(),
        })
    setBusy(false)
    if (error) { toast(error.message, 'err'); return }
    const dest = kind === 'event' ? 'agenda' : 'tasks'
    toast(kind === 'event' ? 'Impegno aggiunto' : 'Task aggiunta', 'ok', { label: 'Apri', onClick: () => goto(dest) })
    reset(); setOpen(false)
  }

  return (
    <>
      <button className="bell" onClick={() => setOpen(true)} aria-label="Aggiungi" title="Aggiungi impegno o task">
        <Icon name="plus" size={18} />
      </button>
      {open && (
        <Modal title="Aggiungi" onClose={() => setOpen(false)}
          footer={<><button className="btn" onClick={() => setOpen(false)}>Annulla</button>
            <button className="btn btn-primary" disabled={busy || !title.trim()} onClick={save}>{busy ? 'Salvo…' : 'Aggiungi'}</button></>}>
          {canEvent && canTask && (
            <Tabs tabs={[{ key: 'event', label: 'Impegno' }, { key: 'task', label: 'Task' }]} value={kind} onChange={setKind} style={{ marginBottom: 16 }} />
          )}
          <Field label={kind === 'event' ? 'Cosa' : 'Da fare'}>
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)}
              placeholder={kind === 'event' ? 'Es. Visita medica, shooting, volo' : 'Es. Inviare contratto firmato'}
              onKeyDown={e => { if (e.key === 'Enter') save() }} />
          </Field>
          {kind === 'event' ? (
            <div className="row2">
              <Field label="Quando"><Input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></Field>
              <Field label="Dove (facoltativo)"><Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Indirizzo o luogo" /></Field>
            </div>
          ) : (
            <div className="row2">
              <Field label="Scadenza (facoltativa)"><Input type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
              <Field label="Chi">
                <Select value={assignee} onChange={e => setAssignee(e.target.value as 'auvi' | 'player')}>
                  <option value="auvi">AUVI</option>
                  <option value="player">Atleta</option>
                </Select>
              </Field>
            </div>
          )}
        </Modal>
      )}
    </>
  )
}
