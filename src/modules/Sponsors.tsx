import { useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useAthlete } from '../lib/athlete'
import { useLang } from '../lib/i18n'
import { goto } from '../lib/route'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton } from '../components/ui'
import Icon from '../components/Icon'
import { fmtMoney, fmtDate, daysUntil } from '../lib/format'
import type { Sponsor, DealPayment, Contract } from '../lib/types'

/* Accordi commerciali: un accordo = una scheda sola, dalla proposta all'incasso.
   Fasi, consegne, rate, commissione e contratto collegato stanno insieme;
   l'atleta vede cosa ha incassato, cosa arriva e quanto va in commissione. */

const empty = (): Partial<Sponsor> => ({ brand: '', type: 'sponsor', currency: 'EUR', status: 'negotiation', deliverables: [], payments: [] })
const STAGES = ['Proposta', 'Trattativa', 'Firmato', 'In corso', 'Chiuso']
const today = () => new Date().toISOString().slice(0, 10)

export function stageOf(d: Sponsor): number {
  if (d.status === 'expired') return 4
  if (d.status === 'proposal') return 0
  if (d.status === 'negotiation') return 1
  const started = (d.deliverables || []).some(x => x.done) || (d.payments || []).some(p => p.paid_on)
  return started ? 3 : 2
}

/** soldi dell'atleta: incassato nell'anno, in arrivo (accordi firmati), commissioni */
export function dealMoney(deals: Sponsor[], year = new Date().getFullYear()) {
  let earned = 0, incoming = 0, commission = 0
  for (const d of deals) {
    const pct = Number(d.commission_pct || 0) / 100
    for (const p of d.payments || []) {
      const a = Number(p.amount || 0)
      if (p.paid_on && p.paid_on.startsWith(String(year))) { earned += a; commission += a * pct }
      else if (!p.paid_on && d.status === 'active') incoming += a
    }
  }
  return { earned, incoming, commission }
}

/** la prossima cosa da fare: consegna o rata, la più vicina */
function nextUp(d: Sponsor): { label: string; date?: string | null; kind: 'consegna' | 'rata' } | null {
  const items = [
    ...(d.deliverables || []).filter(x => !x.done).map(x => ({ label: x.title, date: x.due_date || null, kind: 'consegna' as const })),
    ...(d.payments || []).filter(p => !p.paid_on).map(p => ({ label: `${p.label} · ${fmtMoney(p.amount, d.currency)}`, date: p.due_date || null, kind: 'rata' as const })),
  ]
  items.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'))
  return items[0] || null
}

export default function Sponsors() {
  const { athleteId } = useAthlete()
  const { isAdmin, role } = useAuth()
  const { rows, loading, reload, setRows } = useCollection<Sponsor>('crm_sponsors', { orderBy: 'created_at', match: { player_id: athleteId } })
  const { rows: contracts } = useCollection<Contract>('crm_contracts', { orderBy: 'created_at', match: { player_id: athleteId } })
  const [edit, setEdit] = useState<Partial<Sponsor> | null>(null)
  const canEdit = isAdmin || role === 'agente'

  if (loading) return <Spinner />

  async function patch(d: Sponsor, p: Partial<Sponsor>) {
    setRows(rs => rs.map(x => x.id === d.id ? { ...x, ...p } : x))
    await updateRow('crm_sponsors', d.id, { ...p, updated_at: new Date().toISOString() })
  }

  return (
    <>
      <DealsView deals={rows} contracts={contracts} canEdit={canEdit} isAthlete={role === 'player'}
        onPatch={patch} onNew={() => setEdit(empty())} onEdit={d => setEdit(d)}
        onDelete={async d => { await deleteRow('crm_sponsors', d.id); reload() }} />
      {edit && <DealForm value={edit} contracts={contracts} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload() }} />}
    </>
  )
}

