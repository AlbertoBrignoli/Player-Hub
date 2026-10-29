import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Badge, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtMoney, fmtDate, daysUntil } from '../lib/format'
import type { Contract } from '../lib/types'
import { useLang } from '../lib/i18n'
import { useItemPeople, PeopleRow, ItemPeopleModal } from '../components/ItemPeople'

const empty = (): Partial<Contract> => ({ title: '', counterpart: '', type: 'sportivo', currency: 'EUR', status: 'active', clauses: [] })

export default function Contracts() {
  const { athleteId } = useAthlete()
  const { isAdmin } = useAuth()
  const { t } = useLang()
  const { rows, loading, reload } = useCollection<Contract>('crm_contracts', { orderBy: 'created_at', match: { player_id: athleteId } })
  const [edit, setEdit] = useState<Partial<Contract> | null>(null)
  const { people, reload: reloadPeople } = useItemPeople('contract', rows.map(r => r.id))
  const [thread, setThread] = useState<Contract | null>(null)

  if (loading) return <Spinner />

  return (
    <div className="grid" style={{ gap: 16 }}>
      <div className="flex between">
        <div className="muted">{t('{n} contratti in archivio').replace('{n}', String(rows.length))}</div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setEdit(empty())}>{t('+ Nuovo contratto')}</button>}
      </div>

      {rows.length === 0 ? <Empty icon={<Icon name="briefcase" size={30} strokeWidth={1.4} />} title={t('Nessun contratto')} hint={isAdmin ? t('Aggiungi il primo contratto sportivo.') : undefined} /> : (
        <div className="grid g2">
          {rows.map(c => {
            const d = daysUntil(c.end_date)
            return (
              <div className="card" key={c.id}>
                <div className="flex between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{c.title}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{c.counterpart} · {t(typeLabel(c.type))}</div>
                  </div>
                  <Badge tone={c.status === 'active' ? 'green' : c.status === 'draft' ? 'gold' : 'red'}>{t(statusLabel(c.status))}</Badge>
                </div>
                <div className="grid g2" style={{ gap: 10, margin: '14px 0' }}>
                  <Info k={t('Periodo')} v={`${fmtDate(c.start_date)} → ${fmtDate(c.end_date)}`} />
                  <Info k={t('Ingaggio lordo')} v={fmtMoney(c.salary_gross, c.currency)} />
                </div>
                {c.end_date && d != null && d >= 0 && (
                  <div className="flex gap" style={{ fontSize: 12 }}>
                    <span className="faint">{t('Scadenza tra')}</span>
                    <Badge tone={d < 90 ? 'red' : d < 180 ? 'gold' : undefined}>{t('{n} giorni').replace('{n}', String(d))}</Badge>
                  </div>
                )}
                {Array.isArray(c.clauses) && c.clauses.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div className="faint" style={{ fontSize: 11, marginBottom: 6 }}>{t('CLAUSOLE')}</div>
                    {c.clauses.map((cl, i) => (
                      <div className="flex between" key={i} style={{ fontSize: 12.5, padding: '3px 0' }}>
                        <span className="muted">{cl.label}</span><b>{cl.value}</b>
                      </div>
                    ))}
                  </div>
                )}
                {c.notes && <div className="faint" style={{ fontSize: 12.5, marginTop: 10 }}>{c.notes}</div>}
                <PeopleRow people={people[c.id] || []} onOpen={() => setThread(c)} />
                {isAdmin && (
                  <div className="flex gap" style={{ marginTop: 14 }}>
                    <button className="btn btn-sm" onClick={() => setEdit(c)}>{t('Modifica')}</button>
                    <ConfirmButton onConfirm={async () => { await deleteRow('crm_contracts', c.id); reload() }}>{t('Elimina')}</ConfirmButton>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {thread && athleteId && (
        <ItemPeopleModal kind="contract" itemId={thread.id} playerId={athleteId} title={thread.title}
          sub={[thread.counterpart, t(typeLabel(thread.type))].filter(Boolean).join(' · ')}
          people={people[thread.id] || []} onPeople={reloadPeople} onClose={() => setThread(null)} />
      )}
      {edit && <ContractForm value={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </div>
  )
}

function ContractForm({ value, onClose, onSaved }: { value: Partial<Contract>; onClose: () => void; onSaved: () => void }) {
  const { athleteId } = useAthlete()
  const { t } = useLang()
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
    else await insertRow('crm_contracts', { ...payload, player_id: athleteId })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? t('Modifica contratto') : t('Nuovo contratto')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !f.title} onClick={save}>{busy ? t('Salvo…') : t('Salva')}</button>
      </>}>
      <Field label={t('Titolo')}><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder={t('es. Contratto Olympiacos 2024–2027')} /></Field>
      <div className="row2">
        <Field label={t('Controparte / Club')}><Input value={f.counterpart || ''} onChange={e => set('counterpart', e.target.value)} /></Field>
        <Field label={t('Tipo')}>
          <Select value={f.type} onChange={e => set('type', e.target.value)}>
            <option value="sportivo">{t('Sportivo')}</option><option value="mandato">{t('Mandato / Procura')}</option>
            <option value="immagine">{t("Diritti d'immagine")}</option><option value="altro">{t('Altro')}</option>
          </Select>
        </Field>
      </div>
      <div className="row2">
        <Field label={t('Inizio')}><Input type="date" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label={t('Scadenza')}><Input type="date" value={f.end_date || ''} onChange={e => set('end_date', e.target.value)} /></Field>
      </div>
      <div className="row2">
        <Field label={t('Ingaggio lordo')}><Input type="number" value={f.salary_gross ?? ''} onChange={e => set('salary_gross', e.target.value)} /></Field>
        <Field label={t('Stato')}>
          <Select value={f.status} onChange={e => set('status', e.target.value)}>
            <option value="active">{t('Attivo')}</option><option value="draft">{t('Bozza')}</option><option value="expired">{t('Scaduto')}</option>
          </Select>
        </Field>
      </div>

      <div className="field">
        <label>{t('Clausole')}</label>
        {clauses.map((cl, i) => (
          <div className="flex gap" key={i} style={{ marginBottom: 6 }}>
            <Input placeholder={t('Etichetta (es. Clausola rescissoria)')} value={cl.label} onChange={e => { const n = [...clauses]; n[i] = { ...n[i], label: e.target.value }; set('clauses', n) }} />
            <Input placeholder={t('Valore')} value={cl.value} onChange={e => { const n = [...clauses]; n[i] = { ...n[i], value: e.target.value }; set('clauses', n) }} />
            <button className="btn btn-ghost btn-sm" onClick={() => set('clauses', clauses.filter((_, x) => x !== i))}>×</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => set('clauses', [...clauses, { label: '', value: '' }])}>{t('+ Aggiungi clausola')}</button>
      </div>

      <Field label={t('Note')}><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

function Info({ k, v }: { k: string; v: any }) {
  return <div><div className="faint" style={{ fontSize: 11 }}>{k}</div><div style={{ fontWeight: 600, fontSize: 13 }}>{v}</div></div>
}
const typeLabel = (t: string) => ({ sportivo: 'Sportivo', mandato: 'Mandato', immagine: "Diritti d'immagine", altro: 'Altro' } as any)[t] || t
const statusLabel = (s: string) => ({ active: 'Attivo', draft: 'Bozza', expired: 'Scaduto' } as any)[s] || s
