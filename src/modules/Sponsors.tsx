import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, Stat, ConfirmButton } from '../components/ui'
import { fmtMoney, fmtDate } from '../lib/format'
import type { Sponsor } from '../lib/types'

const empty = (): Partial<Sponsor> => ({ brand: '', type: 'sponsor', currency: 'EUR', status: 'active', deliverables: [] })

export default function Sponsors() {
  const { isAdmin } = useAuth()
  const { rows, loading, reload } = useCollection<Sponsor>('crm_sponsors', { orderBy: 'created_at' })
  const [edit, setEdit] = useState<Partial<Sponsor> | null>(null)

  if (loading) return <Spinner />
  const active = rows.filter(r => r.status === 'active')
  const totalValue = active.reduce((s, r) => s + Number(r.value || 0), 0)

  async function toggleDeliverable(sp: Sponsor, i: number) {
    const dl = [...(sp.deliverables || [])]
    dl[i] = { ...dl[i], done: !dl[i].done }
    await updateRow('crm_sponsors', sp.id, { deliverables: dl })
    reload()
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="grid g3">
        <Stat icon="🤝" label="Sponsor attivi" value={active.length} />
        <Stat icon="💰" label="Valore complessivo" value={fmtMoney(totalValue)} tone="var(--accent)" />
        <Stat icon="📌" label="In trattativa" value={rows.filter(r => r.status === 'negotiation').length} tone="var(--gold)" />
      </div>

      <div className="flex between">
        <div className="muted">{rows.length} accordi commerciali</div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(empty())}>+ Nuovo sponsor</button>}
      </div>

      {rows.length === 0 ? <Empty icon="🤝" title="Nessuno sponsor" hint={isAdmin ? 'Aggiungi il primo accordo commerciale.' : undefined} /> : (
        <div className="grid g2">
          {rows.map(s => {
            const dl = s.deliverables || []
            const done = dl.filter(d => d.done).length
            return (
              <div className="card" key={s.id}>
                <div className="flex between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{s.brand}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{typeLabel(s.type)}{s.contact ? ` · ${s.contact}` : ''}</div>
                  </div>
                  <Badge tone={s.status === 'active' ? 'green' : s.status === 'negotiation' ? 'gold' : 'red'}>{statusLabel(s.status)}</Badge>
                </div>
                <div className="flex between" style={{ margin: '12px 0' }}>
                  <div><div className="faint" style={{ fontSize: 11 }}>Valore</div><b style={{ fontSize: 16 }}>{fmtMoney(s.value, s.currency)}</b></div>
                  <div className="right"><div className="faint" style={{ fontSize: 11 }}>Periodo</div><div style={{ fontSize: 12.5 }}>{fmtDate(s.start_date)} → {fmtDate(s.end_date)}</div></div>
                </div>
                {dl.length > 0 && (
                  <div>
                    <div className="flex between" style={{ marginBottom: 6 }}>
                      <div className="faint" style={{ fontSize: 11 }}>DELIVERABLE</div>
                      <div className="faint" style={{ fontSize: 11 }}>{done}/{dl.length}</div>
                    </div>
                    <div className="bar" style={{ marginBottom: 8 }}><span style={{ width: `${dl.length ? (done / dl.length) * 100 : 0}%` }} /></div>
                    {dl.map((d, i) => (
                      <div className="flex gap" key={i} style={{ fontSize: 12.5, padding: '3px 0', cursor: isAdmin ? 'pointer' : 'default' }} onClick={() => isAdmin && toggleDeliverable(s, i)}>
                        <span style={{ color: d.done ? 'var(--green)' : 'var(--text-faint)' }}>{d.done ? '☑' : '☐'}</span>
                        <span style={{ textDecoration: d.done ? 'line-through' : 'none', color: d.done ? 'var(--text-faint)' : 'var(--text)' }}>{d.title}</span>
                        {d.due_date && <span className="faint" style={{ marginLeft: 'auto', fontSize: 11 }}>{fmtDate(d.due_date)}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {s.notes && <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>{s.notes}</div>}
                {isAdmin && (
                  <div className="flex gap" style={{ marginTop: 14 }}>
                    <button className="btn btn-sm" onClick={() => setEdit(s)}>Modifica</button>
                    <ConfirmButton onConfirm={async () => { await deleteRow('crm_sponsors', s.id); reload() }}>Elimina</ConfirmButton>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {edit && <SponsorForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function SponsorForm({ value, onClose, onSaved }: { value: Partial<Sponsor>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<Sponsor>>({ ...value, deliverables: value.deliverables || [] })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Sponsor, v: any) => setF(p => ({ ...p, [k]: v }))
  const dl = (f.deliverables as { title: string; due_date?: string; done?: boolean }[]) || []

  async function save() {
    setBusy(true)
    const payload = {
      brand: f.brand, type: f.type, value: f.value ? Number(f.value) : null, currency: f.currency || 'EUR',
      start_date: f.start_date || null, end_date: f.end_date || null, status: f.status,
      deliverables: dl.filter(d => d.title), contact: f.contact || null, notes: f.notes || null,
    }
    if (f.id) await updateRow('crm_sponsors', f.id, payload)
    else await insertRow('crm_sponsors', payload)
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica sponsor' : 'Nuovo sponsor'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.brand} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="row2">
        <Field label="Brand"><Input value={f.brand || ''} onChange={e => set('brand', e.target.value)} /></Field>
        <Field label="Tipo"><Select value={f.type} onChange={e => set('type', e.target.value)}>
          <option value="sponsor">Sponsor</option><option value="endorsement">Endorsement</option><option value="collaborazione">Collaborazione</option>
        </Select></Field>
      </div>
      <div className="row2">
        <Field label="Valore"><Input type="number" value={f.value ?? ''} onChange={e => set('value', e.target.value)} /></Field>
        <Field label="Stato"><Select value={f.status} onChange={e => set('status', e.target.value)}>
          <option value="active">Attivo</option><option value="negotiation">In trattativa</option><option value="expired">Concluso</option>
        </Select></Field>
      </div>
      <div className="row2">
        <Field label="Inizio"><Input type="date" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label="Fine"><Input type="date" value={f.end_date || ''} onChange={e => set('end_date', e.target.value)} /></Field>
      </div>
      <Field label="Referente / Contatto"><Input value={f.contact || ''} onChange={e => set('contact', e.target.value)} /></Field>

      <div className="field">
        <label>Deliverable</label>
        {dl.map((d, i) => (
          <div className="flex gap" key={i} style={{ marginBottom: 6 }}>
            <Input placeholder="es. 2 post Instagram" value={d.title} onChange={e => { const n = [...dl]; n[i] = { ...n[i], title: e.target.value }; set('deliverables', n) }} />
            <Input type="date" style={{ maxWidth: 150 }} value={d.due_date || ''} onChange={e => { const n = [...dl]; n[i] = { ...n[i], due_date: e.target.value }; set('deliverables', n) }} />
            <button className="btn btn-ghost btn-sm" onClick={() => set('deliverables', dl.filter((_, x) => x !== i))}>×</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => set('deliverables', [...dl, { title: '', done: false }])}>+ Aggiungi deliverable</button>
      </div>

      <Field label="Note"><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

const typeLabel = (t: string) => ({ sponsor: 'Sponsor', endorsement: 'Endorsement', collaborazione: 'Collaborazione' } as any)[t] || t
const statusLabel = (s: string) => ({ active: 'Attivo', negotiation: 'Trattativa', expired: 'Concluso' } as any)[s] || s