// ── Vista (usata dalla pagina e dall'anteprima con dati di esempio) ─────────
export function DealsView({ deals, contracts, canEdit, isAthlete, onPatch, onNew, onEdit, onDelete }: {
  deals: Sponsor[]; contracts: Contract[]; canEdit: boolean; isAthlete: boolean
  onPatch: (d: Sponsor, p: Partial<Sponsor>) => void
  onNew: () => void; onEdit: (d: Sponsor) => void; onDelete: (d: Sponsor) => void
}) {
  const { t } = useLang()
  const [openId, setOpenId] = useState<string | null>(null)
  const money = dealMoney(deals)
  const open = deals.find(d => d.id === openId) || null
  const sorted = [...deals].sort((a, b) => stageOf(a) === 4 ? 1 : stageOf(b) === 4 ? -1 : 0)

  return (
    <div className="grid" style={{ gap: 16 }}>
      <style>{DEAL_CSS}</style>
      <div className="deal-money">
        <div><div className="faint">{t('Incassato {y}').replace('{y}', String(new Date().getFullYear()))}</div><b>{fmtMoney(money.earned)}</b></div>
        <div><div className="faint">{t('In arrivo')}</div><b>{fmtMoney(money.incoming)}</b></div>
        <div><div className="faint">{t('Commissioni')}</div><b>{fmtMoney(money.commission)}</b></div>
      </div>

      <div className="flex between">
        <div className="muted">{t('{n} accordi').replace('{n}', String(deals.length))}</div>
        {canEdit && <button className="btn btn-primary" onClick={onNew}>{t('+ Nuovo accordo')}</button>}
      </div>

      {deals.length === 0 ? <Empty icon={<Icon name="award" size={30} strokeWidth={1.4} />} title={t('Nessun accordo')} hint={canEdit ? t('Aggiungi la prima proposta o sponsorizzazione.') : t('Qui vedrai sponsor e collaborazioni, con consegne e incassi.')} /> : (
        <div className="grid g2">
          {sorted.map(d => {
            const st = stageOf(d), nx = nextUp(d)
            const dl = d.deliverables || [], done = dl.filter(x => x.done).length
            const nd = nx?.date ? daysUntil(nx.date) : null
            return (
              <button className="card deal-card" key={d.id} onClick={() => setOpenId(d.id)} style={{ opacity: st === 4 ? 0.6 : 1 }}>
                <div className="flex between" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div className="deal-brand">{d.brand}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t(typeLabel(d.type))} · {fmtMoney(d.value, d.currency)}</div>
                  </div>
                  <span className={`deal-chip${st === 3 ? ' on' : ''}`}>{t(STAGES[st])}</span>
                </div>
                <StageBar stage={st} />
                {nx && st < 4 && (
                  <div className="deal-next">
                    <Icon name={nx.kind === 'rata' ? 'briefcase' : 'check-square'} size={13} />
                    <span className="deal-next-t">{nx.label}</span>
                    {nx.date && <span className={nd != null && nd < 0 ? 'late' : nd != null && nd <= 7 ? 'soon' : 'faint'}>{nd != null && nd < 0 ? t('in ritardo') : fmtDate(nx.date)}</span>}
                  </div>
                )}
                {dl.length > 0 && <div className="faint" style={{ fontSize: 11.5, marginTop: 6 }}>{t('Consegne {a} di {b}').replace('{a}', String(done)).replace('{b}', String(dl.length))}</div>}
              </button>
            )
          })}
        </div>
      )}

      {open && <DealDetail d={open} contract={contracts.find(c => c.id === open.contract_id) || null} canEdit={canEdit} isAthlete={isAthlete}
        onClose={() => setOpenId(null)} onPatch={p => onPatch(open, p)}
        onEdit={() => { setOpenId(null); onEdit(open) }} onDelete={() => { setOpenId(null); onDelete(open) }} />}
    </div>
  )
}

