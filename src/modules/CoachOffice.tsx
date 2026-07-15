import { useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { useCollection, insertRow, updateRow, deleteRow } from '../lib/useData'
import { Modal, Field, Input, Textarea, Select, Empty, Spinner, ConfirmButton, Badge } from '../components/ui'
import Icon from '../components/Icon'
import { fmtMoney, fmtDate } from '../lib/format'
import type { CoachClient, CoachSession, CoachLedger } from '../lib/types'

// Ufficio del preparatore: agenda personale, clienti e cassa.
// Sezione SEPARATA dal lavoro AUVI: qui non si toccano schede né atleti gestiti.
// I dati sono privati del coach (RLS: trainer_id = auth.uid()).
const ACCENT = '#C8FF2E'
const IN = '#3fb984'
const OUT = '#e5484d'

const kicker: React.CSSProperties = { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', fontWeight: 800 }
const today = () => new Date().toISOString().slice(0, 10)
const monthKey = (d: string) => d.slice(0, 7)

type Tab = 'agenda' | 'clienti' | 'cassa'

export default function CoachOffice() {
  const { session } = useAuth()
  const uid = session?.user.id
  const [tab, setTab] = useState<Tab>('agenda')

  const { rows: clients, loading: lc, reload: reloadC } =
    useCollection<CoachClient>('coach_clients', { orderBy: 'name', ascending: true })
  const { rows: sessions, loading: ls, reload: reloadS } =
    useCollection<CoachSession>('coach_sessions', { orderBy: 'session_date', ascending: false })
  const { rows: ledger, loading: ll, reload: reloadL } =
    useCollection<CoachLedger>('coach_ledger', { orderBy: 'entry_date', ascending: false })

  const [editS, setEditS] = useState<Partial<CoachSession> | null>(null)
  const [editC, setEditC] = useState<Partial<CoachClient> | null>(null)
  const [editL, setEditL] = useState<Partial<CoachLedger> | null>(null)

  const clientName = (id?: string | null) => clients.find(c => c.id === id)?.name || '—'

  // Cassa del mese in corso: entrate, uscite, saldo.
  const m = monthKey(today())
  const totals = useMemo(() => {
    const mine = ledger.filter(l => monthKey(l.entry_date) === m)
    const inc = mine.filter(l => l.kind === 'entrata').reduce((s, l) => s + Number(l.amount || 0), 0)
    const out = mine.filter(l => l.kind === 'uscita').reduce((s, l) => s + Number(l.amount || 0), 0)
    return { inc, out, saldo: inc - out }
  }, [ledger, m])

  // Sedute fatte ma non incassate: il promemoria che conta davvero.
  const daIncassare = sessions.filter(s => s.status === 'fatta' && !s.paid && s.price)
  const daIncassareTot = daIncassare.reduce((s, x) => s + Number(x.price || 0), 0)

  const upcoming = sessions.filter(s => s.session_date >= today() && s.status === 'programmata')
    .sort((a, b) => a.session_date.localeCompare(b.session_date))
  const past = sessions.filter(s => s.session_date < today() || s.status !== 'programmata')

  if (lc || ls || ll) return <Spinner />

  // Segna una seduta come fatta e, se ha un prezzo, registra l'entrata in cassa.
  async function markDone(s: CoachSession, incassa: boolean) {
    await updateRow('coach_sessions', s.id, { status: 'fatta', paid: incassa })
    if (incassa && s.price) {
      await insertRow('coach_ledger', {
        trainer_id: uid, kind: 'entrata', amount: s.price, category: 'Seduta',
        description: `${s.title || 'Seduta'} · ${clientName(s.client_id)}`,
        entry_date: s.session_date, session_id: s.id,
      })
      reloadL()
    }
    reloadS()
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {/* --- Cassa del mese in evidenza --- */}
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 18, background: 'var(--bg-2)', border: '1px solid var(--border)', padding: '22px' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: ACCENT }} />
        <div style={{ ...kicker, color: ACCENT }}>Il mio ufficio · {new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</div>
        <div className="flex gap" style={{ gap: 26, marginTop: 14, flexWrap: 'wrap' }}>
          <Metric label="Entrate" value={fmtMoney(totals.inc)} tone={IN} />
          <Metric label="Uscite" value={fmtMoney(totals.out)} tone={OUT} />
          <Metric label="Saldo" value={fmtMoney(totals.saldo)} tone={totals.saldo >= 0 ? IN : OUT} />
          <Metric label="Da incassare" value={fmtMoney(daIncassareTot)} tone={daIncassareTot ? '#c9922b' : undefined} />
          <Metric label="Clienti" value={String(clients.filter(c => !c.archived).length)} />
        </div>
        <div className="faint" style={{ fontSize: 11.5, marginTop: 14 }}>
          Sezione privata: questi dati non sono visibili ad AUVI né agli atleti.
        </div>
      </div>

      <div className="pill-tabs" style={{ alignSelf: 'start' }}>
        {([['agenda', 'Agenda', 'clock'], ['clienti', 'Clienti', 'users'], ['cassa', 'Entrate / Uscite', 'briefcase']] as const).map(([k, l, i]) => (
          <button key={k} className={`pill-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k as Tab)}
            style={tab === k ? { background: ACCENT, color: '#111', borderColor: ACCENT } : undefined}>
            <Icon name={i} size={13} /> {l}
          </button>
        ))}
      </div>

      {/* ---------------- AGENDA ---------------- */}
      {tab === 'agenda' && (
        <div className="grid" style={{ gap: 14 }}>
          <div className="flex between" style={{ alignItems: 'center' }}>
            <div style={{ ...kicker, color: 'var(--text-dim)' }}>Prossime sedute</div>
            <button className="btn btn-sm" style={{ background: ACCENT, color: '#111', fontWeight: 800, border: 'none' }}
              onClick={() => setEditS({ session_date: today(), status: 'programmata' })}>
              <Icon name="plus" size={13} /> Nuova seduta
            </button>
          </div>

          {upcoming.length === 0 ? (
            <div className="card"><Empty icon={<Icon name="clock" size={28} strokeWidth={1.4} />} title="Nessuna seduta in programma" hint="Aggiungi la prossima seduta con un cliente." /></div>
          ) : upcoming.map(s => (
            <div key={s.id} className="card" style={{ padding: 14 }}>
              <div className="flex between" style={{ alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{s.title || 'Seduta'}</div>
                  <div className="faint" style={{ fontSize: 12.5, marginTop: 3 }}>
                    {clientName(s.client_id)} · {fmtDate(s.session_date)}{s.start_time ? ` · ${s.start_time}` : ''}
                    {s.duration_min ? ` · ${s.duration_min}'` : ''}{s.location ? ` · ${s.location}` : ''}
                  </div>
                  {s.price ? <div style={{ ...kicker, fontSize: 11, color: ACCENT, marginTop: 5 }}>{fmtMoney(s.price)}</div> : null}
                </div>
                <div className="flex gap" style={{ flexWrap: 'wrap' }}>
                  <button className="btn btn-sm" onClick={() => markDone(s, true)}>Fatta e incassata</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => markDone(s, false)}>Fatta</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditS(s)}>Modifica</button>
                </div>
              </div>
            </div>
          ))}

          {daIncassare.length > 0 && (
            <div className="card" style={{ borderColor: '#c9922b55' }}>
              <div style={{ ...kicker, color: '#c9922b', marginBottom: 10 }}>Da incassare · {fmtMoney(daIncassareTot)}</div>
              <div className="grid" style={{ gap: 8 }}>
                {daIncassare.map(s => (
                  <div key={s.id} className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                    <div className="faint" style={{ fontSize: 13 }}>
                      {clientName(s.client_id)} · {fmtDate(s.session_date)} · <b style={{ color: 'var(--text)' }}>{fmtMoney(s.price)}</b>
                    </div>
                    <button className="btn btn-sm" onClick={() => markDone(s, true)}>Incassa</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {past.length > 0 && (
            <>
              <div style={{ ...kicker, color: 'var(--text-dim)', marginTop: 6 }}>Storico</div>
              {past.slice(0, 12).map(s => (
                <div key={s.id} className="card" style={{ padding: 12 }}>
                  <div className="flex between" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{s.title || 'Seduta'} · <span className="faint">{clientName(s.client_id)}</span></div>
                      <div className="faint" style={{ fontSize: 12 }}>{fmtDate(s.session_date)}{s.price ? ` · ${fmtMoney(s.price)}` : ''}</div>
                    </div>
                    <div className="flex gap" style={{ alignItems: 'center' }}>
                      {s.status === 'fatta' && <Badge tone={s.paid ? 'green' : 'gold'}>{s.paid ? 'Incassata' : 'Da incassare'}</Badge>}
                      {s.status === 'annullata' && <Badge tone="red">Annullata</Badge>}
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditS(s)}>Modifica</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ---------------- CLIENTI ---------------- */}
      {tab === 'clienti' && (
        <div className="grid" style={{ gap: 12 }}>
          <div className="flex between" style={{ alignItems: 'center' }}>
            <div style={{ ...kicker, color: 'var(--text-dim)' }}>I miei clienti</div>
            <button className="btn btn-sm" style={{ background: ACCENT, color: '#111', fontWeight: 800, border: 'none' }} onClick={() => setEditC({})}>
              <Icon name="plus" size={13} /> Nuovo cliente
            </button>
          </div>
          {clients.length === 0 ? (
            <div className="card"><Empty icon={<Icon name="users" size={28} strokeWidth={1.4} />} title="Nessun cliente" hint="Aggiungi i tuoi clienti privati." /></div>
          ) : (
            <div className="grid g3" style={{ gap: 12 }}>
              {clients.map(c => {
                const n = sessions.filter(s => s.client_id === c.id).length
                return (
                  <div key={c.id} className="card" style={{ padding: 0, overflow: 'hidden', opacity: c.archived ? .55 : 1 }}>
                    <div style={{ height: 3, background: ACCENT }} />
                    <div style={{ padding: 15 }}>
                      <div style={{ fontSize: 15.5, fontWeight: 800 }}>{c.name}</div>
                      <div className="faint" style={{ fontSize: 12, marginTop: 3 }}>
                        {c.contact || 'Nessun contatto'} · {n} sedut{n === 1 ? 'a' : 'e'}
                      </div>
                      {c.rate ? <div style={{ ...kicker, fontSize: 10.5, color: ACCENT, marginTop: 5 }}>{fmtMoney(c.rate)} / seduta</div> : null}
                      <div className="flex gap" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm" onClick={() => setEditS({ session_date: today(), status: 'programmata', client_id: c.id, price: c.rate })}>
                          <Icon name="plus" size={12} /> Seduta
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditC(c)}>Modifica</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ---------------- CASSA ---------------- */}
      {tab === 'cassa' && (
        <div className="grid" style={{ gap: 12 }}>
          <div className="flex between" style={{ alignItems: 'center' }}>
            <div style={{ ...kicker, color: 'var(--text-dim)' }}>Movimenti</div>
            <div className="flex gap">
              <button className="btn btn-sm" style={{ background: IN, color: '#fff', fontWeight: 800, border: 'none' }}
                onClick={() => setEditL({ kind: 'entrata', entry_date: today() })}>+ Entrata</button>
              <button className="btn btn-sm" style={{ background: OUT, color: '#fff', fontWeight: 800, border: 'none' }}
                onClick={() => setEditL({ kind: 'uscita', entry_date: today() })}>+ Uscita</button>
            </div>
          </div>
          {ledger.length === 0 ? (
            <div className="card"><Empty icon={<Icon name="briefcase" size={28} strokeWidth={1.4} />} title="Nessun movimento" hint="Registra entrate e uscite del tuo lavoro." /></div>
          ) : ledger.map(l => {
            const isIn = l.kind === 'entrata'
            return (
              <div key={l.id} className="card" style={{ padding: '11px 14px' }}>
                <div className="flex between" style={{ alignItems: 'center', gap: 10 }}>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{ width: 3, height: 30, borderRadius: 2, background: isIn ? IN : OUT }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {l.description || l.category || (isIn ? 'Entrata' : 'Uscita')}
                      </div>
                      <div className="faint" style={{ fontSize: 11.5 }}>{fmtDate(l.entry_date)}{l.category ? ` · ${l.category}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex gap" style={{ alignItems: 'center', gap: 10 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: isIn ? IN : OUT, whiteSpace: 'nowrap' }}>
                      {isIn ? '+' : '−'} {fmtMoney(l.amount)}
                    </div>
                    <ConfirmButton onConfirm={async () => { await deleteRow('coach_ledger', l.id); reloadL() }}>Elimina</ConfirmButton>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editS && <SessionForm value={editS} clients={clients} uid={uid} onClose={() => setEditS(null)} onSaved={() => { setEditS(null); reloadS() }} />}
      {editC && <ClientForm value={editC} uid={uid} onClose={() => setEditC(null)} onSaved={() => { setEditC(null); reloadC() }} />}
      {editL && <LedgerForm value={editL} uid={uid} onClose={() => setEditL(null)} onSaved={() => { setEditL(null); reloadL() }} />}
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div style={{ ...kicker, fontSize: 10, color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 21, fontWeight: 900, marginTop: 2, borderBottom: `2px solid ${tone || ACCENT}`, display: 'inline-block', paddingBottom: 2 }}>{value}</div>
    </div>
  )
}

function SessionForm({ value, clients, uid, onClose, onSaved }: { value: Partial<CoachSession>; clients: CoachClient[]; uid?: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<CoachSession>>(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof CoachSession, v: any) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    if (!f.session_date) return
    setBusy(true)
    const payload = {
      title: f.title || null, client_id: f.client_id || null, session_date: f.session_date,
      start_time: f.start_time || null, duration_min: f.duration_min ? Number(f.duration_min) : null,
      location: f.location || null, status: f.status || 'programmata',
      price: f.price ? Number(f.price) : null, paid: !!f.paid, notes: f.notes || null,
    }
    if (f.id) await updateRow('coach_sessions', f.id, payload)
    else await insertRow('coach_sessions', { ...payload, trainer_id: uid })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica seduta' : 'Nuova seduta'} onClose={onClose}
      footer={<>
        {f.id && <ConfirmButton onConfirm={async () => { await deleteRow('coach_sessions', f.id!); onSaved() }}>Elimina</ConfirmButton>}
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.session_date} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <Field label="Titolo"><Input value={f.title || ''} onChange={e => set('title', e.target.value)} placeholder="Es. Forza · sala pesi" /></Field>
      <Field label="Cliente">
        <Select value={f.client_id || ''} onChange={e => set('client_id', e.target.value)}>
          <option value="">— nessuno —</option>
          {clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Data"><Input type="date" value={f.session_date || ''} onChange={e => set('session_date', e.target.value)} /></Field>
        <Field label="Ora"><Input type="time" value={f.start_time || ''} onChange={e => set('start_time', e.target.value)} /></Field>
        <Field label="Durata (min)"><Input type="number" value={f.duration_min ?? ''} onChange={e => set('duration_min', e.target.value)} /></Field>
        <Field label="Compenso (€)"><Input type="number" value={f.price ?? ''} onChange={e => set('price', e.target.value)} /></Field>
      </div>
      <Field label="Luogo"><Input value={f.location || ''} onChange={e => set('location', e.target.value)} placeholder="Palestra, online…" /></Field>
      <Field label="Stato">
        <Select value={f.status || 'programmata'} onChange={e => set('status', e.target.value)}>
          <option value="programmata">Programmata</option>
          <option value="fatta">Fatta</option>
          <option value="annullata">Annullata</option>
        </Select>
      </Field>
      <Field label="Note"><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
    </Modal>
  )
}

function ClientForm({ value, uid, onClose, onSaved }: { value: Partial<CoachClient>; uid?: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<CoachClient>>(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof CoachClient, v: any) => setF(p => ({ ...p, [k]: v }))

  async function save() {
    if (!f.name) return
    setBusy(true)
    const payload = {
      name: f.name, contact: f.contact || null, rate: f.rate ? Number(f.rate) : null,
      notes: f.notes || null, archived: !!f.archived,
    }
    if (f.id) await updateRow('coach_clients', f.id, payload)
    else await insertRow('coach_clients', { ...payload, trainer_id: uid })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={f.id ? 'Modifica cliente' : 'Nuovo cliente'} onClose={onClose}
      footer={<>
        {f.id && <ConfirmButton onConfirm={async () => { await deleteRow('coach_clients', f.id!); onSaved() }}>Elimina</ConfirmButton>}
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.name} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <Field label="Nome"><Input value={f.name || ''} onChange={e => set('name', e.target.value)} /></Field>
      <Field label="Contatto"><Input value={f.contact || ''} onChange={e => set('contact', e.target.value)} placeholder="Telefono o email" /></Field>
      <Field label="Tariffa a seduta (€)"><Input type="number" value={f.rate ?? ''} onChange={e => set('rate', e.target.value)} /></Field>
      <Field label="Note"><Textarea rows={2} value={f.notes || ''} onChange={e => set('notes', e.target.value)} /></Field>
      <label className="flex gap" style={{ gap: 8, fontSize: 13, cursor: 'pointer', marginTop: 4 }}>
        <input type="checkbox" checked={!!f.archived} onChange={e => set('archived', e.target.checked)} /> Cliente archiviato
      </label>
    </Modal>
  )
}

function LedgerForm({ value, uid, onClose, onSaved }: { value: Partial<CoachLedger>; uid?: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Partial<CoachLedger>>(value)
  const [busy, setBusy] = useState(false)
  const set = (k: keyof CoachLedger, v: any) => setF(p => ({ ...p, [k]: v }))
  const isIn = f.kind === 'entrata'

  async function save() {
    if (!f.amount || !f.entry_date) return
    setBusy(true)
    const payload = {
      kind: f.kind || 'entrata', amount: Number(f.amount), category: f.category || null,
      description: f.description || null, entry_date: f.entry_date,
    }
    if (f.id) await updateRow('coach_ledger', f.id, payload)
    else await insertRow('coach_ledger', { ...payload, trainer_id: uid })
    setBusy(false); onSaved()
  }

  return (
    <Modal title={isIn ? 'Nuova entrata' : 'Nuova uscita'} onClose={onClose}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Annulla</button>
        <button className="btn btn-primary" disabled={busy || !f.amount} onClick={save}>{busy ? 'Salvo…' : 'Salva'}</button>
      </>}>
      <div className="grid g2" style={{ gap: 10 }}>
        <Field label="Importo (€)"><Input type="number" value={f.amount ?? ''} onChange={e => set('amount', e.target.value)} /></Field>
        <Field label="Data"><Input type="date" value={f.entry_date || ''} onChange={e => set('entry_date', e.target.value)} /></Field>
      </div>
      <Field label="Categoria">
        <Select value={f.category || ''} onChange={e => set('category', e.target.value)}>
          <option value="">— nessuna —</option>
          {(isIn ? ['Seduta', 'Programma', 'Consulenza', 'Altro'] : ['Attrezzatura', 'Palestra', 'Trasferte', 'Formazione', 'Tasse', 'Altro'])
            .map(c => <option key={c} value={c}>{c}</option>)}
        </Select>
      </Field>
      <Field label="Descrizione"><Input value={f.description || ''} onChange={e => set('description', e.target.value)} /></Field>
    </Modal>
  )
}
