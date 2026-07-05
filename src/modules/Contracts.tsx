import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtMoney, fmtDate, daysUntil } from '../lib/format'
import type { Contract } from '../lib/types'

const empty = (): Partial<Contract> => ({ title: '', counterpart: '', type: 'sportivo', currency: 'EUR', status: 'active', clauses: [] })

export default function Contracts() {
  const { isAdmin } = useAuth()
  const { rows, loading, reload } = useCollection<Contract>('crm_contracts', { orderBy: 'created_at' })
  const [edit, setEdit] = useState<Partial<Contract> | null>(null)

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex between">
        <div className="muted">{rows.length} contratti in archivio</div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(empty())}>+ Nuovo contratto</button>}
      </div>

      {rows.length === 0 ? <Empty icon={<Icon name="briefcase" size={30} strokeWidth={1.4} />} title="Nessun contratto" hint={isAdmin ? 'Aggiungi il primo contratto sportivo.' : undefined} /> : (
        <div className="grid g2">
          {rows.map(c => {
            const d = daysUntil(c.end_date)
            return (
              <div className="card" key={c.id}>
                <div className="flex between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{c.counterpart} · {typeLabel(c.type)}</div>
                  </div>
                  <Badge tone={c.status === 'active' ? 'green' : c.status === 'draft' ? 'gold' : 'red'}>{statusLabel(c.status)}</Badge>
                </div>
                <div className="grid g2" style={{ gap: 10, margin: '14px 0' }}>
                  <Info k="Periodo" v={`${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}`} />
                  <Info k="Ingaggio lordo" v={fmtMoney(c.salary_gross, c.currency)} />
                </div>
                {c.end_date && d != null && d >= 0 && (
                  <div className="flex gap" style={{ fontSize: 12 }}>
                    <span className="faint">Scadenza tra</span>
                    <Badge tone={d < 90 ? 'red' : d < 180 ? 'gold' : undefined}>{d} giorni</Badge>
                  </div>
                )}
                {Array.isArray(c.clauses) && c.clauses.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>CLAUSOLE</div>
                    {c.clauses.map((cl, i) => (
                      <div className="flex between" key={i} style={{ fontSize: 12.5, padding: '3px 0' }}>
                        <span className="muted">{cl.label}</span><b>{cl.value}</b>
                      </div>
                    ))}
                  </div>
                )}
                {c.notes && <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>{c.notes}</div>}
                {isAdmin && (
                  <div className="flex gap" style={{ marginTop: 14 }}>
                    <button className="btn btn-sm" onClick={() => setEdit(c)}>Modifica</button>
                    <ConfirmButton onConfirm={async () => { await deleteRow('crm_contracts', c.id); reload() }}>Elimina</ConfirmButton>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {edit && <ContractForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function ContractForm({ value, onClose, onSaved }: { value: Partial<Contract>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Contract>>({ ...value, clauses: value.clauses || [] })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Contract, v: any) => setF(p => ({ ...p, [k]: v }))
  const clauses = (f.clauses as { label: string; value: string }[]) || []

  async function save() {
    setBusy(true)
    const payload = {
      title: f.title, counterpart: f.counterpart || null, type: f.type, status: f.status,
      start_date: f.start_date || null, end_date: f.end_date || null,
      salary_gross: f.salary_gross ? Number(f.salary_gross) : null, currency: f.currency || 'EUR',
      clauses: clauses.filter(c => c.label), notes: f.notes || null, updated_at: new Date().toISOString(),
    }
    if (f.id) await updateRow('crm_contracts', f.id, payload)
    else await insertRow('crm_contracts', payload)
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica contratto' : 'Nuovo contratto'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <Field label="Titolo"><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="es. Contratto Olympiacos 2024–2027" /></Field>
      <div className="row2">
        <Field label="Controparte / Club"><Input value={f.counterpart || ''} onChange={e => set('counterpart', e.target.value)} /></Field>
        <Field label="Tipo">
          <Select value={f.type} onChange={e => set('type', e.target.value)}>
            <option value="sportivo">Sportivo</option><option value="mandato">Mandato / Procura</option>
            <option value="immagine">Diritti d'immagine</option><option value="altro">Altro</option>
          </Select>
        </Field>
      </div>
      <div className="row2">
        <Field label="Inizio"><Input type="date" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="Scadenza"><Input type="date" value={f.end_date || ''} onChange={e => set('end_date', e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label="Ingaggio lordo"><Input type="number" value={f.salary_gross ?? ''} onChange={e => set('salary_gross', e.target.value)} /></Field>
        <Field label="Stato">
          <Select value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Attivo</option><option value="draft">Bozza</option><option value="expired">Scaduto</option>
          </Select>
        </Field>
      </div>

      <div className="field">
        <label>Clausole</label>
        {clauses.map((cl, i) => (
          <div className="flex gap" key={i} style={{ marginBottom: 6 }}>
            <Input placeholder="Etichetta (es. Clausola rescissoria)" value={cl.label} onChange={e => { const n = [...clauses]; n[i] = { ...n[i], label: e.target.value }; set('clauses', n) }} />
            <Input placeholder="Valore" value={cl.value} onChange={e => { const n = [...clauses]; n[i] = { ...n[i], value: e.target.value }; set('clauses', n) }} />
            <button className="btn btn-ghost btn-sm" onClick={() => set('clauses', clauses.filter((_, x) => x !== i))}>×</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => set('clauses', [...clauses, { label: '', value: '' }])}>+ Aggiungi clausola</button>
      </div>

      <Field label="Note"><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

function Info({ k, v }: { k: string; v: any }) {
  return <div><div className="faint" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div></div>
}
const typeLabel = (t: string) => ({ sportivo: 'Sportivo', mandato: 'Mandato', immagine: "Diritti d'immagine", altro: 'Altro' } as any)[t] || t
const statusLabel = (s: string) => ({ active: 'Attivo', draft: 'Bozza', expired: 'Scaduto' } as any)[s] || s