function StageBar({ stage, labels }: { stage: number; labels?: boolean }) {
  const { t } = useLang()
  return (
    <div style={{ margin: '12px 0 2px' }}>
      <div className="deal-bar">{STAGES.map((_, i) => <span key={i} className={i < stage || stage === 4 ? 'done' : i === stage ? 'now' : ''} />)}</div>
      {labels && <div className="deal-bar-l">{STAGES.map((s, i) => <span key={s} className={i === stage ? 'now' : ''}>{t(s)}</span>)}</div>}
    </div>
  )
}

function DealDetail({ d, contract, canEdit, isAthlete, onClose, onPatch, onEdit, onDelete }: {
  d: Sponsor; contract: Contract | null; canEdit: boolean; isAthlete: boolean
  onClose: () => void; onPatch: (p: Partial<Sponsor>) => void; onEdit: () => void; onDelete: () => void
}) {
  const { t } = useLang()
  const st = stageOf(d)
  const dl = d.deliverables || [], pays = d.payments || []
  const pct = Number(d.commission_pct || 0)
  const total = pays.length ? pays.reduce((s, p) => s + Number(p.amount || 0), 0) : Number(d.value || 0)
  const comm = total * pct / 100
  const endIn = d.end_date ? daysUntil(d.end_date) : null

  const toggleDl = (i: number) => { const n = [...dl]; n[i] = { ...n[i], done: !n[i].done }; onPatch({ deliverables: n }) }
  const togglePay = (i: number) => { const n = [...pays]; n[i] = { ...n[i], paid_on: n[i].paid_on ? null : today() }; onPatch({ payments: n }) }

  return (
    <Modal title={d.brand} onClose={onClose} dismissable
      footer={canEdit ? <>
        <ConfirmButton onConfirm={onDelete}>{t('Elimina')}</ConfirmButton>
        <button className="btn btn-primary" onClick={onEdit}>{t('Modifica')}</button>
      </> : undefined}>
      <style>{DEAL_CSS}</style>
      <div className="muted" style={{ fontSize: 13, marginTop: -6 }}>
        {t(typeLabel(d.type))} · {fmtMoney(d.value, d.currency)}{d.start_date || d.end_date ? ` · ${fmtDate(d.start_date)} → ${fmtDate(d.end_date)}` : ''}
      </div>
      <StageBar stage={st} labels />

      {d.status === 'active' && endIn != null && endIn <= 90 && (
        <div className={`deal-alert${endIn < 0 ? ' late' : ''}`}>
          <Icon name="bell" size={14} />
          {endIn < 0 ? t('Scaduto il {d}: da rinnovare o chiudere').replace('{d}', fmtDate(d.end_date)) : t('Scade tra {n} giorni: è il momento di parlare del rinnovo').replace('{n}', String(endIn))}
        </div>
      )}

      {dl.length > 0 && (<>
        <div className="deal-sec">{t('Consegne')} <span className="faint">{dl.filter(x => x.done).length}/{dl.length}</span></div>
        {dl.map((x, i) => {
          const dd = x.due_date ? daysUntil(x.due_date) : null
          return (
            <div className="deal-row" key={i}>
              <button className={`deal-tick${x.done ? ' on' : ''}`} disabled={!canEdit} aria-label={x.done ? t('Segna da fare') : t('Segna fatto')} onClick={() => toggleDl(i)}>{x.done && <Icon name="check" size={12} />}</button>
              <span style={{ flex: 1, textDecoration: x.done ? 'line-through' : 'none', color: x.done ? 'var(--text-faint)' : undefined }}>{x.title}</span>
              {x.done ? <span className="faint">{t('fatto')}</span> : x.due_date && <span className={dd != null && dd < 0 ? 'late' : dd != null && dd <= 7 ? 'soon' : 'faint'}>{dd != null && dd < 0 ? t('in ritardo') : t('entro {d}').replace('{d}', fmtDate(x.due_date))}</span>}
            </div>
          )
        })}
      </>)}

      <div className="deal-sec">{t('Incassi')}</div>
      {pays.length === 0 && <div className="faint" style={{ fontSize: 12.5, padding: '4px 0 8px' }}>{canEdit ? t('Aggiungi le rate da Modifica: così l\'atleta vede cosa arriva e quando.') : t('Le rate non sono ancora state inserite.')}</div>}
      {pays.map((p, i) => {
        const pd = p.due_date ? daysUntil(p.due_date) : null
        return (
          <div className="deal-row" key={i}>
            <span style={{ flex: 1 }}>{p.label} · <b>{fmtMoney(p.amount, d.currency)}</b></span>
            {p.paid_on ? <span className="deal-paid">{t('incassata il {d}').replace('{d}', fmtDate(p.paid_on))}</span>
              : <span className={pd != null && pd < 0 ? 'late' : pd != null && pd <= 7 ? 'soon' : 'faint'}>{pd != null && pd < 0 ? t('non arrivata') : p.due_date ? fmtDate(p.due_date) : t('da fissare')}</span>}
            {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => togglePay(i)}>{p.paid_on ? t('Annulla') : t('Incassata')}</button>}
          </div>
        )
      })}
      {pct > 0 && (<>
        <div className="deal-row"><span style={{ flex: 1 }}>{t('Commissione {p}%').replace('{p}', String(pct))}</span><span>{fmtMoney(comm, d.currency)}</span></div>
        <div className="deal-row" style={{ fontWeight: 700 }}><span style={{ flex: 1 }}>{isAthlete ? t('Netto per te') : t('Netto atleta')}</span><span>{fmtMoney(total - comm, d.currency)}</span></div>
      </>)}

      {(contract || d.contact || d.notes) && <div className="deal-sec">{t('Dettagli')}</div>}
      {contract && (
        <button className="deal-row deal-link" onClick={() => { onClose(); goto('contracts') }}>
          <Icon name="file" size={14} /><span style={{ flex: 1 }}>{t('Contratto')}: {contract.title}</span><Icon name="chevron-right" size={14} />
        </button>
      )}
      {d.contact && <div className="deal-row"><Icon name="user" size={14} /><span style={{ flex: 1 }}>{d.contact}</span></div>}
      {d.notes && <div className="faint" style={{ fontSize: 12.5, marginTop: 8, whiteSpace: 'pre-wrap' }}>{d.notes}</div>}
    </Modal>
  )
}

