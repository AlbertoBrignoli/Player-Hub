import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, Stat, ConfirmButton } from '../components/ui'
import { fmtMoney, fmtDate } from '../lib/format'
import type { Payment } from '../lib/types'

const CATS: Record<string, string> = {
  stipendio: 'Stipendio', bonus: 'Bonus', commissione_auvi: 'Commissione AUVI', collaboratore: 'Collaboratore', altro: 'Altro',
}
const empty = (): Partial<Payment> => ({ direction: 'in', category: 'stipendio', currency: 'EUR', paid: false, amount: 0 })

export default function Payments() {
  const { isAdmin } = useAuth()
  const { rows, loading, reload } = useCollection<Payment>('crm_payments', { orderBy: 'due_date', ascending: false })
  const [edit, setEdit] = useState<Partial<Payment> | null>(null)
  const [filter, setFilter] = useState<'all' | 'in' | 'out' | 'pending'>('all')

  const totals = useMemo(() => {
    const inc = rows.filter(r => r.direction === 'in')
    const out = rows.filter(r => r.direction === 'out')
    return {
      income: inc.reduce((s, r) => s + Number(r.amount), 0),
      expense: out.reduce((s, r) => s + Number(r.amount), 0),
      pending: rows.filter(r => !r.paid).reduce((s, r) => s + (r.direction === 'in' ? Number(r.amount) : -Number(r.amount)), 0),
    }
  }, [rows])

  if (loading) return <Spinner />

  const filtered = rows.filter(r =>
    filter === 'all' ? true : filter === 'pending' ? !r.paid : r.direction === filter)

  async function togglePaid(p: Payment) {
    await updateRow('crm_payments', p.id, { paid: !p.paid, paid_date: !p.paid ? new Date().toISOString().slice(0, 10) : null })
    reload()
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid g3">
        <Stat icon="↘" label="Totale entrate" value={fmtMoney(totals.income)} tone="var(--green)" />
        <Stat icon="↗" label="Totale uscite" value={fmtMoney(totals.expense)} tone="var(--red)" />
        <Stat icon="⏳" label="Saldo da regolare" value={fmtMoney(totals.pending)} tone="var(--gold)" />
      </div>

      <div className="flex between wrap gap">
        <div className="pill-tabs">
          {(['all', 'in', 'out', 'pending'] as const).map(k => (
            <button key={k} className={`pill-tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {k === 'all' ? 'Tutti' : k === 'in' ? 'Entrate' : k === 'out' ? 'Uscite' : 'Da saldare'}
            </button>
          ))}
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(empty())}>+ Nuovo movimento</button>}
      </div>

      <div className="card">
        {filtered.length === 0 ? <Empty icon="💶" title="Nessun movimento" /> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th></th><th>Descrizione</th><th>Categoria</th><th>Controparte</th><th>Scadenza</th><th className="right">Importo</th><th>Stato</th>{isAdmin && <th></th>}</tr></thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id}>
                    <td><span style={{ color: p.direction === 'in' ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>{p.direction === 'in' ? '↘' : '↗'}</span></td>
                    <td><b>{p.description || CATS[p.category]}</b></td>
                    <td className="muted">{CATS[p.category] || p.category}</td>
                    <td className="muted">{p.counterpart || '—'}</td>
                    <td className="faint">{fmtDate(p.due_date)}</td>
                    <td className="right mono"><b style={{ color: p.direction === 'in' ? 'var(--green)' : 'var(--text)' }}>{p.direction === 'out' ? '−' : ''}{fmtMoney(Number(p.amount), p.currency)}</b></td>
                    <td>
                      {isAdmin
                        ? <button onClick={() => togglePaid(p)} style={{ background: 'none' }}><Badge tone={p.paid ? 'green' : 'gold'}>{p.paid ? '✓ Saldato' : 'In attesa'}</Badge></button>
                        : <Badge tone={p.paid ? 'green' : 'gold'}>{p.paid ? 'Saldato' : 'In attesa'}</Badge>}
                    </td>
                    {isAdmin && <td className="right"><div className="flex gap" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEdit(p)}>✎</button>
                      <ConfirmButton onConfirm={async () => { await deleteRow('crm_payments', p.id); reload() }}>×</ConfirmButton>
                    </div></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit && <PaymentForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function PaymentForm({ value, onClose, onSaved }: { value: Partial<Payment>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Payment>>(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Payment, v: any) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    setBusy(true)
    const payload = {
      direction: f.direction, category: f.category, description: f.description || null,
      amount: Number(f.amount || 0), currency: f.currency || 'EUR', counterpart: f.counterpart || null,
      due_date: f.due_date || null, paid: !!f.paid, paid_date: f.paid ? (f.paid_date || new Date().toISOString().slice(0, 10)) : null,
      notes: f.notes || null,
    }
    if (f.id) await updateRow('crm_payments', f.id, payload)
    else await insertRow('crm_payments', payload)
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica movimento' : 'Nuovo movimento'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="row2">
        <Field label="Tipo"><Select value={f.direction} onChange={e => set('direction', e.target.value)}><option value="in">Entrata</option><option value="out">Uscita</option></Select></Field>
        <Field label="Categoria"><Select value={f.category} onChange={e => set('category', e.target.value)}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
      </div>
      <Field label="Descrizione"><Input value={f.description || ''} onChange={e => set('description', e.target.value)} placeholder="es. Stipendio mensile giugno" /></Field>
      <div className="row2">
        <Field label="Importo"><Input type="number" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Controparte"><Input value={f.counterpart || ''} onChange={e => set('counterpart', e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="Scadenza"><Input type="date" value={f.due_date || ''} onChange={e => set('due_date', e.target.value)} /></Field>
        <Field label="Stato"><Select value={f.paid ? '1' : '0'} onChange={e => set('paid', e.target.value === '1')}><option value="0">In attesa</option><option value="1">Saldato</option></Select></Field>
      </div>
      <Field label="Note"><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}
