import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Badge, Spinner, ConfirmButton } from '../components/ui'
import { fmtDate, daysUntil } from '../lib/format'
import type { Task } from '../lib/types'

const COLS: { key: Task['status']; label: string }[] = [
  { key: 'todo', label: 'Da fare' }, { key: 'doing', label: 'In corso' }, { key: 'done', label: 'Completate' },
]
const empty = (): Partial<Task> => ({ title: '', status: 'todo', priority: 'medium', assignee: 'auvi' })

export default function Tasks() {
  const { isAdmin, session } = useAuth()
  const { rows, loading, reload } = useCollection<Task>('crm_tasks', { orderBy: 'created_at' })
  const [edit, setEdit] = useState<Partial<Task> | null>(null)

  if (loading) return <Spinner />

  async function move(t: Task, status: Task['status']) {
    await updateRow('crm_tasks', t.id, { status, updated_at: new Date().toISOString() })
    reload()
  }
  const canMove = (t: Task) => isAdmin || t.assignee === 'player'

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex between">
        <div className="muted">{rows.filter(t => t.status !== 'done').length} attività aperte</div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(empty())}>+ Nuova task</button>}
      </div>

      <div className="grid g3" style={{ alignItems: 'start' }}>
        {COLS.map(col => {
          const items = rows.filter(t => t.status === col.key)
          return (
            <div className="card" key={col.key} style={{ background: 'var(--bg-2)' }}>
              <div className="card-head">
                <div className="card-title">{col.label}</div>
                <span className="badge">{items.length}</span>
              </div>
              <div className="grid" style={{ gap: 10 }}>
                {items.map(t => {
                  const d = daysUntil(t.due_date)
                  return (
                    <div className="card" key={t.id} style={{ padding: 13 }}>
                      <div className="flex between" style={{ alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{t.title}</div>
                        <span className="dot" style={{ marginTop: 5, background: t.priority === 'high' ? 'var(--red)' : t.priority === 'low' ? 'var(--text-faint)' : 'var(--gold)' }} />
                      </div>
                      {t.description && <div className="row-sub" style={{ marginTop: 4 }}>{t.description}</div>}
                      <div className="flex gap wrap" style={{ marginTop: 9 }}>
                        <Badge tone={t.assignee === 'player' ? 'accent' : 'blue'}>{t.assignee === 'player' ? 'Giocatore' : 'AUVI'}</Badge>
                        {t.due_date && <Badge tone={d != null && d < 0 ? 'red' : d != null && d < 3 ? 'gold' : undefined}>{fmtDate(t.due_date)}</Badge>}
                      </div>
                      {canMove(t) && (
                        <div className="flex gap" style={{ marginTop: 10 }}>
                          {col.key !== 'todo' && <button className="btn btn-ghost btn-sm" onClick={() => move(t, col.key === 'done' ? 'doing' : 'todo')}>←</button>}
                          {col.key !== 'done' && <button className="btn btn-sm" onClick={() => move(t, col.key === 'todo' ? 'doing' : 'done')} style={{ flex: 1 }}>{col.key === 'todo' ? 'Avvia' : 'Completa'} →</button>}
                          {isAdmin && <><button className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}>✎</button><ConfirmButton onConfirm={async () => { await deleteRow('crm_tasks', t.id); reload() }}>×</ConfirmButton></>}
                        </div>
                      )}
                    </div>
                  )
                })}
                {items.length === 0 && <div className="faint" style={{ fontSize: 12.5, textAlign: 'center', padding: '14px 0' }}>—</div>}
              </div>
            </div>
          )
        })}
      </div>

      {edit && <TaskForm value={edit} uid={session?.user.id} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function TaskForm({ value, uid, onClose, onSaved }: { value: Partial<Task>; uid?: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Task>>(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Task, v: any) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true)
    const payload: any = {
      title: f.title, description: f.description || null, status: f.status, priority: f.priority,
      assignee: f.assignee, due_date: f.due_date || null, updated_at: new Date().toISOString(),
    }
    if (f.id) await updateRow('crm_tasks', f.id, payload)
    else await insertRow('crm_tasks', { ...payload, created_by: uid })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica task' : 'Nuova task'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <Field label="Titolo"><Input value={f.title || ''} onChange={e => set('title', e.target.value)} /></Field>
      <Field label="Descrizione"><Textarea value={f.description || ''} onChange={e => set('description', e.target.value)} /></Field>
      <div className="row2">
        <Field label="Assegnata a"><Select value={f.assignee} onChange={e => set('assignee', e.target.value)}><option value="auvi">AUVI</option><option value="player">Giocatore</option></Select></Field>
        <Field label="Priorità"><Select value={f.priority} onChange={e => set('priority', e.target.value)}><option value="low">Bassa</option><option value="medium">Media</option><option value="high">Alta</option></Select></Field>
      </div>
      <div className="row2">
        <Field label="Stato"><Select value={f.status} onChange={e => set('status', e.target.value)}><option value="todo">Da fare</option><option value="doing">In corso</option><option value="done">Completata</option></Select></Field>
        <Field label="Scadenza"><Input type="date" value={f.due_date || ''} onChange={e => set('due_date', e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