// ── Modulo: dati, consegne, rate, commissione, contratto ─────────────────────
function DealForm({ value, contracts, onClose, onSaved }: { value: Partial<Sponsor>; contracts: Contract[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useLang()
  const { athleteId } = useAthlete()
  const [f, setF] = useState<Partial<Sponsor>>({ ...value, deliverables: value.deliverables || [], payments: value.payments || [] })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof Sponsor, v: any) => setF(p => ({ ...p, [k]: v }))
  const dl = (f.deliverables as Sponsor['deliverables']) || []
  const pays = (f.payments as DealPayment[]) || []
  const setPay = (i: number, p: Partial<DealPayment>) => { const n = [...pays]; n[i] = { ...n[i], ...p }; set('payments', n) }

  // divide il valore in rate uguali (es. 2 rate da 5.000)
  function split(n: number) {
    const v = Number(f.value || 0); if (!v) return
    const each = Math.round((v / n) * 100) / 100
    set('payments', Array.from({ length: n }, (_, i) => ({ label: n === 1 ? t('Saldo') : t('Rata {n}').replace('{n}', String(i + 1)), amount: each, due_date: null, paid_on: null })))
  }

  async function save() {
    setBusy(true)
    const payload = {
      brand: f.brand, type: f.type, value: f.value ? Number(f.value) : null, currency: f.currency || 'EUR',
      start_date: f.start_date || null, end_date: f.end_date || null, status: f.status,
      deliverables: dl.filter(d => d.title),
      payments: pays.filter(p => p.label || p.amount).map(p => ({ ...p, amount: p.amount ? Number(p.amount) : null, due_date: p.due_date || null, paid_on: p.paid_on || null })),
      commission_pct: f.commission_pct === '' as any || f.commission_pct == null ? null : Number(f.commission_pct),
      contract_id: f.contract_id || null,
      contact: f.contact || null, notes: f.notes || null, updated_at: new Date().toISOString(),
    }
    if (f.id) await updateRow('crm_sponsors', f.id, payload)
    else await insertRow('crm_sponsors', { ...payload, player_id: athleteId })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? t('Modifica accordo') : t('Nuovo accordo')} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>{t('Annulla')}</button>
        <button className="btn btn-primary" disabled={busy || !f.brand} onClick={save}>{busy ? t('Salvo…') : t('Salva')}</button>
      </>}>
      <div className="row2">
        <Field label={t('Brand')}><Input value={f.brand || ''} onChange={e => set('brand', e.target.value)} /></Field>
        <Field label={t('Tipo')}><Select value={f.type} onChange={e => set('type', e.target.value)}>
          <option value="sponsor">{t('Sponsor')}</option><option value="endorsement">{t('Endorsement')}</option><option value="collaborazione">{t('Collaborazione')}</option>
        </Select></Field>
      </div>
      <div className="row2">
        <Field label={t('Valore totale')}><Input type="number" value={f.value ?? ''} onChange={e => set('value', e.target.value)} /></Field>
        <Field label={t('Fase')}><Select value={f.status} onChange={e => set('status', e.target.value)}>
          <option value="proposal">{t('Proposta')}</option><option value="negotiation">{t('Trattativa')}</option><option value="active">{t('Firmato')}</option><option value="expired">{t('Chiuso')}</option>
        </Select></Field>
      </div>
      <div className="row2">
        <Field label={t('Inizio')}><Input type="date" value={f.start_date || ''} onChange={e => set('start_date', e.target.value)} /></Field>
        <Field label={t('Fine')}><Input type="date" value={f.end_date || ''} onChange={e => set('end_date', e.target.value)} /></Field>
      </div>

      <div className="field">
        <label>{t('Consegne')}</label>
        {dl.map((d, i) => (
          <div className="flex gap" key={i} style={{ marginBottom: 6 }}>
            <Input placeholder={t('es. 2 post Instagram')} value={d.title} onChange={e => { const n = [...dl]; n[i] = { ...n[i], title: e.target.value }; set('deliverables', n) }} />
            <Input type="date" style={{ maxWidth: 150 }} value={d.due_date || ''} onChange={e => { const n = [...dl]; n[i] = { ...n[i], due_date: e.target.value }; set('deliverables', n) }} />
            <button className="btn btn-ghost btn-sm" aria-label={t('Rimuovi')} onClick={() => set('deliverables', dl.filter((_, x) => x !== i))}>×</button>
          </div>
        ))}
        <button className="btn btn-sm" onClick={() => set('deliverables', [...dl, { title: '', done: false }])}>{t('+ Aggiungi consegna')}</button>
      </div>

      <div className="field">
        <label>{t('Rate di pagamento')}</label>
        {pays.map((p, i) => (
          <div className="flex gap" key={i} style={{ marginBottom: 6, alignItems: 'center' }}>
            <Input style={{ maxWidth: 110 }} value={p.label} onChange={e => setPay(i, { label: e.target.value })} />
            <Input type="number" placeholder="€" style={{ maxWidth: 110 }} value={p.amount ?? ''} onChange={e => setPay(i, { amount: e.target.value as any })} />
            <Input type="date" style={{ maxWidth: 150 }} value={p.due_date || ''} onChange={e => setPay(i, { due_date: e.target.value })} />
            <label className="flex gap" style={{ fontSize: 12, alignItems: 'center', whiteSpace: 'nowrap', margin: 0 }}>
              <input type="checkbox" checked={!!p.paid_on} onChange={e => setPay(i, { paid_on: e.target.checked ? today() : null })} /> {t('incassata')}
            </label>
            <button className="btn btn-ghost btn-sm" aria-label={t('Rimuovi')} onClick={() => set('payments', pays.filter((_, x) => x !== i))}>×</button>
          </div>
        ))}
        <div className="flex gap wrap">
          <button className="btn btn-sm" onClick={() => set('payments', [...pays, { label: t('Rata {n}').replace('{n}', String(pays.length + 1)), amount: null, due_date: null, paid_on: null }])}>{t('+ Aggiungi rata')}</button>
          {!pays.length && Number(f.value) > 0 && <>
            <button className="btn btn-ghost btn-sm" onClick={() => split(1)}>{t('Unica soluzione')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => split(2)}>{t('2 rate')}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => split(4)}>{t('4 rate')}</button>
          </>}
        </div>
      </div>

      <div className="row2">
        <Field label={t('Commissione %')}><Input type="number" placeholder="10" value={f.commission_pct ?? ''} onChange={e => set('commission_pct', e.target.value)} /></Field>
        <Field label={t('Contratto collegato')}><Select value={f.contract_id || ''} onChange={e => set('contract_id', e.target.value)}>
          <option value="">{t('Nessuno')}</option>
          {contracts.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select></Field>
      </div>
      <Field label={t('Referente / Contatto')}><Input value={f.contact || ''} onChange={e => set('contact', e.target.value)} /></Field>
      <Field label={t('Note')}><Textarea value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

const typeLabel = (t: string) => ({ sponsor: 'Sponsor', endorsement: 'Endorsement', collaborazione: 'Collaborazione' } as any)[t] || t

const DEAL_CSS = `
.deal-money{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.deal-money>div{background:var(--surface);border-radius:var(--radius);padding:12px 14px}
.deal-money .faint{font-size:11.5px}
.deal-money b{font-family:var(--font-display);font-size:19px;font-weight:800;display:block;margin-top:2px}
.deal-card{text-align:left;cursor:pointer;width:100%;font:inherit;color:inherit}
.deal-card:hover{border-color:var(--ink)}
.deal-brand{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.deal-chip{font-size:11px;font-weight:700;padding:3px 8px;border-radius:99px;background:var(--surface);color:var(--text-dim);white-space:nowrap}
.deal-chip.on{background:var(--yellow);color:var(--ink)}
.deal-bar{display:flex;gap:3px}
.deal-bar span{flex:1;height:4px;border-radius:2px;background:var(--border)}
.deal-bar span.done{background:var(--ink)}
.deal-bar span.now{background:var(--yellow)}
.deal-bar-l{display:flex;margin-top:5px}
.deal-bar-l span{flex:1;font-size:10.5px;color:var(--text-faint);text-align:center}
.deal-bar-l span.now{color:var(--ink);font-weight:700}
.deal-next{display:flex;align-items:center;gap:7px;font-size:12.5px;margin-top:10px}
.deal-next-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.deal-next .faint,.deal-row .faint{font-size:11.5px}
.soon{font-size:11.5px;font-weight:700;background:var(--yellow);color:var(--ink);padding:2px 7px;border-radius:6px;white-space:nowrap}
.late{font-size:11.5px;font-weight:700;color:var(--red);white-space:nowrap}
.deal-sec{font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-faint);margin:18px 0 4px;display:flex;justify-content:space-between}
.deal-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--border);font-size:13.5px;width:100%;background:none;border-left:0;border-right:0;border-bottom:0;font-family:inherit;color:inherit;text-align:left}
.deal-link{cursor:pointer}
.deal-tick{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--border-strong,#ccc);background:none;display:flex;align-items:center;justify-content:center;padding:0;flex:none;cursor:pointer}
.deal-tick:disabled{cursor:default}
.deal-tick.on{background:var(--ink);border-color:var(--ink);color:#fff}
.deal-paid{font-size:11.5px;color:var(--green);white-space:nowrap}
.deal-alert{display:flex;align-items:center;gap:8px;margin-top:14px;padding:10px 12px;border-radius:var(--radius);background:var(--yellow-soft);font-size:12.5px;color:var(--ink)}
.deal-alert.late{background:#FDECEC;color:var(--red)}
@media (max-width:600px){.deal-money b{font-size:16px}.deal-money>div{padding:10px}}
`
